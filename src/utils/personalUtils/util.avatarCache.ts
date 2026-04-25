import { Platform } from 'react-native';
import { updateChatCachedAvatarFileIdByUserId } from '@/lib/storage/personalStorage/chat/chat.storage';
import { getProfileAvatarBlob } from '@/lib/storage/personalStorage/profile/profile.storage';
import { fetchAvatarBlob, saveAvatarToIDB, saveAvatarToFS, deleteAvatarLocally, getLocalAvatarUri } from './util.avatarCommon';
import { $chatListState } from '@/state/personalState/chat/personal.state.chat';
import { $contactsState, $contactRequestsState } from '@/state/personalState/contacts/personal.state.contacts';

const NATIVE_AVATAR_DIR = 'profiles/others';
const pendingDownloads = new Map<string, Promise<string | null>>();

export interface AvatarResolution {
  uri: string | null;
  needsDownload: boolean;
}

// ============================================================================
// Cross-Context Cache ID Lookup
// A single userId may appear in Chat list, Contacts, Contact Requests, etc.
// The avatar file is identical across all of them (same userId → same fileId).
// This function checks ALL state modules to find the latest cached version.
// ============================================================================

function findCachedFileIdAcrossStates(userId: string): string | null {
  // 1. Check Chat state — chatsById is keyed by chat_id, so iterate to match other_user_id
  const chatsById = $chatListState.chatsById.peek();
  if (chatsById) {
    for (const chatId of Object.keys(chatsById)) {
      const chat = chatsById[chatId];
      if (chat?.other_user_id === userId && chat?.cached_avatar_file_id) {
        return chat.cached_avatar_file_id;
      }
    }
  }

  // 2. Check Contacts state (camelCase model)
  const contact = $contactsState.contactsById.peek()?.[userId];
  if (contact?.cachedAvatarFileId) return contact.cachedAvatarFileId;

  // 3. Check addedYou in Contacts
  const addedYou = $contactsState.addedYouById.peek()?.[userId];
  if (addedYou?.cachedAvatarFileId) return addedYou.cachedAvatarFileId;

  // 4. Check Contact Requests — pending
  const pending = $contactRequestsState.pendingById.peek()?.[userId];
  if (pending?.cachedAvatarFileId) return pending.cachedAvatarFileId;

  // 5. Check Contact Requests — sent
  const sent = $contactRequestsState.sentById.peek()?.[userId];
  if (sent?.cachedAvatarFileId) return sent.cachedAvatarFileId;

  return null;
}

/**
 * Harmonized Avatar Resolver
 * Determines if we can use a local cache or if we need to show the server URL and download.
 * Checks ALL state modules (Chat, Contacts, Contact Requests) for cross-context awareness.
 */
export async function resolveAvatarUri(
  userId: string,
  serverUrl: string | null,
  serverFileId: string | null,
  cachedFileId: string | null
): Promise<AvatarResolution> {
  // 1. No avatar on server (or restricted by privacy circuit breaker)
  if (!serverUrl || !serverFileId) {
    // If we have a local cache marker, we should proactively clean it up
    const effectiveCachedId = cachedFileId || findCachedFileIdAcrossStates(userId);
    if (effectiveCachedId) {
      console.log(`[AvatarCache] ${userId} Server has no avatar (or restricted), cleaning up stale local cache`);
      // Async cleanup without blocking the return
      (async () => {
        await deleteAvatarLocally(userId, false);
        $chatListState.updateCachedAvatarFileId(userId, null);
        $contactsState.updateCachedAvatarFileId(userId, null);
        $contactRequestsState.updateCachedAvatarFileId(userId, null);
        await updateChatCachedAvatarFileIdByUserId(userId, null);
      })();
    }
    return { uri: null, needsDownload: false };
  }

  // 2. Determine the effective cached ID: use caller's prop, or cross-check all states
  const effectiveCachedId = cachedFileId || findCachedFileIdAcrossStates(userId);

  // 3. Check if cached version matches server version
  if (effectiveCachedId === serverFileId) {
    const localUri = await getLocalAvatarUri(userId);
    if (localUri) {
      console.log(`[AvatarCache] ${userId} CACHE_HIT (match: ${serverFileId})`);
      return { uri: localUri, needsDownload: false };
    }
    console.log(`[AvatarCache] ${userId} CACHE_MISS (ID matches but file missing)`);
  } else {
    console.log(`[AvatarCache] ${userId} VERSION_MISMATCH (Server: ${serverFileId}, Local: ${effectiveCachedId})`);
  }

  // 4. Mismatch or missing file -> Show server URL but trigger download
  return {
    uri: serverUrl,
    needsDownload: true
  };
}

/**
 * Downloads and persists an avatar, then updates the local DB version marker.
 * 
 * Smart pre-flight checks:
 * 1. Deduplicates concurrent requests via a Promise Map (synchronous registration).
 * 2. Before fetching from network, checks if the file ALREADY exists locally
 *    (may have been downloaded by another context since resolveAvatarUri ran).
 */
export function downloadAndCacheAvatar(
  userId: string,
  url: string,
  fileId: string
): Promise<string | null> {
  // 1. Check if a download is already in progress for this user
  const existingDownload = pendingDownloads.get(userId);
  if (existingDownload) {
    console.log(`[AvatarCache] ${userId} - Joining existing download task`);
    return existingDownload;
  }

  // 2. Create a "Deferred" promise and register it IMMEDIATELY and synchronously.
  let resolveTask!: (val: string | null) => void;
  const downloadPromise = new Promise<string | null>((resolve) => {
    resolveTask = resolve;
  });

  pendingDownloads.set(userId, downloadPromise);

  // 3. Kick off the actual asynchronous work
  (async () => {
    try {
      // PRE-FLIGHT CHECK: Before hitting the network, check if the file
      // ALREADY exists locally. This is more robust than checking state markers,
      // because state can be wiped when the server refreshes overwrite local-only
      // fields (e.g. navigating to Contacts tab triggers setContacts() with
      // server data that has no cachedAvatarFileId).
      const existingLocalUri = await getLocalAvatarUri(userId);
      if (existingLocalUri) {
        console.log(`[AvatarCache] ${userId} PRE-FLIGHT HIT — file already exists locally, skipping network fetch`);
        // Re-sync the markers since they may have been wiped by a server refresh
        await updateChatCachedAvatarFileIdByUserId(userId, fileId);
        $chatListState.updateCachedAvatarFileId(userId, fileId);
        $contactsState.updateCachedAvatarFileId(userId, fileId);
        $contactRequestsState.updateCachedAvatarFileId(userId, fileId);
        resolveTask(existingLocalUri);
        return;
      }

      // Use shared utilities for fetching and persisting
      const blob = await fetchAvatarBlob(url);
      let localUri: string | null = null;

      if (Platform.OS === 'web') {
        localUri = await saveAvatarToIDB(blob, userId);
        console.log(`[AvatarCache] ${userId} stored to IndexedDB`);
      } else {
        localUri = await saveAvatarToFS(blob, NATIVE_AVATAR_DIR, `${userId}.jpg`);
        console.log(`[AvatarCache] ${userId} stored to FileSystem: ${localUri}`);
      }

      // Update DB marker so next time we know this version is cached
      await updateChatCachedAvatarFileIdByUserId(userId, fileId);
      console.log(`[AvatarCache] ${userId} DB marker updated to ${fileId}`);

      // Update in-memory state for immediate reactive UI update across ALL screens
      $chatListState.updateCachedAvatarFileId(userId, fileId);
      $contactsState.updateCachedAvatarFileId(userId, fileId);
      $contactRequestsState.updateCachedAvatarFileId(userId, fileId);

      resolveTask(localUri);
    } catch (err) {
      console.error(`[AvatarCache] Failed for ${userId}:`, err);
      resolveTask(null);
    } finally {
      // Always remove the task from the map when finished
      pendingDownloads.delete(userId);
    }
  })();

  return downloadPromise;
}


