// lib/personalLib/chatApi/outbox.queue.ts
//
// Outbox Queue — retries unsent messages after app restart or reconnection.
//
// Flow:
//   1. processQueue() reads all pending/sending messages from local DB
//   2. For each message (in insertion order):
//      - Text  → ChatTransport.sendMessage(...)
//      - File  → Rebuild FormData from local blob (web IDB) or file (native disk)
//                → ChatTransport.uploadFileWithProgress(...)
//      - On success: swapTempIdToRealId(tempId, realId, { status: 'sent', ... })
//      - On failure: increment retry_count, exponential backoff, max 3 retries
//
// Rules:
//   - Only processes is_from_me messages with status 'pending' or 'sending'
//   - Respects pause/resume for network state changes
//   - Does NOT run more than one processQueue() at a time (mutex)

import { Platform } from 'react-native';
import {
    getPendingOutboxMessages,
    updateMessageStatus,
    swapTempIdToRealId,
    getMediaBlob,
    deleteMediaBlob,
} from '@/lib/storage/personalStorage/chat/chat.storage';
import { ChatTransport } from './chat.transport';
import type { LocalMessageEntry } from '@/lib/storage/personalStorage/chat/chat.storage.schema';

const TAG = '[OutboxQueue]';
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2_000; // 2s, 4s, 8s

class OutboxQueue {
    private _paused = false;
    private _processing = false;

    /** Pause queue processing (e.g. when going offline) */
    pause(): void {
        this._paused = true;
        console.log(`${TAG} Paused`);
    }

    /** Resume queue processing and immediately drain */
    resume(): void {
        this._paused = false;
        console.log(`${TAG} Resumed`);
        this.processQueue();
    }

    get isPaused(): boolean { return this._paused; }
    get isProcessing(): boolean { return this._processing; }

    /**
     * Drain all pending outbox messages. Safe to call multiple times —
     * concurrent calls are no-ops (mutex).
     */
    async processQueue(): Promise<void> {
        if (this._processing || this._paused) return;
        this._processing = true;
        console.log(`${TAG} Processing queue...`);

        try {
            const pending = await getPendingOutboxMessages();
            if (pending.length === 0) {
                console.log(`${TAG} Queue empty — nothing to send.`);
                return;
            }
            console.log(`${TAG} Found ${pending.length} pending message(s)`);

            for (const msg of pending) {
                if (this._paused) {
                    console.log(`${TAG} Paused mid-queue — stopping`);
                    break;
                }

                // Skip messages in backoff cooldown
                if (this.isInBackoff(msg)) {
                    console.log(`${TAG} Skipping ${msg.message_id} (in backoff cooldown)`);
                    continue;
                }

                await this.processMessage(msg);
            }
        } catch (err) {
            console.error(`${TAG} Queue processing failed:`, err);
        } finally {
            this._processing = false;
        }
    }

    // ─── Single Message Processing ─────────────────────────────────────────

    private async processMessage(msg: LocalMessageEntry): Promise<void> {
        const id = msg.message_id;
        console.log(`${TAG} Processing ${id} (type=${msg.message_type}, retry=${msg.retry_count})`);

        // Mark as 'sending'
        await updateMessageStatus(id, { status: 'sending' });

        try {
            if (msg.message_type === 'text') {
                await this.sendText(msg);
            } else {
                await this.sendFile(msg);
            }
        } catch (err) {
            await this.handleFailure(msg, err);
        }
    }

    // ─── Text Message ──────────────────────────────────────────────────────

    private async sendText(msg: LocalMessageEntry): Promise<void> {
        const response = await ChatTransport.sendMessage({
            recipient_id: msg.recipient_id,
            content: msg.content || '',
            message_type: 'text',
        });

        if (!response?.message_id) {
            throw new Error(`Server returned no message_id for ${msg.message_id}`);
        }

        // Success — swap temp ID to real server ID
        await swapTempIdToRealId(msg.message_id, response.message_id, {
            status: 'sent',
            acked_by_server: true,
            error_message: null,
            file_id: response.file_id ?? null,
            view_url: response.view_url ?? null,
            download_url: response.download_url ?? null,
            created_at: response.created_at,
            expires_at: response.expires_at ?? null,
        });

        console.log(`${TAG} ✅ Text sent: ${msg.message_id} → ${response.message_id}`);
    }

    // ─── File Message ──────────────────────────────────────────────────────

    private async sendFile(msg: LocalMessageEntry): Promise<void> {
        const formData = await this.buildFormDataForRetry(msg);

        const response = await ChatTransport.uploadFileWithProgress(formData, (_progress) => {
            // Outbox retry runs in background — no UI progress bar to update
        });

        if (!response?.message_id) {
            throw new Error(`Server returned no message_id for file ${msg.message_id}`);
        }

        // Success — swap temp ID to real server ID
        await swapTempIdToRealId(msg.message_id, response.message_id, {
            status: 'sent',
            acked_by_server: true,
            error_message: null,
            file_id: response.file_id ?? null,
            file_name: response.file_name ?? msg.file_name,
            file_size: response.file_size ?? msg.file_size,
            file_mime_type: response.file_mime_type ?? msg.file_mime_type,
            view_url: response.view_url ?? null,
            download_url: response.download_url ?? null,
            created_at: response.created_at,
            expires_at: response.expires_at ?? null,
        });

        // Phase D Optimization: We intentionally DO NOT delete the locally stored blob here.
        // If we delete the blob, the sender loses their fast, local `local_uri` reference
        // (which is still pointing to the `idb://tempId` blob) and their UI would break 
        // until they redownloaded it from the `download_url`.
        console.log(`${TAG} ✅ File sent: ${msg.message_id} → ${response.message_id}`);
    }

    /**
     * Rebuild FormData from the locally persisted file for retry.
     * - Web: reads blob from encrypted IndexedDB via getMediaBlob()
     * - Native: reads file from local_uri on disk
     */
    private async buildFormDataForRetry(msg: LocalMessageEntry): Promise<FormData> {
        const formData = new FormData();
        formData.append('recipient_id', msg.recipient_id);
        formData.append('message_type', msg.message_type);
        formData.append('caption', '');

        if (Platform.OS === 'web') {
            // Web: retrieve blob from encrypted IndexedDB
            const media = await getMediaBlob(msg.message_id);
            if (!media) {
                throw new Error(`No blob found in IDB for ${msg.message_id}`);
            }
            const file = new File([media.blob], msg.file_name || media.fileName || 'file', {
                type: msg.file_mime_type || media.mimeType || 'application/octet-stream',
            });
            formData.append('file', file);
        } else {
            // Native: use the local_uri file path
            if (!msg.local_uri) {
                throw new Error(`No local_uri for native file retry: ${msg.message_id}`);
            }
            formData.append('file', {
                uri: msg.local_uri,
                name: msg.file_name || 'file',
                type: msg.file_mime_type || 'application/octet-stream',
            } as any);
        }

        return formData;
    }

    // ─── Failure Handling ──────────────────────────────────────────────────

    private async handleFailure(msg: LocalMessageEntry, err: unknown): Promise<void> {
        const retryCount = (msg.retry_count || 0) + 1;
        const errorMessage = err instanceof Error ? err.message : String(err);

        if (retryCount >= MAX_RETRIES) {
            // Max retries exhausted — mark as error, stop retrying
            await updateMessageStatus(msg.message_id, {
                status: 'error',
                retry_count: retryCount,
                last_retry_at: new Date().toISOString(),
                error_message: errorMessage,
            });
            console.error(`${TAG} ❌ FAILED permanently (${retryCount}/${MAX_RETRIES}): ${msg.message_id} — ${errorMessage}`);
        } else {
            // Will retry later — keep as pending with backoff info
            await updateMessageStatus(msg.message_id, {
                status: 'pending',
                retry_count: retryCount,
                last_retry_at: new Date().toISOString(),
                error_message: errorMessage,
            });
            const backoffMs = BASE_BACKOFF_MS * Math.pow(2, retryCount - 1);
            console.warn(`${TAG} ⚠️ Attempt ${retryCount}/${MAX_RETRIES} failed: ${msg.message_id} — next retry in ${backoffMs}ms`);
        }
    }

    // ─── Backoff Check ─────────────────────────────────────────────────────

    private isInBackoff(msg: LocalMessageEntry): boolean {
        if (!msg.last_retry_at || msg.retry_count === 0) return false;
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, msg.retry_count - 1);
        const lastRetry = new Date(msg.last_retry_at).getTime();
        const now = Date.now();
        return (now - lastRetry) < backoffMs;
    }
}

// Singleton
export const outboxQueue = new OutboxQueue();
