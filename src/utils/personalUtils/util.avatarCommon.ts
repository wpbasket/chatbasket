import { Platform } from 'react-native';
import { storeProfileAvatarBlob } from '@/lib/storage/personalStorage/profile/profile.storage';

/**
 * Shared utility to fetch an avatar with a cache-buster.
 * Uses a "Bare Fetch" to avoid CORS preflight issues on Appwrite Cloud.
 */
/**
 * Shared utility to fetch an avatar.
 * - Web: Uses modern fetch() to get a Blob.
 * - Native: Uses XMLHttpRequest with arraybuffer (the "Chat way") for maximum stability and performance.
 */
export async function fetchAvatarBlob(url: string): Promise<Blob | Uint8Array> {
    console.log('[AvatarCommon] Fetching:', url);

    if (Platform.OS === 'web') {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} downloading avatar`);
        return await response.blob();
    } else {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            xhr.timeout = 10000;

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(new Uint8Array(xhr.response));
                } else {
                    reject(new Error(`HTTP ${xhr.status} downloading avatar`));
                }
            };
            xhr.onerror = () => reject(new Error('Network request failed'));
            xhr.ontimeout = () => reject(new Error('Request timed out'));
            xhr.send();
        });
    }
}

/**
 * Shared utility to save an avatar (Blob or Uint8Array) to IndexedDB (Web).
 */
export async function saveAvatarToIDB(data: Blob | Uint8Array, key: string, fileId?: string): Promise<string> {
    if (Platform.OS !== 'web') throw new Error('saveAvatarToIDB is web-only');
    
    // Replace colons with underscores to avoid filesystem/URI issues
    const safeFileId = fileId ? fileId.replace(/:/g, '_') : '';
    const uniqueKey = fileId ? `${key}_${safeFileId}` : key;
    
    console.log(`[AvatarCommon] Saving to IDB with key: ${uniqueKey}`);
    const blob = data instanceof Uint8Array ? new Blob([data as any]) : data;
    await storeProfileAvatarBlob(blob, uniqueKey);
    return `idb://${uniqueKey}?t=${Date.now()}`;
}

/**
 * Shared utility to save an avatar (Blob or Uint8Array) to the native filesystem.
 */
export async function saveAvatarToFS(data: Blob | Uint8Array, directory: string, filename: string, fileId?: string): Promise<string> {
    if (Platform.OS === 'web') throw new Error('saveAvatarToFS is native-only');
    
    // Convert e.g. "uuid.jpg" to "uuid_fileId.jpg" if fileId is provided
    let newFilename = filename;
    if (fileId) {
        const safeFileId = fileId.replace(/:/g, '_');
        const baseName = filename.replace('.jpg', '');
        newFilename = `${baseName}_${safeFileId}.jpg`;
    }
    
    console.log(`[AvatarCommon] Saving to FS: ${directory}/${newFilename}`);

    const { File, Directory, Paths } = await import('expo-file-system');
    const dir = new Directory(Paths.document, directory);
    if (!dir.exists) {
        dir.create({ intermediates: true });
    }
    const avatarFile = new File(dir, newFilename);
    
    if (avatarFile.exists) {
        try { avatarFile.delete(); } catch (e) { /* ignore */ }
    }

    let uint8Array: Uint8Array;
    if (data instanceof Uint8Array) {
        uint8Array = data;
    } else {
        // Fallback for Blobs if any still exist
        const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = reject;
            reader.readAsArrayBuffer(data);
        });
        uint8Array = new Uint8Array(arrayBuffer);
    }
    
    avatarFile.write(uint8Array);
    console.log(`[AvatarCommon] Stored to FS: ${avatarFile.uri}`);
    return `${avatarFile.uri}?t=${Date.now()}`;
}
/**
 * Shared utility to delete an avatar blob from local storage.
 * If fileId is provided, deletes that specific version.
 * If fileId is omitted, deletes ALL avatar versions for that user.
 */
export async function deleteAvatarLocally(key: string, isMe: boolean = false, fileId?: string): Promise<void> {
    console.log(`[AvatarCommon] Deleting local avatar for key: ${key} (fileId: ${fileId}) (isMe: ${isMe})`);
    if (Platform.OS === 'web') {
        const { deleteProfileAvatarBlob, deleteProfileAvatarsByUserId } = await import('@/lib/storage/personalStorage/profile/profile.storage');
        
        if (fileId) {
            const safeFileId = fileId.replace(/:/g, '_');
            const uniqueKey = `${key}_${safeFileId}`;
            await deleteProfileAvatarBlob(uniqueKey);
            console.log(`[AvatarCommon] Deleted from IDB: ${uniqueKey}`);
        } else {
            await deleteProfileAvatarsByUserId(key);
            console.log(`[AvatarCommon] Deleted all versions from IDB for: ${key}`);
        }
    } else {
        try {
            const { File, Directory, Paths } = await import('expo-file-system');
            const directory = isMe ? 'profiles' : 'profiles/others';
            const dir = new Directory(Paths.document, directory);
            
            if (fileId) {
                const safeFileId = fileId.replace(/:/g, '_');
                const filename = isMe ? `me_avatar_${safeFileId}.jpg` : `${key}_${safeFileId}.jpg`;
                const avatarFile = new File(dir, filename);
                if (avatarFile.exists) {
                    avatarFile.delete();
                    console.log(`[AvatarCommon] Deleted from FS: ${avatarFile.uri}`);
                } else {
                    console.log(`[AvatarCommon] File not found in FS, nothing to delete: ${filename}`);
                }
            } else {
                // Delete all versions for this user
                const prefix = isMe ? 'me_avatar_' : `${key}_`;
                if (dir.exists) {
                    const files = dir.list();
                    for (const file of files) {
                        if (file.name.startsWith(prefix)) {
                            file.delete();
                            console.log(`[AvatarCommon] Deleted from FS (wildcard): ${file.uri}`);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[AvatarCommon] Failed to delete local avatar:', e);
        }
    }
}
/**
 * Shared utility to get the local URI of an avatar if it exists.
 */
export async function getLocalAvatarUri(userId: string, fileId: string): Promise<string | null> {
    const safeFileId = fileId.replace(/:/g, '_');
    if (Platform.OS === 'web') {
        const { getProfileAvatarBlob } = await import('@/lib/storage/personalStorage/profile/profile.storage');
        const uniqueKey = `${userId}_${safeFileId}`;
        const blob = await getProfileAvatarBlob(uniqueKey);
        return blob ? `idb://${uniqueKey}` : null;
    } else {
        try {
            const { File, Directory, Paths } = await import('expo-file-system');
            const directory = 'profiles/others';
            const dir = new Directory(Paths.document, directory);
            const avatarFile = new File(dir, `${userId}_${safeFileId}.jpg`);
            return avatarFile.exists ? avatarFile.uri : null;
        } catch {
            return null;
        }
    }
}
