// lib/storage/personalStorage/chat/chat.storage.web.ts

import type { ChatEntry, MessageEntry } from '@/lib/personalLib';
import type { LocalChatEntry, LocalMessageEntry } from './chat.storage.schema';
import { normalizeChatEntries } from './chat.storage.normalize';

// ─── Encryption Layer (matches WebVault from storage.wrapper.ts) ────────────

const VAULT_DB_NAME = 'ChatStorageVault';
const VAULT_STORE = 'Keys';
const VAULT_KEY_NAME = 'ChatMasterKey';

let cryptoKey: CryptoKey | null = null;

async function getOrCreateKey(): Promise<CryptoKey> {
    if (cryptoKey) return cryptoKey;

    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB not supported'));

        const request = indexedDB.open(VAULT_DB_NAME, 1);
        request.onupgradeneeded = () => { request.result.createObjectStore(VAULT_STORE); };
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(VAULT_STORE, 'readwrite');
            const store = tx.objectStore(VAULT_STORE);
            const getReq = store.get(VAULT_KEY_NAME);

            getReq.onsuccess = async () => {
                if (getReq.result) {
                    cryptoKey = getReq.result;
                    resolve(cryptoKey!);
                } else {
                    try {
                        const key = await window.crypto.subtle.generateKey(
                            { name: 'AES-GCM', length: 256 },
                            false, // non-extractable
                            ['encrypt', 'decrypt']
                        );
                        store.put(key, VAULT_KEY_NAME);
                        cryptoKey = key;
                        resolve(key);
                    } catch (e) { reject(e); }
                }
            };
            getReq.onerror = () => reject(getReq.error);
        };
        request.onerror = () => reject(request.error);
    });
}

async function encrypt(data: string): Promise<ArrayBuffer> {
    const key = await getOrCreateKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    // Pack iv + ciphertext into one ArrayBuffer
    const packed = new Uint8Array(12 + ciphertext.byteLength);
    packed.set(iv, 0);
    packed.set(new Uint8Array(ciphertext), 12);
    return packed.buffer;
}

async function decrypt(packed: ArrayBuffer): Promise<string> {
    const key = await getOrCreateKey();
    const arr = new Uint8Array(packed);
    const iv = arr.slice(0, 12);
    const ciphertext = arr.slice(12);
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
}

// ─── IndexedDB Data Store ───────────────────────────────────────────────────

const DATA_DB_NAME = 'ChatStorage';
const DATA_DB_VERSION = 3;  // v3: add chats store for chat-list persistence
const MESSAGES_STORE = 'messages';
const CHATS_STORE = 'chats';
const MEDIA_STORE = 'media';  // File blobs (per §8.6.3 / §8.5.7)
// NOTE: No separate outbox store — outbox is a logical query on MESSAGES_STORE
// (WHERE status IN ('pending','sending') AND is_from_me = true)
// This is the industry-standard pattern (Signal, WhatsApp, Telegram).

let dataDb: IDBDatabase | null = null;

function openDataDb(): Promise<IDBDatabase> {
    if (dataDb) return Promise.resolve(dataDb);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATA_DB_NAME, DATA_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;

            // Messages store — keyed by message_id
            if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
                const msgStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'message_id' });
                msgStore.createIndex('idx_chat_id', 'chat_id', { unique: false });
                msgStore.createIndex('idx_status', 'status', { unique: false });
                msgStore.createIndex('idx_temp_id', 'temp_id', { unique: false });
                msgStore.createIndex('idx_created_at', 'created_at', { unique: false });
            }

            if (!db.objectStoreNames.contains(CHATS_STORE)) {
                const chatStore = db.createObjectStore(CHATS_STORE, { keyPath: 'chat_id' });
                chatStore.createIndex('idx_activity', 'activity_at', { unique: false });
            } else {
                const chatStore = request.transaction!.objectStore(CHATS_STORE);
                if (!chatStore.indexNames.contains('idx_activity')) {
                    chatStore.createIndex('idx_activity', 'activity_at', { unique: false });
                }
            }

            // Media file store — keyed by message_id
            // Stores encrypted file blobs for offline access (not a cache — files persist until logout)
            if (!db.objectStoreNames.contains(MEDIA_STORE)) {
                const mediaStore = db.createObjectStore(MEDIA_STORE, { keyPath: 'message_id' });
                mediaStore.createIndex('idx_stored_at', 'stored_at', { unique: false });
            } else {
                // v2 upgrade: rename index from cached_at → stored_at
                const mediaStore = request.transaction!.objectStore(MEDIA_STORE);
                if (mediaStore.indexNames.contains('idx_cached_at')) {
                    mediaStore.deleteIndex('idx_cached_at');
                    mediaStore.createIndex('idx_stored_at', 'stored_at', { unique: false });
                }
            }
        };
        request.onsuccess = () => { dataDb = request.result; resolve(dataDb); };
        request.onerror = () => reject(request.error);
    });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Serialize a LocalMessageEntry → encrypted ArrayBuffer for storage */
async function encryptEntry(entry: LocalMessageEntry): Promise<{ message_id: string; chat_id: string; status: string; temp_id: string | null; created_at: string; expires_at: string | null; deleted_for_me: boolean; is_from_me: boolean; blob: ArrayBuffer }> {
    const blob = await encrypt(JSON.stringify(entry));
    // Index fields stored unencrypted for IDB queries
    return {
        message_id: entry.message_id,
        chat_id: entry.chat_id,
        status: entry.status,
        temp_id: entry.temp_id,
        created_at: entry.created_at,
        expires_at: entry.expires_at,
        deleted_for_me: entry.deleted_for_me,
        is_from_me: entry.is_from_me,
        blob,
    };
}

/** Decrypt an encrypted IDB record → LocalMessageEntry */
async function decryptEntry(record: any): Promise<LocalMessageEntry> {
    const json = await decrypt(record.blob);
    return JSON.parse(json) as LocalMessageEntry;
}

async function encryptChatEntry(entry: LocalChatEntry): Promise<{ chat_id: string; activity_at: string; blob: ArrayBuffer }> {
    const blob = await encrypt(JSON.stringify(entry));
    return {
        chat_id: entry.chat_id,
        activity_at: entry.last_message_created_at || entry.created_at,
        blob,
    };
}

async function decryptChatEntry(record: any): Promise<LocalChatEntry> {
    const json = await decrypt(record.blob);
    return JSON.parse(json) as LocalChatEntry;
}

function messageToLocal(message: MessageEntry & { tempId?: string; localUri?: string }): LocalMessageEntry {
    return {
        message_id: message.message_id,
        chat_id: message.chat_id,
        recipient_id: message.recipient_id,
        content: message.content || null,
        message_type: message.message_type as any,
        status: (message.status || 'sent') as any,
        is_from_me: !!message.is_from_me,
        delivered_to_recipient: !!message.delivered_to_recipient,
        delivered_to_recipient_primary: !!(message as any).delivered_to_recipient_primary,
        synced_to_sender_primary: !!message.synced_to_sender_primary,
        created_at: message.created_at,
        expires_at: message.expires_at || null,
        file_id: message.file_id || null,
        file_name: message.file_name || null,
        file_size: message.file_size ?? null,
        file_mime_type: message.file_mime_type || null,
        view_url: message.view_url ?? null,
        download_url: message.download_url ?? null,
        file_token_expiry: message.file_token_expiry || null,
        local_uri: (message as any).local_uri ?? message.localUri ?? null,
        temp_id: (message as any).temp_id ?? message.tempId ?? null,
        acked_by_server: !!message.acked_by_server,
        deleted_for_me: !!message.deleted_for_me,
        retry_count: 0,
        last_retry_at: null,
        error_message: null,
        error_is_blocking: null,
        inserted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
}

// ─── Per-message write mutex ────────────────────────────────────────────────
// Serializes read-modify-write operations on the SAME message_id.
// Different message IDs are fully concurrent (no global bottleneck).
// This prevents TOCTOU / lost-update races caused by the split IDB transactions
// (read+decrypt in one tx, encrypt+write in another) required by async crypto.subtle.

const _messageLocks = new Map<string, Promise<void>>();

function withMessageLock<T>(messageId: string, fn: () => Promise<T>): Promise<T> {
    const prev = _messageLocks.get(messageId) ?? Promise.resolve();
    const next = prev.then(fn, fn); // run fn after prev settles (success or failure)
    // Store the void-projected chain so the next caller waits for us
    const tail = next.then(() => { }, () => { });
    _messageLocks.set(messageId, tail);
    // Clean up the map entry once the chain is idle (prevents unbounded growth)
    tail.then(() => {
        if (_messageLocks.get(messageId) === tail) {
            _messageLocks.delete(messageId);
        }
    });
    return next;
}

// ─── IDB transaction helpers ────────────────────────────────────────────────

function idbPut(store: IDBObjectStore, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = store.put(value);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

function idbGet<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
    });
}

function idbGetAll<T>(index: IDBIndex | IDBObjectStore, query?: IDBValidKey | IDBKeyRange): Promise<T[]> {
    return new Promise((resolve, reject) => {
        const req = query !== undefined ? index.getAll(query) : index.getAll();
        req.onsuccess = () => resolve(req.result as T[]);
        req.onerror = () => reject(req.error);
    });
}

function idbCount(store: IDBObjectStore, query?: IDBValidKey | IDBKeyRange): Promise<number> {
    return new Promise((resolve, reject) => {
        const req = query !== undefined ? store.count(query) : store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function idbClear(store: IDBObjectStore): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function initChatStorage(): Promise<void> {
    console.log('[ChatStorage:Web] Initializing encrypted IndexedDB');
    await getOrCreateKey(); // warm up the encryption key
    await openDataDb();
    console.log('[ChatStorage:Web] Database initialized');
}

export async function insertMessage(message: MessageEntry & { tempId?: string; localUri?: string }): Promise<void> {
    const db = await openDataDb();
    const local = messageToLocal(message);
    const encrypted = await encryptEntry(local);
    const tx = db.transaction(MESSAGES_STORE, 'readwrite');
    await idbPut(tx.objectStore(MESSAGES_STORE), encrypted);
}

export async function insertMessages(messages: Array<MessageEntry & { tempId?: string; localUri?: string }>): Promise<void> {
    // Pre-encrypt ALL entries before opening the IDB transaction.
    // Awaiting crypto.subtle.encrypt() inside an open transaction causes auto-commit
    // (the event loop returns to the browser between IDB requests → TransactionInactiveError).
    const encrypted = await Promise.all(
        messages.map(msg => encryptEntry(messageToLocal(msg)))
    );
    const db = await openDataDb();
    const tx = db.transaction(MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGES_STORE);
    for (const entry of encrypted) {
        await idbPut(store, entry);
    }
}

function chatToLocal(chat: ChatEntry): LocalChatEntry {
    return {
        ...chat,
        avatar_url: chat.avatar_url ?? null,
        last_message_content: chat.last_message_content ?? null,
        last_message_created_at: chat.last_message_created_at ?? null,
        last_message_type: chat.last_message_type ?? null,
        last_message_sender_id: chat.last_message_sender_id ?? null,
        last_message_id: chat.last_message_id ?? null,
        last_message_is_unsent: !!chat.last_message_is_unsent,
        is_contactable: chat.is_contactable !== false,
    };
}

export async function insertChats(chats: ChatEntry[]): Promise<void> {
    const normalized = normalizeChatEntries(chats).map(chatToLocal);
    if (normalized.length === 0) return;
    const encrypted = await Promise.all(normalized.map(chat => encryptChatEntry(chat)));
    const db = await openDataDb();
    const tx = db.transaction(CHATS_STORE, 'readwrite');
    const store = tx.objectStore(CHATS_STORE);
    for (const entry of encrypted) {
        await idbPut(store, entry);
    }
}

export async function replaceChats(chats: ChatEntry[]): Promise<void> {
    const normalized = normalizeChatEntries(chats).map(chatToLocal);
    const encrypted = await Promise.all(normalized.map(chat => encryptChatEntry(chat)));
    const db = await openDataDb();
    const tx = db.transaction(CHATS_STORE, 'readwrite');
    const store = tx.objectStore(CHATS_STORE);
    await idbClear(store);
    for (const entry of encrypted) {
        await idbPut(store, entry);
    }
}

export async function getChats(): Promise<LocalChatEntry[]> {
    const db = await openDataDb();
    const tx = db.transaction(CHATS_STORE, 'readonly');
    const store = tx.objectStore(CHATS_STORE);
    const records = await idbGetAll<any>(store);
    const decrypted = await Promise.all(records.map(r => decryptChatEntry(r)));
    return decrypted.sort((a, b) => {
        const aTime = a.last_message_created_at || a.created_at;
        const bTime = b.last_message_created_at || b.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
}

export async function getMessagesByChat(chatId: string, limit: number = 50, offset: number = 0): Promise<LocalMessageEntry[]> {
    const db = await openDataDb();
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const index = tx.objectStore(MESSAGES_STORE).index('idx_chat_id');
    const records = await idbGetAll<any>(index, chatId);

    // Decrypt, filter deleted, sort by created_at DESC, paginate
    const decrypted = await Promise.all(records.map(r => decryptEntry(r)));
    return decrypted
        .filter(m => !m.deleted_for_me)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(offset, offset + limit);
}

async function updateMessageStatusUnlocked(messageId: string, updates: Partial<LocalMessageEntry>): Promise<void> {
    const db = await openDataDb();

    // Step 1: Read + decrypt OUTSIDE the write transaction.
    // crypto.subtle awaits release the event loop, causing IDB auto-commit (TransactionInactiveError).
    const readTx = db.transaction(MESSAGES_STORE, 'readonly');
    const record = await idbGet<any>(readTx.objectStore(MESSAGES_STORE), messageId);
    if (!record) return;

    const entry = await decryptEntry(record);
    Object.assign(entry, updates, { updated_at: new Date().toISOString() });
    const encrypted = await encryptEntry(entry);

    // Step 2: Write in a fresh transaction (synchronous — no crypto awaits)
    const writeTx = db.transaction(MESSAGES_STORE, 'readwrite');
    await idbPut(writeTx.objectStore(MESSAGES_STORE), encrypted);
}

export async function updateMessageStatus(messageId: string, updates: Partial<LocalMessageEntry>): Promise<void> {
    return withMessageLock(messageId, () => updateMessageStatusUnlocked(messageId, updates));
}

export async function swapTempIdToRealId(tempId: string, realId: string, updates?: Partial<LocalMessageEntry>): Promise<void> {
    return withMessageLock(tempId, () => withMessageLock(realId, async () => {
        const db = await openDataDb();

        // Step 1: Read + decrypt OUTSIDE the write transaction (crypto awaits cause auto-commit)
        const readTx = db.transaction(MESSAGES_STORE, 'readonly');
        const readStore = readTx.objectStore(MESSAGES_STORE);
        // Try temp_id index first; fall back to message_id (PK) for rows where temp_id is NULL
        const index = readStore.index('idx_temp_id');
        let records = await idbGetAll<any>(index, tempId);
        if (records.length === 0) {
            const byPk = await idbGet<any>(readStore, tempId);
            if (byPk) records = [byPk];
        }
        if (records.length === 0) return;

        const entry = await decryptEntry(records[0]);
        const oldMessageId = entry.message_id;

        // Prepare the updated entry
        entry.message_id = realId;
        entry.temp_id = null;
        entry.status = 'sent';
        entry.error_message = null;      // Clear error on successful send
        entry.error_is_blocking = null;  // Clear error flag on successful send
        entry.updated_at = new Date().toISOString();
        if (updates) Object.assign(entry, updates);
        const encrypted = await encryptEntry(entry);

        // Step 2: Delete old + insert new in a single synchronous write transaction
        const writeTx = db.transaction(MESSAGES_STORE, 'readwrite');
        const writeStore = writeTx.objectStore(MESSAGES_STORE);
        await new Promise<void>((resolve, reject) => {
            const delReq = writeStore.delete(oldMessageId);
            delReq.onsuccess = () => resolve();
            delReq.onerror = () => reject(delReq.error);
        });
        await idbPut(writeStore, encrypted);

        // Step 3: OMITTED (Phase D Optimization)
        // We intentionally DO NOT re-key the media blob from temp ID to real ID.
        // Retaining the original temp ID ensures the local_uri (e.g. idb://temp-12345)
        // remains valid for the UI, avoiding a very expensive ~100MB encrypted copy-and-delete.
        // cleanupMessageMedia() natively handles deleting by temp ID extracted from local_uri.
    }));
}

export async function deleteMessage(messageId: string): Promise<void> {
    await updateMessageStatus(messageId, { deleted_for_me: true });

    // Schedule a hard-delete and media cleanup 10 seconds after "Delete for me"
    setTimeout(() => {
        purgeDeletedMessages().catch(err => console.warn('[ChatStorage] Delayed purge failed', err));
    }, 10_000);
}

export async function getDeletedMessageIds(chatId: string): Promise<string[]> {
    const db = await openDataDb();
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const index = tx.objectStore(MESSAGES_STORE).index('idx_chat_id');
    const records = await idbGetAll<any>(index, chatId);
    // deleted_for_me is stored unencrypted — no decryption needed
    return records.filter(r => r.deleted_for_me === true).map(r => r.message_id);
}

export async function getLastMessageTimestamp(chatId?: string): Promise<string | null> {
    const db = await openDataDb();
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const store = tx.objectStore(MESSAGES_STORE);

    let records: any[];
    if (chatId) {
        const index = store.index('idx_chat_id');
        records = await idbGetAll<any>(index, chatId);
    } else {
        records = await idbGetAll<any>(store);
    }
    if (records.length === 0) return null;

    // Find max created_at from unencrypted index field
    let max = '';
    for (const r of records) {
        if (r.created_at > max) max = r.created_at;
    }
    return max || null;
}

export async function getPendingOutboxMessages(): Promise<LocalMessageEntry[]> {
    const db = await openDataDb();
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const store = tx.objectStore(MESSAGES_STORE);
    const all = await idbGetAll<any>(store);

    const results: LocalMessageEntry[] = [];
    for (const record of all) {
        if ((record.status === 'pending' || record.status === 'sending') && record.is_from_me && !record.deleted_for_me) {
            results.push(await decryptEntry(record));
        }
    }
    return results.sort((a, b) => a.inserted_at.localeCompare(b.inserted_at));
}

export async function getMessageByTempId(tempId: string): Promise<LocalMessageEntry | null> {
    const db = await openDataDb();
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const index = tx.objectStore(MESSAGES_STORE).index('idx_temp_id');
    const records = await idbGetAll<any>(index, tempId);
    if (records.length === 0) return null;
    return decryptEntry(records[0]);
}

export async function messageExists(messageId: string): Promise<boolean> {
    const db = await openDataDb();
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const record = await idbGet<any>(tx.objectStore(MESSAGES_STORE), messageId);
    return !!record;
}

/**
 * Get message counts per chat_id from IndexedDB.
 * Only counts non-deleted messages (deleted_for_me !== true).
 * Uses unencrypted index fields — no decryption needed.
 */
export async function getMessageCountsByChatId(): Promise<Record<string, number>> {
    const db = await openDataDb();
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const store = tx.objectStore(MESSAGES_STORE);
    const all = await idbGetAll<any>(store);
    const result: Record<string, number> = {};
    for (const r of all) {
        if (r.deleted_for_me === true) continue;
        result[r.chat_id] = (result[r.chat_id] || 0) + 1;
    }
    return result;
}

/**
 * Wipe all chat-related data from IndexedDB — called on LOGOUT and on
 * fresh boot when user is not logged in (safety net).
 *
 * Deletes:
 *   - ChatStorage        (current messages + media)
 *   - ChatStorageVault   (current encryption keys)
 *   - chatbasket_chat    (legacy database from previous versions)
 *   - Any other unknown chat-related databases (discovered dynamically)
 */
export async function clearAllChatStorage(): Promise<void> {
    // Close the open connection so deleteDatabase can proceed
    if (dataDb) {
        dataDb.close();
        dataDb = null;
    }
    cryptoKey = null;

    // Known databases to delete (current + legacy)
    const knownDbNames = [
        DATA_DB_NAME,       // 'ChatStorage'
        VAULT_DB_NAME,      // 'ChatStorageVault'
        'chatbasket_chat',  // Legacy database from previous version
    ];

    // If the browser supports indexedDB.databases(), also discover unknown leftovers
    if (typeof indexedDB.databases === 'function') {
        try {
            const allDbs = await indexedDB.databases();
            for (const db of allDbs) {
                if (db.name && (
                    db.name.toLowerCase().includes('chat') ||
                    db.name.toLowerCase().includes('media')
                )) {
                    if (!knownDbNames.includes(db.name)) {
                        knownDbNames.push(db.name);
                    }
                }
            }
        } catch {
            // indexedDB.databases() not supported — fall through to known list
        }
    }

    // Delete all discovered databases
    for (const dbName of knownDbNames) {
        await new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(dbName);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();   // Non-critical
            req.onblocked = () => resolve(); // Don't block logout
        });
    }

    console.log(`[ChatStorage:Web] Cleaned up ${knownDbNames.length} database(s):`, knownDbNames);
}

// In-memory counter for failed inserts (reset on app restart — diagnostic only)
let _failedInserts = 0;
export function recordFailedInsert() { _failedInserts++; }

export async function getStorageStats(): Promise<{ totalMessages: number; pendingMessages: number; chatsCount: number; failedInserts: number }> {
    const db = await openDataDb();
    const tx = db.transaction([MESSAGES_STORE, CHATS_STORE], 'readonly');
    const messageStore = tx.objectStore(MESSAGES_STORE);
    const chatStore = tx.objectStore(CHATS_STORE);
    const all = await idbGetAll<any>(messageStore);
    const chatsCount = await idbCount(chatStore);

    let total = 0;
    let pending = 0;
    for (const r of all) {
        if (!r.deleted_for_me) total++;
        if (r.status === 'pending' || r.status === 'sending') pending++;
    }
    return { totalMessages: total, pendingMessages: pending, chatsCount, failedInserts: _failedInserts };
}

// ─── Media Blob Storage (per §8.6.3 / §8.5.7) ─────────────────────────────

/**
 * Store media file blob in encrypted IndexedDB.
 * Web equivalent of native File.downloadFileAsync → Paths.document/chatFiles/
 */
export async function storeMediaBlob(
    messageId: string,
    blob: Blob,
    mimeType: string,
    fileName: string
): Promise<void> {
    const db = await openDataDb();
    // Encrypt the blob as ArrayBuffer
    const arrayBuf = await blob.arrayBuffer();
    const encryptedData = await encrypt(
        JSON.stringify({ mimeType, fileName, size: blob.size })
    );
    // Store encrypted metadata + raw encrypted blob
    const key = await getOrCreateKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedBlob = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, arrayBuf
    );
    const packedBlob = new Uint8Array(12 + encryptedBlob.byteLength);
    packedBlob.set(iv, 0);
    packedBlob.set(new Uint8Array(encryptedBlob), 12);

    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    await idbPut(tx.objectStore(MEDIA_STORE), {
        message_id: messageId,
        blob: packedBlob.buffer,
        meta: encryptedData,
        stored_at: new Date().toISOString(),
    });
}

/**
 * Retrieve decrypted media blob from IndexedDB.
 */
export async function getMediaBlob(
    messageId: string
): Promise<{ blob: Blob; mimeType: string; fileName: string } | null> {
    const db = await openDataDb();
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const record = await idbGet<any>(tx.objectStore(MEDIA_STORE), messageId);
    if (!record) return null;

    // Decrypt metadata
    const metaJson = await decrypt(record.meta);
    const meta = JSON.parse(metaJson) as { mimeType: string; fileName: string; size: number };

    // Decrypt blob
    const key = await getOrCreateKey();
    const arr = new Uint8Array(record.blob);
    const iv = arr.slice(0, 12);
    const ciphertext = arr.slice(12);
    const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv }, key, ciphertext
    );

    return {
        blob: new Blob([decrypted], { type: meta.mimeType }),
        mimeType: meta.mimeType,
        fileName: meta.fileName,
    };
}

/**
 * Delete media blob for a specific message.
 */
export async function deleteMediaBlob(messageId: string): Promise<void> {
    const db = await openDataDb();
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    await new Promise<void>((resolve, reject) => {
        const req = tx.objectStore(MEDIA_STORE).delete(messageId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

/**
 * Hard-delete all soft-deleted rows (deleted_for_me = true).
 * Called on a delay after boot so `getDeletedMessageIds` guards
 * have time to protect against resurrection during initial sync.
 */
export async function purgeDeletedMessages(): Promise<number> {
    const db = await openDataDb();
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const store = tx.objectStore(MESSAGES_STORE);
    const all = await idbGetAll<any>(store);
    const toDelete = all.filter(r => r.deleted_for_me === true).map(r => r.message_id);
    if (toDelete.length === 0) return 0;

    let purged = 0;
    for (const messageId of toDelete) {
        try {
            await withMessageLock(messageId, async () => {
                try {
                    await cleanupMessageMediaUnlocked(messageId);
                } catch (err) {
                    console.warn('[ChatStorage] Error cleaning up media for purged row', messageId, err);
                }

                const writeTx = db.transaction(MESSAGES_STORE, 'readwrite');
                await new Promise<void>((resolve, reject) => {
                    const req = writeTx.objectStore(MESSAGES_STORE).delete(messageId);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
                purged++;
            });
        } catch (err) {
            console.warn('[ChatStorage] Failed purging soft-deleted row', messageId, err);
        }
    }
    console.log(`[ChatStorage] Purged ${purged} soft-deleted row(s)`);
    return purged;
}

// ⛔ cleanupExpiredMediaBlobs() REMOVED (March 4, 2026)
// Retention policy: media blobs stored indefinitely. Deleted only on logout (clearAllChatStorage)
// or when user explicitly deletes a message (deleteMediaBlob). No TTL cleanup.

/**
 * Delete media blobs and clear file-related fields for the given message IDs.
 */
async function cleanupMessageMediaUnlocked(id: string): Promise<void> {
    // Try deleting blob by message_id (real ID)
    await deleteMediaBlob(id);

    // Also try deleting by temp ID extracted from local_uri (idb://<tempId>)
    // — sender's blob may still be keyed under the old temp ID
    const db = await openDataDb();
    const readTx = db.transaction(MESSAGES_STORE, 'readonly');
    const record = await idbGet<any>(readTx.objectStore(MESSAGES_STORE), id);
    if (record) {
        try {
            const entry = await decryptEntry(record);
            if (entry.local_uri?.startsWith('idb://')) {
                const tempKey = entry.local_uri.replace('idb://', '');
                if (tempKey !== id) {
                    await deleteMediaBlob(tempKey);
                }
            }
        } catch { /* ignore decrypt failures */ }
    }

    await updateMessageStatusUnlocked(id, {
        local_uri: null,
        view_url: null,
        download_url: null,
        file_id: null,
    } as any);
}

export async function cleanupMessageMedia(messageIds: string[]): Promise<void> {
    for (const id of messageIds) {
        try {
            await withMessageLock(id, () => cleanupMessageMediaUnlocked(id));
        } catch (err) {
            console.warn('[ChatStorage] cleanupMessageMedia failed for', id, err);
        }
    }
}

/**
 * Delete media blobs for messages that were unsent (message_type = 'unsent')
 * but whose media was not cleaned up (e.g. crash or interrupted unsend).
 */
export async function cleanupOrphanedMedia(): Promise<void> {
    const db = await openDataDb();

    // message_type, file_id, local_uri are inside the encrypted blob —
    // must decrypt each record to check.
    const msgTx = db.transaction(MESSAGES_STORE, 'readonly');
    const allRecords = await idbGetAll<any>(msgTx.objectStore(MESSAGES_STORE));

    const ids: string[] = [];
    const validMessageIds = new Set<string>();

    for (const record of allRecords) {
        validMessageIds.add(record.message_id);
        try {
            const entry = await decryptEntry(record);

            // Phase D: Also protect the tempId blob if local_uri still points to it
            if (entry.local_uri?.startsWith('idb://')) {
                const tempKey = entry.local_uri.replace('idb://', '');
                validMessageIds.add(tempKey);
            }

            // Race condition fix: Protect message_id (used as tempId) for pending/sending messages
            // This prevents cleanup from deleting blobs that are being uploaded but not yet in DB
            if (entry.status === 'pending' || entry.status === 'sending') {
                validMessageIds.add(entry.message_id);
            }

            if (entry.message_type === 'unsent' && (entry.file_id || entry.local_uri)) {
                ids.push(entry.message_id);
            }
        } catch { /* skip records that fail to decrypt */ }
    }
    if (ids.length > 0) {
        await cleanupMessageMedia(ids);
        console.log(`[ChatStorage] Cleaned up media for ${ids.length} unsent message(s)`);
    }

    // NEW: Clean up orphaned blobs in MEDIA_STORE (e.g. if message was purged but media deletion failed)
    try {
        const mediaTx = db.transaction(MEDIA_STORE, 'readonly');
        const mediaStore = mediaTx.objectStore(MEDIA_STORE);
        const mediaKeysReq = mediaStore.getAllKeys();
        const mediaKeys = await new Promise<any[]>((resolve, reject) => {
            mediaKeysReq.onsuccess = () => resolve(mediaKeysReq.result);
            mediaKeysReq.onerror = () => reject(mediaKeysReq.error);
        });

        const orphanedIds = mediaKeys.filter(key => !validMessageIds.has(key as string));
        for (const orphanId of orphanedIds) {
            await deleteMediaBlob(orphanId);
        }
        if (orphanedIds.length > 0) {
            console.log(`[ChatStorage] Cleaned up ${orphanedIds.length} orphaned media blob(s)`);
        }
    } catch (err) {
        console.warn('[ChatStorage] Error during orphaned media blob cleanup', err);
    }
}
