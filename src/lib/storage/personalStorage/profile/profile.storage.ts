import { Platform } from 'react-native';

const DB_NAME = 'ProfileStorage';
const DB_VERSION = 1;
const STORE_NAME = 'media';
const AVATAR_KEY = 'ME_PROFILE_AVATAR';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
    if (Platform.OS !== 'web') {
        throw new Error('IndexedDB is only available on web');
    }

    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return dbPromise;
}

/**
 * Stores a blob in the dedicated ProfileStorage IndexedDB.
 * Isolated from chat media storage.
 */
export async function storeProfileAvatarBlob(blob: Blob, key: string = AVATAR_KEY): Promise<void> {
    if (Platform.OS !== 'web') return;

    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(blob, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Retrieves the avatar blob from ProfileStorage.
 */
export async function getProfileAvatarBlob(key: string = AVATAR_KEY): Promise<Blob | null> {
    if (Platform.OS !== 'web') return null;

    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Deletes the avatar blob from ProfileStorage.
 */
export async function deleteProfileAvatarBlob(key: string = AVATAR_KEY): Promise<void> {
    if (Platform.OS !== 'web') return;

    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
