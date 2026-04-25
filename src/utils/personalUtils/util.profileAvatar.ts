import { Platform } from 'react-native';
import { PersonalProfileResponse } from "@/lib/personalLib";
import { $personalStateUser } from "@/state/personalState/user/personal.state.user";
import { getProfileAvatarBlob } from "@/lib/storage/personalStorage/profile/profile.storage";
import { fetchAvatarBlob, saveAvatarToIDB, saveAvatarToFS, deleteAvatarLocally } from "./util.avatarCommon";

const NATIVE_AVATAR_DIR = 'profiles';
const NATIVE_AVATAR_FILE = 'me_avatar.jpg';

// ─── Phase 1: Boot-time restoration (no network) ─────────────────────────────
// Called after loading saved profile from local storage.
// Checks if the avatar file exists locally and sets avatarUri immediately.

export async function restoreProfileAvatar() {
    const user = $personalStateUser.user.get();
    if (!user?.avatar_file_id) {
        console.log('[ProfileAvatar] No avatar_file_id, skipping restore');
        $personalStateUser.avatarUri.set(null);
        return;
    }

    const uri = await getExistingAvatarUri();
    console.log('[ProfileAvatar] Restore result:', uri ? 'SUCCESS' : 'CACHE_MISS');
    $personalStateUser.avatarUri.set(uri);
}

// ─── Phase 2: Sync after API fetch ────────────────────────────────────────────
// Called after fetching fresh profile from API.
// Compares the old persisted file ID with the new API file ID.
// Only downloads if they differ.

export async function syncProfileAvatar(
    newProfile: PersonalProfileResponse,
    oldFileId: string | null | undefined,
) {
    // No avatar on server → cleanup local
    if (!newProfile.avatar_url || !newProfile.avatar_file_id) {
        console.log('[ProfileAvatar] Server has no avatar, cleaning up local storage');
        await cleanupProfileAvatar();
        $personalStateUser.avatarUri.set(null);
        return;
    }

    // File ID hasn't changed → keep existing local cache
    if (oldFileId && oldFileId === newProfile.avatar_file_id) {
        const uri = await getExistingAvatarUri();
        if (uri) {
            console.log('[ProfileAvatar] File ID unchanged, keeping local cache:', uri);
            $personalStateUser.avatarUri.set(uri);
            return;
        }
        console.log('[ProfileAvatar] File ID matches but local file is missing, re-downloading');
    } else {
        console.log('[ProfileAvatar] File ID changed or fresh install, downloading new avatar');
    }

    // File ID changed OR file missing → download new FIRST, then cleanup old
    try {
        const localUri = await downloadAvatar(newProfile.avatar_url);
        if (localUri) {
            $personalStateUser.avatarUri.set(localUri);
        } else {
            console.log('[ProfileAvatar] Download returned null, falling back to server URL');
            $personalStateUser.avatarUri.set(newProfile.avatar_url);
        }
    } catch (err) {
        console.error('[ProfileAvatar] Failed to download avatar, falling back to server URL:', err);
        $personalStateUser.avatarUri.set(newProfile.avatar_url);
    }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Returns the local URI if the avatar file exists, null otherwise.
 * Web: checks IndexedDB → returns idb:// marker.
 * Native: checks filesystem → returns the real absolute file:// URI.
 */
async function getExistingAvatarUri(): Promise<string | null> {
    if (Platform.OS === 'web') {
        const blob = await getProfileAvatarBlob();
        return blob ? 'idb://ME_PROFILE_AVATAR' : null;
    } else {
        const { File, Directory, Paths } = await import('expo-file-system');
        const profileDir = new Directory(Paths.document, NATIVE_AVATAR_DIR);
        const avatarFile = new File(profileDir, NATIVE_AVATAR_FILE);
        return avatarFile.exists ? avatarFile.uri : null;
    }
}

async function cleanupProfileAvatar() {
    await deleteAvatarLocally('ME_PROFILE_AVATAR', true);
}

async function downloadAvatar(url: string): Promise<string | null> {
    try {
        const blob = await fetchAvatarBlob(url);

        if (Platform.OS === 'web') {
            const uri = await saveAvatarToIDB(blob, 'ME_PROFILE_AVATAR');
            console.log('[ProfileAvatar] Downloaded and stored to ProfileStorage:', uri);
            return uri;
        } else {
            const uri = await saveAvatarToFS(blob, NATIVE_AVATAR_DIR, NATIVE_AVATAR_FILE);
            console.log('[ProfileAvatar] Downloaded and stored to Native storage:', uri);
            return uri;
        }
    } catch (err) {
        console.error('[ProfileAvatar] Failed to download avatar:', err);
        return null;
    }
}
