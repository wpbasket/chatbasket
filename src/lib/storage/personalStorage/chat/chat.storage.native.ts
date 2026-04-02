// lib/storage/personalStorage/chat/chat.storage.native.ts

import * as SQLite from 'expo-sqlite';
import { File, Directory, Paths } from 'expo-file-system';
import type { ChatEntry, MessageEntry } from '@/lib/personalLib';
import type { LocalChatEntry, LocalMessageEntry } from './chat.storage.schema';
import { normalizeChatEntries } from './chat.storage.normalize';

const DB_NAME = 'chatMessages.db';
let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
    if (!db) throw new Error('[ChatStorage] Database not initialized');
    return db;
}

export async function initChatStorage(): Promise<void> {
    console.log('[ChatStorage:Native] Initializing SQLite database');
    db = await SQLite.openDatabaseAsync(DB_NAME);

    // Enable WAL mode for better concurrent read/write performance
    await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = 10000;
        PRAGMA busy_timeout = 5000;
    `);

    // Create tables
    await db.execAsync(`
        CREATE TABLE IF NOT EXISTS chats (
            chat_id TEXT PRIMARY KEY,
            other_user_id TEXT NOT NULL,
            other_user_name TEXT NOT NULL DEFAULT '',
            other_user_username TEXT NOT NULL DEFAULT '',
            avatar_url TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            other_user_last_read_at TEXT NOT NULL DEFAULT '',
            other_user_last_delivered_at TEXT NOT NULL DEFAULT '',
            last_message_content TEXT,
            last_message_created_at TEXT,
            last_message_type TEXT,
            last_message_is_from_me INTEGER NOT NULL DEFAULT 0,
            last_message_status TEXT NOT NULL DEFAULT 'sent',
            last_message_sender_id TEXT,
            last_message_id TEXT,
            last_message_is_unsent INTEGER NOT NULL DEFAULT 0,
            unread_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_chats_activity
            ON chats(COALESCE(last_message_created_at, created_at) DESC);

        CREATE TABLE IF NOT EXISTS messages (
            message_id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            recipient_id TEXT NOT NULL,
            content TEXT,
            message_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            is_from_me INTEGER NOT NULL DEFAULT 0,
            delivered_to_recipient INTEGER NOT NULL DEFAULT 0,
            delivered_to_recipient_primary INTEGER NOT NULL DEFAULT 0,
            synced_to_sender_primary INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            file_id TEXT,
            file_name TEXT,
            file_size INTEGER,
            file_mime_type TEXT,
            view_url TEXT,
            download_url TEXT,
            local_uri TEXT,
            temp_id TEXT,
            acked_by_server INTEGER NOT NULL DEFAULT 0,
            deleted_for_me INTEGER NOT NULL DEFAULT 0,
            retry_count INTEGER NOT NULL DEFAULT 0,
            last_retry_at TEXT,
            error_message TEXT,
            error_is_blocking INTEGER,
            inserted_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_messages_chat_id       ON messages(chat_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created_at    ON messages(chat_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_status        ON messages(status);
        CREATE INDEX IF NOT EXISTS idx_messages_temp_id       ON messages(temp_id) WHERE temp_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_messages_status_outbox ON messages(status) WHERE is_from_me = 1;
    `);

    console.log('[ChatStorage:Native] Database initialized');
}

/*
 * ⚠️ Schema Design Notes (March 3, 2026):
 * - `file_url` OMITTED: Runtime-resolved signed URL from backend — ephemeral, re-fetched on demand
 * - `progress` OMITTED: UI-only upload progress indicator — never persisted
 * - `is_unsent` OMITTED: Redundant with message_type === 'unsent' — derive at read time
 * - `delivered_to_recipient_primary` IS included (used for relay cleanup logic)
 * - `acked_by_server` and `deleted_for_me` are LOCAL-ONLY fields (not on MessageEntry type yet)
 * - `retry_count`, `last_retry_at`, `error_message` are OUTBOX RETRY fields — only meaningful
 *    for is_from_me messages. No separate outbox table (Signal/WhatsApp pattern — see Correction #36).
 * 
 * ⚠️ `addMessage` is async (resolves media URLs) — calling it inside batch() means the
 *    await is NOT honored. This is a pre-existing pattern in current code and is acceptable
 *    because resolveMediaUrls only mutates the entry in-place before the synchronous batch
 *    operations. Phase D does NOT change this behavior.
 */

export async function insertMessage(message: MessageEntry & { tempId?: string; localUri?: string }): Promise<void> {
    const d = getDb();
    await d.runAsync(
        `INSERT OR REPLACE INTO messages (
            message_id, chat_id, recipient_id, content, message_type,
            status, is_from_me, delivered_to_recipient, delivered_to_recipient_primary,
            synced_to_sender_primary, created_at, expires_at, file_id, file_name,
            file_size, file_mime_type, view_url, download_url, local_uri, temp_id,
            acked_by_server, deleted_for_me, retry_count, last_retry_at, error_message, error_is_blocking,
            inserted_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            message.message_id,
            message.chat_id,
            message.recipient_id,
            message.content || null,
            message.message_type,
            message.status || 'pending',
            message.is_from_me ? 1 : 0,
            message.delivered_to_recipient ? 1 : 0,
            (message as any).delivered_to_recipient_primary ? 1 : 0,
            message.synced_to_sender_primary ? 1 : 0,
            message.created_at,
            message.expires_at || null,
            message.file_id || null,
            message.file_name || null,
            message.file_size ?? null,
            message.file_mime_type || null,
            message.view_url ?? null,
            message.download_url ?? null,
            (message as any).local_uri ?? message.localUri ?? null,
            (message as any).temp_id ?? message.tempId ?? null,
            message.acked_by_server ? 1 : 0,
            message.deleted_for_me ? 1 : 0,
            0,    // retry_count — default 0
            null, // last_retry_at — default null
            null, // error_message — default null
            null, // error_is_blocking — default null
            new Date().toISOString(),
            new Date().toISOString()
        ]
    );
}

export async function insertMessages(messages: Array<MessageEntry & { tempId?: string; localUri?: string }>): Promise<void> {
    const d = getDb();
    await d.withTransactionAsync(async () => {
        for (const msg of messages) {
            await insertMessage(msg);
        }
    });
}

function chatBindings(chat: ChatEntry): any[] {
    return [
        chat.chat_id,
        chat.other_user_id,
        chat.other_user_name,
        chat.other_user_username,
        chat.avatar_url,
        chat.created_at,
        chat.updated_at,
        chat.other_user_last_read_at,
        chat.other_user_last_delivered_at,
        chat.last_message_content,
        chat.last_message_created_at,
        chat.last_message_type,
        chat.last_message_is_from_me ? 1 : 0,
        chat.last_message_status,
        chat.last_message_sender_id,
        chat.last_message_id,
        chat.last_message_is_unsent ? 1 : 0,
        chat.unread_count,
    ];
}

async function upsertChatRow(d: SQLite.SQLiteDatabase, chat: ChatEntry): Promise<void> {
    await d.runAsync(
        `INSERT OR REPLACE INTO chats (
            chat_id, other_user_id, other_user_name, other_user_username, avatar_url,
            created_at, updated_at, other_user_last_read_at, other_user_last_delivered_at,
            last_message_content, last_message_created_at, last_message_type,
            last_message_is_from_me, last_message_status, last_message_sender_id,
            last_message_id, last_message_is_unsent, unread_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        chatBindings(chat)
    );
}

export async function insertChats(chats: ChatEntry[]): Promise<void> {
    const normalized = normalizeChatEntries(chats);
    if (normalized.length === 0) return;
    const d = getDb();
    await d.withTransactionAsync(async () => {
        for (const chat of normalized) {
            await upsertChatRow(d, chat);
        }
    });
}

export async function replaceChats(chats: ChatEntry[]): Promise<void> {
    const normalized = normalizeChatEntries(chats);
    const d = getDb();
    await d.withTransactionAsync(async () => {
        await d.runAsync(`DELETE FROM chats`);
        for (const chat of normalized) {
            await upsertChatRow(d, chat);
        }
    });
}

export async function getChats(): Promise<LocalChatEntry[]> {
    const d = getDb();
    const rows = await d.getAllAsync<Record<string, any>>(
        `SELECT * FROM chats ORDER BY COALESCE(last_message_created_at, created_at) DESC`,
        []
    );
    return (rows || []).map(sqliteChatRowToLocal);
}

export async function getMessagesByChat(chatId: string, limit: number = 50, offset: number = 0): Promise<LocalMessageEntry[]> {
    const d = getDb();
    const rows = await d.getAllAsync<Record<string, any>>(
        `SELECT * FROM messages WHERE chat_id = ? AND deleted_for_me = 0
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [chatId, limit, offset]
    );
    return (rows || []).map(sqliteRowToLocal);
}

export async function updateMessageStatus(messageId: string, updates: Partial<LocalMessageEntry>): Promise<void> {
    const d = getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.delivered_to_recipient !== undefined) { fields.push('delivered_to_recipient = ?'); values.push(updates.delivered_to_recipient ? 1 : 0); }
    if (updates.delivered_to_recipient_primary !== undefined) { fields.push('delivered_to_recipient_primary = ?'); values.push(updates.delivered_to_recipient_primary ? 1 : 0); }
    if (updates.synced_to_sender_primary !== undefined) { fields.push('synced_to_sender_primary = ?'); values.push(updates.synced_to_sender_primary ? 1 : 0); }
    if (updates.acked_by_server !== undefined) { fields.push('acked_by_server = ?'); values.push(updates.acked_by_server ? 1 : 0); }
    if (updates.local_uri !== undefined) { fields.push('local_uri = ?'); values.push(updates.local_uri); }
    if (updates.retry_count !== undefined) { fields.push('retry_count = ?'); values.push(updates.retry_count); }
    if (updates.last_retry_at !== undefined) { fields.push('last_retry_at = ?'); values.push(updates.last_retry_at); }
    if (updates.error_message !== undefined) { fields.push('error_message = ?'); values.push(updates.error_message); }
    if (updates.error_is_blocking !== undefined) { fields.push('error_is_blocking = ?'); values.push(updates.error_is_blocking ? 1 : 0); }
    if (updates.message_type !== undefined) { fields.push('message_type = ?'); values.push(updates.message_type); }
    if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content); }
    if (updates.deleted_for_me !== undefined) { fields.push('deleted_for_me = ?'); values.push(updates.deleted_for_me ? 1 : 0); }

    if (fields.length === 0) return;
    values.push(messageId);
    await d.runAsync(`UPDATE messages SET ${fields.join(', ')}, updated_at = datetime('now') WHERE message_id = ?`, values);
}

export async function swapTempIdToRealId(tempId: string, realId: string, updates?: Partial<LocalMessageEntry>): Promise<void> {
    const d = getDb();
    await d.withTransactionAsync(async () => {
        const tempRow = await d.getFirstAsync<Record<string, any>>(
            `SELECT * FROM messages WHERE temp_id = ? OR message_id = ? LIMIT 1`,
            [tempId, tempId]
        );

        if (!tempRow) return;

        const realRow = await d.getFirstAsync<Record<string, any>>(
            `SELECT * FROM messages WHERE message_id = ? LIMIT 1`,
            [realId]
        );

        const tempEntry = sqliteRowToLocal(tempRow);
        const realEntry = realRow ? sqliteRowToLocal(realRow) : null;
        const base = realEntry ?? tempEntry;

        const promoted: LocalMessageEntry = {
            ...base,
            local_uri: tempEntry.local_uri ?? base.local_uri,
            inserted_at: tempEntry.inserted_at || base.inserted_at,
            ...(updates || {}),
            message_id: realId,
            temp_id: null,
            status: 'sent',
            acked_by_server: true,
            error_message: null,
            error_is_blocking: null,
            retry_count: 0,
            last_retry_at: null,
            updated_at: new Date().toISOString(),
        };

        await d.runAsync(`DELETE FROM messages WHERE message_id = ?`, [realId]);
        await d.runAsync(`DELETE FROM messages WHERE message_id = ?`, [tempEntry.message_id]);
        await d.runAsync(
            `INSERT OR REPLACE INTO messages (
                message_id, chat_id, recipient_id, content, message_type,
                status, is_from_me, delivered_to_recipient, delivered_to_recipient_primary,
                synced_to_sender_primary, created_at, expires_at, file_id, file_name,
                file_size, file_mime_type, view_url, download_url, local_uri, temp_id,
                acked_by_server, deleted_for_me, retry_count, last_retry_at, error_message, error_is_blocking,
                inserted_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                promoted.message_id,
                promoted.chat_id,
                promoted.recipient_id,
                promoted.content || null,
                promoted.message_type,
                promoted.status,
                promoted.is_from_me ? 1 : 0,
                promoted.delivered_to_recipient ? 1 : 0,
                promoted.delivered_to_recipient_primary ? 1 : 0,
                promoted.synced_to_sender_primary ? 1 : 0,
                promoted.created_at,
                promoted.expires_at || null,
                promoted.file_id || null,
                promoted.file_name || null,
                promoted.file_size ?? null,
                promoted.file_mime_type || null,
                promoted.view_url ?? null,
                promoted.download_url ?? null,
                promoted.local_uri ?? null,
                promoted.temp_id,
                promoted.acked_by_server ? 1 : 0,
                promoted.deleted_for_me ? 1 : 0,
                promoted.retry_count ?? 0,
                promoted.last_retry_at ?? null,
                promoted.error_message ?? null,
                promoted.error_is_blocking == null ? null : (promoted.error_is_blocking ? 1 : 0),
                promoted.inserted_at,
                promoted.updated_at,
            ]
        );
    });
}

export async function deleteMessage(messageId: string): Promise<void> {
    const d = getDb();
    await d.runAsync(`UPDATE messages SET deleted_for_me = 1, updated_at = datetime('now') WHERE message_id = ?`, [messageId]);

    // Schedule a hard-delete and media cleanup 10 seconds after "Delete for me"
    setTimeout(() => {
        purgeDeletedMessages().catch(err => console.warn('[ChatStorage] Delayed purge failed', err));
    }, 10_000);
}

export async function getDeletedMessageIds(chatId: string): Promise<string[]> {
    const d = getDb();
    const rows = await d.getAllAsync<{ message_id: string }>(
        `SELECT message_id FROM messages WHERE chat_id = ? AND deleted_for_me = 1`,
        [chatId]
    );
    return (rows || []).map(r => r.message_id);
}

export async function getLastMessageTimestamp(chatId?: string): Promise<string | null> {
    const d = getDb();
    const result = await d.getFirstAsync<{ last_created_at: string }>(
        chatId
            ? `SELECT MAX(created_at) as last_created_at FROM messages WHERE chat_id = ?`
            : `SELECT MAX(created_at) as last_created_at FROM messages`,
        chatId ? [chatId] : []
    );
    return result?.last_created_at || null;
}

export async function getPendingOutboxMessages(): Promise<LocalMessageEntry[]> {
    const d = getDb();
    const rows = await d.getAllAsync<Record<string, any>>(
        `SELECT * FROM messages WHERE status IN ('pending', 'sending') AND is_from_me = 1 AND deleted_for_me = 0 ORDER BY inserted_at ASC`, []
    );
    return (rows || []).map(sqliteRowToLocal);
}

export async function getMessageByTempId(tempId: string): Promise<LocalMessageEntry | null> {
    const d = getDb();
    const row = await d.getFirstAsync<Record<string, any>>(
        `SELECT * FROM messages WHERE temp_id = ? LIMIT 1`, [tempId]
    );
    return row ? sqliteRowToLocal(row) : null;
}

export async function messageExists(messageId: string): Promise<boolean> {
    const d = getDb();
    const result = await d.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM messages WHERE message_id = ?`, [messageId]
    );
    return (result?.count || 0) > 0;
}

/**
 * Wipe all chat-related data from local storage — called on LOGOUT and on
 * fresh boot when user is not logged in (safety net).
 *
 * Deletes:
 *   - chatMessages.db         (current SQLite database)
 *   - Any .db file with "chat" in the name (catches legacy/renamed databases)
 *   - chatFiles/              (media files stored on disk)
 *   - Any directory with "chat" in the name under Paths.document
 */
export async function clearAllChatStorage(): Promise<void> {
    // Close the open connection
    if (db) {
        try {
            await db.closeAsync();
        } catch { /* ignore */ }
        db = null;
    }

    // 1. Delete the current database by name (always)
    try {
        await SQLite.deleteDatabaseAsync(DB_NAME);
    } catch { /* ignore — may not exist */ }

    // 2. Scan the SQLite database directory for ANY .db files with "chat" in the name
    try {
        const { Directory, File, Paths } = await import('expo-file-system');
        const dbDir = new Directory(SQLite.defaultDatabaseDirectory);

        if (dbDir.exists) {
            const entries = dbDir.list();
            for (const entry of entries) {
                const name = entry.uri.split('/').pop()?.toLowerCase() || '';
                if (name.includes('chat') && name.endsWith('.db') && entry instanceof File) {
                    try {
                        entry.delete();
                        console.log(`[ChatStorage:Native] Deleted legacy DB: ${name}`);
                    } catch { /* ignore */ }
                }
                // Also delete journal/wal files for those databases
                if (name.includes('chat') && (name.endsWith('.db-journal') || name.endsWith('.db-wal') || name.endsWith('.db-shm'))) {
                    try {
                        if (entry instanceof File) entry.delete();
                    } catch { /* ignore */ }
                }
            }
        }

        // 3. Delete chatFiles/ and any other chat-related directories under Paths.document
        const docDir = new Directory(Paths.document);
        if (docDir.exists) {
            const entries = docDir.list();
            for (const entry of entries) {
                const name = entry.uri.split('/').pop()?.toLowerCase() || '';
                if (name.includes('chat') && entry instanceof Directory) {
                    try {
                        entry.delete();
                        console.log(`[ChatStorage:Native] Deleted directory: ${name}`);
                    } catch { /* ignore */ }
                }
            }
        }
    } catch {
        // Ignore — expo-file-system may not be available in all contexts
    }

    console.log('[ChatStorage:Native] All chat-related data cleaned up');
}

// In-memory counter for failed inserts (reset on app restart — diagnostic only)
let _failedInserts = 0;
export function recordFailedInsert() { _failedInserts++; }

export async function getStorageStats(): Promise<{ totalMessages: number; pendingMessages: number; chatsCount: number; failedInserts: number }> {
    const d = getDb();
    const total = await d.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM messages WHERE deleted_for_me = 0`, []);
    const pending = await d.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM messages WHERE status IN ('pending', 'sending')`, []);
    const chats = await d.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM chats`, []);
    return {
        totalMessages: total?.count || 0,
        pendingMessages: pending?.count || 0,
        chatsCount: chats?.count || 0,
        failedInserts: _failedInserts,
    };
}

/**
 * Hard-delete all soft-deleted rows (deleted_for_me = 1).
 * Called on a delay after boot so `getDeletedMessageIds` guards
 * have time to protect against resurrection during initial sync.
 */
export async function purgeDeletedMessages(): Promise<number> {
    const d = getDb();
    const rows = await d.getAllAsync<{ message_id: string }>(
        `SELECT message_id FROM messages WHERE deleted_for_me = 1`, []
    );
    if (rows.length === 0) return 0;

    try {
        await cleanupMessageMedia(rows.map(r => r.message_id));
    } catch (err) {
        console.warn('[ChatStorage] Error cleaning up media for purged rows', err);
    }

    await d.runAsync(`DELETE FROM messages WHERE deleted_for_me = 1`, []);
    console.log(`[ChatStorage] Purged ${rows.length} soft-deleted row(s)`);
    return rows.length;
}

/**
 * Delete local files associated with the given message IDs.
 * Queries each message's local_uri from storage, deletes the file,
 * then clears file-related columns.
 */
export async function cleanupMessageMedia(messageIds: string[]): Promise<void> {
    const d = getDb();
    for (const id of messageIds) {
        try {
            const row = await d.getFirstAsync<{ local_uri: string | null }>(
                `SELECT local_uri FROM messages WHERE message_id = ?`, [id]
            );
            // Delete the actual file from chatFiles/ if it exists
            if (row?.local_uri) {
                try {
                    const file = new File(row.local_uri);
                    if (file.exists) file.delete();
                } catch { /* ignore — file may already be gone */ }
            }
            // Clear file-related fields in the row
            await d.runAsync(
                `UPDATE messages SET local_uri = NULL, view_url = NULL, download_url = NULL, file_id = NULL, updated_at = datetime('now') WHERE message_id = ?`,
                [id]
            );
        } catch (err) {
            console.warn('[ChatStorage] cleanupMessageMedia failed for', id, err);
        }
    }
}

/**
 * Delete local files for messages that were unsent (message_type = 'unsent')
 * but whose media was not cleaned up (e.g. crash or interrupted unsend).
 */
export async function cleanupOrphanedMedia(): Promise<void> {
    const d = getDb();
    const rows = await d.getAllAsync<{ message_id: string; local_uri: string | null }>(
        `SELECT message_id, local_uri FROM messages WHERE message_type = 'unsent' AND (local_uri IS NOT NULL OR file_id IS NOT NULL)`, []
    );
    if (rows.length > 0) {
        for (const row of rows) {
            try {
                if (row.local_uri) {
                    const file = new File(row.local_uri);
                    if (file.exists) file.delete();
                }
                await d.runAsync(
                    `UPDATE messages SET local_uri = NULL, view_url = NULL, download_url = NULL, file_id = NULL, updated_at = datetime('now') WHERE message_id = ?`,
                    [row.message_id]
                );
            } catch { /* ignore — file may already be gone */ }
        }
        console.log(`[ChatStorage] Cleaned up media for ${rows.length} unsent message(s)`);
    }

    // NEW: Clean up orphaned files in chatFiles/ directory
    try {
        const activeRows = await d.getAllAsync<{ local_uri: string }>(
            `SELECT local_uri FROM messages
             WHERE local_uri IS NOT NULL
             AND status NOT IN ('pending', 'sending')`,
            []
        );
        cleanupOrphanedFiles(activeRows.map(r => r.local_uri));
    } catch (err) {
        console.warn('[ChatStorage] Error during orphaned file cleanup', err);
    }
}

/** Convert SQLite INTEGER row to LocalMessageEntry booleans */
function sqliteRowToLocal(row: Record<string, any>): LocalMessageEntry {
    return {
        ...row,
        is_from_me: row.is_from_me === 1,
        delivered_to_recipient: row.delivered_to_recipient === 1,
        delivered_to_recipient_primary: row.delivered_to_recipient_primary === 1,
        synced_to_sender_primary: row.synced_to_sender_primary === 1,
        acked_by_server: row.acked_by_server === 1,
        deleted_for_me: row.deleted_for_me === 1,
        retry_count: row.retry_count || 0,
        last_retry_at: row.last_retry_at || null,
        error_message: row.error_message || null,
        error_is_blocking: row.error_is_blocking != null ? row.error_is_blocking === 1 : null,
    } as LocalMessageEntry;
}

/** Convert SQLite INTEGER row to LocalChatEntry booleans */
function sqliteChatRowToLocal(row: Record<string, any>): LocalChatEntry {
    return {
        ...row,
        avatar_url: row.avatar_url || null,
        last_message_content: row.last_message_content || null,
        last_message_created_at: row.last_message_created_at || null,
        last_message_type: row.last_message_type || null,
        last_message_is_from_me: row.last_message_is_from_me === 1,
        last_message_sender_id: row.last_message_sender_id || null,
        last_message_id: row.last_message_id || null,
        last_message_is_unsent: row.last_message_is_unsent === 1,
        unread_count: Number(row.unread_count) || 0,
    } as LocalChatEntry;
}

/**
 * Removes files in `chatFiles/` that are NOT in the provided active set.
 *
 * Called periodically or on boot to reclaim space from files whose
 * messages have been deleted.
 */
function cleanupOrphanedFiles(activeUris: string[]): void {
    try {
        const dir = new Directory(Paths.document, 'chatFiles');

        if (!dir.exists) return;

        const activeSet = new Set(activeUris.map(u => u.toLowerCase()));
        const entries = dir.list();
        let removed = 0;

        for (const entry of entries) {
            // Only clean up files, not subdirectories
            if (entry instanceof File) {
                if (!activeSet.has(entry.uri.toLowerCase())) {
                    entry.delete();
                    removed++;
                }
            }
        }

        if (removed > 0) {
            console.log('[ChatStorage:Native]', `Cleaned up ${removed} orphaned file(s)`);
        }
    } catch (err) {
        console.warn('[ChatStorage:Native]', 'Orphan cleanup failed:', err);
    }
}
