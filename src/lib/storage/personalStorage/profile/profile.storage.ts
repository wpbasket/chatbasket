import { Platform } from 'react-native';

const DB_NAME = 'ProfileStorage';
const DB_VERSION = 1;
const STORE_NAME = 'media';
const AVATAR_KEY = 'ME_PROFILE_AVATAR';

let dbPromise: Promise<IDBDatabase> | null = null;
let dbInstance: IDBDatabase | null = null;

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
        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(request.result);
        };
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

/**
 * Deletes all avatar blobs for a specific user ID from ProfileStorage.
 */
export async function deleteProfileAvatarsByUserId(userId: string): Promise<void> {
    if (Platform.OS !== 'web') return;

    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.openCursor();
        
        request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
                if (typeof cursor.key === 'string' && cursor.key.startsWith(`${userId}_`)) {
                    cursor.delete();
                }
                cursor.continue();
            } else {
                resolve();
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Deletes the full ProfileStorage IndexedDB.
 * Used on logout + logged-out boot safety cleanup.
 */
export async function clearAllProfileStorage(): Promise<void> {
    if (Platform.OS !== 'web') return;

    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
    dbPromise = null;

    await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
    });
}
