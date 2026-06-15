import { Platform } from 'react-native';
import type { ChatEntry, MessageEntry } from '@/lib/personalLib';
import { ChatTransport } from './chat.transport';
import { isRecipientKeyChangedError, extractFreshKeyFromError } from './outbox.errors';
import {
    getPendingOutboxMessages,
    getMediaBlob,
    swapTempIdToRealId,
    updateMessageStatus,
} from '@/lib/storage/personalStorage/chat/chat.storage';
import * as ChatStorage from '@/lib/storage/personalStorage/chat/chat.storage';
import type { LocalMessageEntry } from '@/lib/storage/personalStorage/chat/chat.storage.schema';
import { $chatMessagesState, $chatListState } from '@/state/personalState/chat/personal.state.chat';
import { $contactsState } from '@/state/personalState/contacts/personal.state.contacts';
import { authState } from '@/state/auth/state.auth';
import { copyFileToPrivateDir } from '@/lib/personalLib/fileSystem/file.copy';
import { getPreviewText } from '@/utils/personalUtils/util.chatPreview';
import { getChatErrorMessage } from '@/utils/personalUtils/util.chatErrors';
import { resolveMediaUrls } from '@/utils/personalUtils/util.chatMedia';
import { DEFAULT_MIME_TYPES, FALLBACK_MIME_TYPE } from '@/lib/personalLib/fileSystem/file.download';
import {
    createE2EERecipientKeyRefreshPass,
    encryptOutgoingTextStrict,
    prepareOutgoingMediaStrict,
    saveUserPublicKey,
    type E2EERecipientKeyRefreshPass,
    type E2EEStrictSendFailureReason,
    type EncryptedMediaUpload,
    type EncryptedMediaBlobUpload,
} from '@/lib/personalLib/e2ee/e2ee.service';

const TAG = '[OutboxQueue]';
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2_000;


class E2EESecureSendBlockedError extends Error {
    readonly code = 'E2EE_SECURE_SEND_BLOCKED';
    constructor(
        readonly reason: E2EEStrictSendFailureReason,
        readonly messageId: string,
    ) {
        super(`Secure send blocked: ${reason}`);
        this.name = 'E2EESecureSendBlockedError';
    }
}

function isE2EESecureSendBlockedError(err: unknown): err is E2EESecureSendBlockedError {
    return err instanceof E2EESecureSendBlockedError ||
        (err instanceof Error && (err as any).code === 'E2EE_SECURE_SEND_BLOCKED');
}

/**
 * Error classification for queue ordering decisions.
 * - BLOCKING: Network/server errors - keep message at head, block queue
 * - NON_BLOCKING: Client/business errors - skip message, allow later messages to send
 */
type ErrorClassification = 'BLOCKING' | 'NON_BLOCKING' | 'ABORT';

/**
 * Classifies an error to determine queue behavior.
 * This is critical for preserving message order while not blocking on permanent failures.
 */
export function classifyError(err: unknown): ErrorClassification {
    if (isE2EESecureSendBlockedError(err)) {
        return 'NON_BLOCKING';
    }

    // Abort errors - user initiated cancellation (logout/pause)
    if (err instanceof Error && err.name === 'AbortError') {
        return 'ABORT';
    }

    // Network errors - connection failures, timeouts, DNS issues
    // These should BLOCK the queue to preserve message order
    if (err instanceof TypeError) {
        // Network error, fetch failed, CORS error
        return 'BLOCKING';
    }

    // ApiError from our apiClient
    if (err instanceof Error && 'code' in err && 'type' in err) {
        const apiErr = err as any;
        const code = apiErr.code;
        const type = apiErr.type as string;

        // Client errors (4xx) - NON_BLOCKING, skip this message
        if (code >= 400 && code < 500) {
            // Auth errors might be temporary (token refresh needed)
            if (type === 'unauthorized' || type === 'session_invalid') {
                return 'BLOCKING';
            }
            // Business logic errors - permanent failures, skip message
            return 'NON_BLOCKING';
        }

        // Server errors (5xx) - BLOCKING, retry later
        if (code >= 500) {
            return 'BLOCKING';
        }
    }

    // Generic Error with network-related messages
    if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        if (msg.includes('network') || 
            msg.includes('timeout') || 
            msg.includes('connection') ||
            msg.includes('network error')) {
            return 'BLOCKING';
        }
        if (msg.includes('abort')) {
            return 'ABORT';
        }
    }

    // Default: treat as BLOCKING to preserve order (safer)
    return 'BLOCKING';
}

type OutboxFileMessageType = 'image' | 'video' | 'audio' | 'file';

type QueueableAsset = {
    uri: string;
    size?: number;
    fileSize?: number;
    name?: string;
    fileName?: string;
    mimeType?: string;
    type?: string;
    file?: Blob;
};

type EnqueueTextMessageInput = {
    chatId: string;
    recipientId: string;
    recipientName?: string;
    content: string;
};

type EnqueueFileMessageInput = {
    chatId: string;
    recipientId: string;
    recipientName?: string;
    asset: QueueableAsset;
    messageType: OutboxFileMessageType;
};

class OutboxQueue {
    private _paused = false;
    private _processing = false;
    private _drainRequested = false;
    private _retryTimer: ReturnType<typeof setTimeout> | null = null;
    private _retryDeadline: number | null = null;
    private _abortController: AbortController | null = null;
    private _currentAbortController: AbortController | null = null;

    pause(): void {
        this._paused = true;
        this.clearRetryTimer();
        this.abortInFlightRequests();
        console.log(`${TAG} Paused`);
    }

    resume(): void {
        this._paused = false;
        this._abortController = new AbortController();
        console.log(`${TAG} Resumed`);
        void this.processQueue();
    }

    /**
     * Abort all in-flight HTTP requests immediately.
     * Called on logout/pause to prevent leaked writes after user disconnects.
     */
    abortInFlightRequests(): void {
        if (this._currentAbortController) {
            console.log(`${TAG} Aborting in-flight request`);
            this._currentAbortController.abort();
            this._currentAbortController = null;
        }
    }

    get isPaused(): boolean { return this._paused; }
    get isProcessing(): boolean { return this._processing; }

    async enqueueTextMessage(input: EnqueueTextMessageInput): Promise<string> {
        const trimmed = input.content.trim();
        if (!trimmed) {
            throw new Error('Message content is empty.');
        }

        const tempId = this.createTempId();
        const now = new Date().toISOString();
        const optimisticMsg: MessageEntry = {
            message_id: tempId,
            temp_id: tempId,
            chat_id: input.chatId,
            is_from_me: true,
            recipient_id: input.recipientId,
            content: trimmed,
            message_type: 'text',
            created_at: now,
            expires_at: now,
            status: 'pending',
            delivered_to_recipient: false,
            synced_to_sender_primary: true,
            acked_by_server: false,
        };

        $chatMessagesState.chats[input.chatId]?.inputText.set('');
        await $chatMessagesState.addMessage(input.chatId, optimisticMsg);
        this.upsertOutgoingPreview(input.chatId, optimisticMsg, input.recipientId, input.recipientName);

        void this.processQueue();
        return tempId;
    }

    async enqueueFileMessage(input: EnqueueFileMessageInput): Promise<string> {
        const tempId = this.createTempId();
        const now = new Date().toISOString();

        const fileName = input.asset.name || input.asset.fileName || 'file';
        const fileSize = input.asset.size || input.asset.fileSize || 0;
        const fileMimeType =
            input.asset.mimeType ||
            input.asset.type ||
            DEFAULT_MIME_TYPES[input.messageType as keyof typeof DEFAULT_MIME_TYPES] ||
            DEFAULT_MIME_TYPES.file;

        const optimisticMsg: MessageEntry = {
            message_id: tempId,
            temp_id: tempId,
            chat_id: input.chatId,
            is_from_me: true,
            recipient_id: input.recipientId,
            content: '',
            message_type: input.messageType,
            file_mime_type: fileMimeType,
            created_at: now,
            expires_at: now,
            status: 'preparing',
            delivered_to_recipient: false,
            synced_to_sender_primary: true,
            acked_by_server: false,
            file_name: fileName,
            file_size: fileSize,
            progress: 0,
        };

        await $chatMessagesState.addMessage(input.chatId, optimisticMsg);
        this.upsertOutgoingPreview(input.chatId, optimisticMsg, input.recipientId, input.recipientName);
        void this.processQueue();

        try {
            const copyResult = await copyFileToPrivateDir(
                input.asset.uri,
                tempId,
                fileName,
                fileMimeType || undefined,
                Platform.OS === 'web' ? input.asset.file : undefined,
            );

            await updateMessageStatus(tempId, {
                status: 'pending',
                local_uri: copyResult.localUri,
                file_name: fileName,
                file_size: fileSize,
                file_mime_type: fileMimeType,
                error_message: null,
                error_is_blocking: null,
            });
            this.syncInMemoryMessageStatus(input.chatId, tempId, {
                status: 'pending',
                local_uri: copyResult.localUri,
                file_name: fileName,
                file_size: fileSize,
                file_mime_type: fileMimeType,
            } as Partial<MessageEntry>);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await updateMessageStatus(tempId, {
                status: 'failed',
                error_message: message,
                error_is_blocking: false,
            });
            this.syncInMemoryMessageStatus(input.chatId, tempId, {
                status: 'failed',
                error_message: message,
                error_is_blocking: false,
            });
        }

        void this.processQueue();
        return tempId;
    }

    async processQueue(): Promise<void> {
        if (this._paused) return;
        if (this._processing) {
            this._drainRequested = true;
            return;
        }

        this._processing = true;
        console.log(`${TAG} Processing queue...`);

        try {
            do {
                this._drainRequested = false;

                const pending = await getPendingOutboxMessages();
                if (pending.length === 0) {
                    this.clearRetryTimer();
                    console.log(`${TAG} Queue empty.`);
                    continue;
                }

                console.log(`${TAG} Found ${pending.length} pending message(s)`);
                let nextRetryMs: number | null = null;
                const recipientKeyRefreshPass = createE2EERecipientKeyRefreshPass();
                const blockedChats = new Set<string>();
                
                for (const msg of pending) {
                    if (this._paused) {
                        console.log(`${TAG} Paused mid-queue.`);
                        break;
                    }

                    if (blockedChats.has(msg.chat_id)) {
                        console.log(`${TAG} Skipping ${msg.message_id} (chat blocked by earlier preparing message)`);
                        continue;
                    }

                    if (msg.status === 'preparing') {
                        blockedChats.add(msg.chat_id);
                        console.log(`${TAG} Blocking chat ${msg.chat_id}: ${msg.message_id} is still preparing`);
                        continue;
                    }

                    // Skip messages that have terminal error status (non-blocking errors already failed permanently)
                    if (msg.status === 'error' || msg.status === 'failed') {
                        console.log(`${TAG} Skipping ${msg.message_id} (status=${msg.status}, non-blocking failure)`);
                        continue;
                    }

                    if (this.isInBackoff(msg)) {
                        const remainingMs = this.getBackoffRemainingMs(msg);
                        nextRetryMs = nextRetryMs == null ? remainingMs : Math.min(nextRetryMs, remainingMs);
                        
                        // Check if this is a BLOCKING error - should block queue
                        // Non-blocking errors skip without blocking
                        if (msg.error_is_blocking === false) {
                            console.log(`${TAG} Skipping ${msg.message_id} (non-blocking error in backoff: ${remainingMs}ms)`);
                            continue;
                        }
                        
                        console.log(`${TAG} Blocking: ${msg.message_id} in backoff (${remainingMs}ms) - queue blocked`);
                        continue;
                    }

                    await this.processMessage(msg, recipientKeyRefreshPass);
                }

                if (nextRetryMs != null) {
                    this.scheduleRetry(nextRetryMs);
                } else {
                    this.clearRetryTimer();
                }
            } while (!this._paused && this._drainRequested);
        } catch (err) {
            console.error(`${TAG} Queue processing failed:`, err);
        } finally {
            this._processing = false;
        }
    }

    private createTempId(): string {
        return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    private async processMessage(msg: LocalMessageEntry, recipientKeyRefreshPass: E2EERecipientKeyRefreshPass): Promise<void> {
        const id = msg.message_id;
        console.log(`${TAG} Processing ${id} (type=${msg.message_type}, retry=${msg.retry_count})`);

        // Create new AbortController for this request
        this._currentAbortController = new AbortController();

        await updateMessageStatus(id, { status: 'sending' });
        this.syncInMemoryMessageStatus(msg.chat_id, id, { status: 'sending' });
        this.syncPreviewStatus(msg.chat_id, [id], 'pending');

        try {
            if (msg.message_type === 'text') {
                await this.sendText(msg, this._currentAbortController.signal, recipientKeyRefreshPass);
            } else {
                await this.sendFile(msg, this._currentAbortController.signal, recipientKeyRefreshPass);
            }
        } catch (err) {
            // Handle recipient_key_changed: save fresh key from error response, retry once.
            // sendText/sendFile will re-encrypt from registry (now has the fresh key).
            if (isRecipientKeyChangedError(err)) {
                const freshKey = extractFreshKeyFromError(err);
                if (freshKey) {
                    console.log(`${TAG} ⚠️ RECIPIENT KEY CHANGED — saving fresh key to registry`, {
                        messageId: msg.message_id,
                        recipientId: msg.recipient_id,
                        freshKeyPrefix: freshKey.substring(0, 8) + '...',
                    });
                    await saveUserPublicKey(msg.recipient_id, freshKey);
                    console.log(`${TAG} ✅ Fresh key saved to registry — retrying send`, {
                        messageId: msg.message_id,
                        messageType: msg.message_type,
                    });
                } else {
                    console.warn(`${TAG} ⚠️ RECIPIENT KEY CHANGED but could not extract fresh key from error`, {
                        messageId: msg.message_id,
                        recipientId: msg.recipient_id,
                    });
                }
                try {
                    if (msg.message_type === 'text') {
                        await this.sendText(msg, this._currentAbortController.signal, recipientKeyRefreshPass);
                    } else {
                        await this.sendFile(msg, this._currentAbortController.signal, recipientKeyRefreshPass);
                    }
                    console.log(`${TAG} ✅ Retry SUCCEEDED after key change`, {
                        messageId: msg.message_id,
                        recipientId: msg.recipient_id,
                    });
                    return; // retry succeeded
                } catch (retryErr) {
                    console.error(`${TAG} ❌ Retry FAILED after key change — falling through to handleFailure`, {
                        messageId: msg.message_id,
                        recipientId: msg.recipient_id,
                        retryError: retryErr instanceof Error ? retryErr.message : String(retryErr),
                    });
                    await this.handleFailure(msg, retryErr);
                    return;
                }
            }
            // All other errors → normal failure handling
            await this.handleFailure(msg, err);
        } finally {
            this._currentAbortController = null;
        }
    }

    private async sendText(
        msg: LocalMessageEntry,
        signal: AbortSignal | undefined,
        recipientKeyRefreshPass: E2EERecipientKeyRefreshPass,
    ): Promise<void> {
        // Strict E2EE: encrypt at send time. Any local/self/recipient key failure
        // blocks transport; plaintext is never sent from the outbox path.
        const encrypted = await encryptOutgoingTextStrict(msg.recipient_id, msg.content || '', {
            recipientKeyRefreshPass,
        });
        if (!encrypted.ok) {
            if (encrypted.reason === 'recipient_key_unavailable') {
                console.error(`${TAG} 🚫 SEND BLOCKED — recipient ${msg.recipient_id} has no E2EE key`, {
                    messageId: msg.message_id,
                    recipientId: msg.recipient_id,
                    reason: encrypted.reason,
                });
            }
            throw new E2EESecureSendBlockedError(encrypted.reason, msg.message_id);
        }

        console.log(`${TAG} sendText: sending with recipient key`, {
            messageId: msg.message_id,
            recipientId: msg.recipient_id,
            recipientKeyPrefix: encrypted.recipient_e2ee_public_key_used
                ? `${encrypted.recipient_e2ee_public_key_used.substring(0, 8)}...`
                : 'null',
        });

        const response = await ChatTransport.sendMessage({
            recipient_id: msg.recipient_id,
            content: encrypted.wire,
            message_type: 'text',
            recipient_e2ee_public_key_used: encrypted.recipient_e2ee_public_key_used,
        }, signal);

        if (!response?.message_id) {
            throw new Error(`Server returned no message_id for ${msg.message_id}`);
        }

        await swapTempIdToRealId(msg.message_id, response.message_id, {
            status: 'sent',
            acked_by_server: true,
            error_message: null,
            recipient_e2ee_public_key_used: encrypted.recipient_e2ee_public_key_used,
            file_id: response.file_id ?? null,
            view_url: response.view_url ?? null,
            download_url: response.download_url ?? null,
            created_at: response.created_at,
            expires_at: response.expires_at ?? null,
            file_token_expiry: response.file_token_expiry ?? null,
        });

        const sentMessage = {
            ...response,
            status: 'sent',
            // E2EE: prefer the LOCAL plaintext — the server echoes ciphertext the
            // sender cannot decrypt (crypto_box is recipient-keyed).
            content: msg.content || response.content || '',
            message_type: response.message_type || 'text',
            chat_id: response.chat_id || msg.chat_id,
            recipient_id: response.recipient_id || msg.recipient_id,
            is_from_me: true,
            delivered_to_recipient: response.delivered_to_recipient ?? false,
            synced_to_sender_primary: response.synced_to_sender_primary ?? true,
            recipient_e2ee_public_key_used: encrypted.recipient_e2ee_public_key_used,
        } as MessageEntry;

        await this.promoteTempMessage(msg, sentMessage);
        console.log(`${TAG} Text sent: ${msg.message_id} -> ${response.message_id}`);
    }

    private async sendFile(
        msg: LocalMessageEntry,
        signal: AbortSignal | undefined,
        recipientKeyRefreshPass: E2EERecipientKeyRefreshPass,
    ): Promise<void> {
        // Strict E2EE: build encrypted upload copy + wrapped key only. Missing
        // staged bytes/key/prep failure blocks transport; plaintext upload never runs.
        let e2ee: EncryptedMediaUpload | EncryptedMediaBlobUpload | null = null;
        let recipientKeyUsed: string | null = null;

        if (Platform.OS === 'web') {
            const media = await getMediaBlob(msg.message_id);
            if (!media?.blob) {
                throw new E2EESecureSendBlockedError('invalid_payload', msg.message_id);
            }
            const prepared = await prepareOutgoingMediaStrict({
                kind: 'blob',
                recipientId: msg.recipient_id,
                blob: media.blob,
                originalFileName: msg.file_name || media.fileName || 'file',
                originalMimeType: msg.file_mime_type || media.mimeType || media.blob.type || null,
                originalSize: msg.file_size ?? media.blob.size ?? null,
                messageType: msg.message_type,
            }, { recipientKeyRefreshPass });
            if (!prepared.ok) {
                throw new E2EESecureSendBlockedError(prepared.reason, msg.message_id);
            }
            e2ee = prepared.media;
            recipientKeyUsed = prepared.recipient_e2ee_public_key_used;
        } else {
            if (!msg.local_uri) {
                throw new E2EESecureSendBlockedError('invalid_payload', msg.message_id);
            }
            const prepared = await prepareOutgoingMediaStrict({
                kind: 'file',
                recipientId: msg.recipient_id,
                localUri: msg.local_uri,
                originalFileName: msg.file_name || 'file',
                originalMimeType: msg.file_mime_type || null,
                originalSize: msg.file_size ?? null,
                messageType: msg.message_type,
            }, { recipientKeyRefreshPass });
            if (!prepared.ok) {
                throw new E2EESecureSendBlockedError(prepared.reason, msg.message_id);
            }
            e2ee = prepared.media;
            recipientKeyUsed = prepared.recipient_e2ee_public_key_used;
        }

        let response: Awaited<ReturnType<typeof ChatTransport.uploadFileWithProgress>>;
        try {
            const formData = await this.buildFormDataForRetry(msg, e2ee, recipientKeyUsed);
            response = await ChatTransport.uploadFileWithProgress(formData, (progress) => {
                this.syncInMemoryMessageStatus(msg.chat_id, msg.message_id, {
                    status: 'sending',
                    progress,
                });
            }, signal);
        } finally {
            // Always delete the encrypted temp copy once the upload settles
            e2ee.cleanup();
        }

        if (!response?.message_id) {
            throw new Error(`Server returned no message_id for file ${msg.message_id}`);
        }

        // E2EE: prefer LOCAL file metadata — for encrypted uploads the server
        // echoes `<name>.enc` / application/octet-stream / the encrypted size,
        // while the sender keeps the original staged file.
        await swapTempIdToRealId(msg.message_id, response.message_id, {
            status: 'sent',
            acked_by_server: true,
            error_message: null,
            content: e2ee.wrappedKey,
            recipient_e2ee_public_key_used: recipientKeyUsed,
            file_id: response.file_id ?? null,
            file_name: msg.file_name ?? response.file_name,
            file_size: msg.file_size ?? response.file_size,
            file_mime_type: msg.file_mime_type ?? response.file_mime_type,
            view_url: response.view_url ?? null,
            download_url: response.download_url ?? null,
            created_at: response.created_at,
            expires_at: response.expires_at ?? null,
            file_token_expiry: response.file_token_expiry ?? null,
        });

        const sentMessage = {
            ...response,
            chat_id: msg.chat_id,
            recipient_id: msg.recipient_id,
            is_from_me: true,
            message_type: msg.message_type,
            content: e2ee.wrappedKey,
            status: 'sent',
            delivered_to_recipient: false,
            synced_to_sender_primary: true,
            local_uri: msg.local_uri,
            file_name: msg.file_name ?? response.file_name,
            file_size: msg.file_size ?? response.file_size,
            file_mime_type: msg.file_mime_type ?? response.file_mime_type,
            view_url: response.view_url || msg.local_uri || undefined,
            download_url: response.download_url,
            progress: 100,
            file_id: response.file_id ?? null,
            expires_at: response.expires_at,
            file_token_expiry: response.file_token_expiry,
            recipient_e2ee_public_key_used: recipientKeyUsed,
        } as MessageEntry;

        await this.promoteTempMessage(msg, sentMessage);
        console.log(`${TAG} File sent: ${msg.message_id} -> ${response.message_id}`);
    }

    private async promoteTempMessage(msg: LocalMessageEntry, sentMessage: MessageEntry): Promise<void> {
        // Handle async operations BEFORE the synchronous batch
        let resolvedEntry = {
            ...sentMessage,
            created_at: sentMessage.created_at,
            // Preserve local_seq from optimistic message so UI sort stays stable
            // after server ACK. Without this, sort falls back to server created_at
            // which can be later than a subsequent still-pending message, causing a jump.
            local_seq: msg.local_seq,
        };

        // Resolve media URLs if needed (async)
        if (resolvedEntry.file_id && !resolvedEntry.local_uri) {
            await resolveMediaUrls([resolvedEntry]);
        }

        // Persist to storage (async)
        await ChatStorage.insertMessage(resolvedEntry);

        // Atomic UI swap - single render, no flicker (BUG-006 fix)
        $chatMessagesState.replaceMessage(msg.chat_id, msg.message_id, resolvedEntry);

        const currentEntry = $chatListState.chatsById[msg.chat_id]?.peek();
        if (!currentEntry) return;

        if (currentEntry.last_message_id !== msg.message_id && currentEntry.last_message_id !== resolvedEntry.message_id) {
            return;
        }

        $chatListState.upsertChat({
            ...currentEntry,
            last_message_content: getPreviewText(resolvedEntry),
            last_message_created_at: resolvedEntry.created_at,
            last_message_status: 'sent',
            last_message_is_from_me: true,
            last_message_type: resolvedEntry.message_type,
            last_message_id: resolvedEntry.message_id,
            last_message_sender_id: authState.userId.peek() || null,
            last_message_is_unsent: false,
            updated_at: resolvedEntry.created_at,
        } as ChatEntry);
    }

    private async buildFormDataForRetry(
        msg: LocalMessageEntry,
        e2ee: EncryptedMediaUpload | EncryptedMediaBlobUpload,
        recipientKeyUsed: string | null,
    ): Promise<FormData> {
        console.log(`${TAG} sendFile: building FormData with recipient key`, {
            messageId: msg.message_id,
            recipientId: msg.recipient_id,
            recipientKeyPrefix: recipientKeyUsed
                ? `${recipientKeyUsed.substring(0, 8)}...`
                : 'null',
            messageType: msg.message_type,
        });
        const formData = new FormData();
        formData.append('recipient_id', msg.recipient_id);
        formData.append('message_type', msg.message_type);
        // E2EE: encrypted media envelope travels as caption → stored as message content.
        // No plaintext caption/file branch exists in strict outbox transport.
        formData.append('caption', e2ee.wrappedKey);
        if (recipientKeyUsed) {
            formData.append('recipient_e2ee_public_key_used', recipientKeyUsed);
        }

        if (Platform.OS === 'web' && 'encryptedBlob' in e2ee) {
            const encryptedFile = new File([e2ee.encryptedBlob], e2ee.uploadFileName, {
                type: FALLBACK_MIME_TYPE,
            });
            formData.append('file', encryptedFile);
        } else if (Platform.OS !== 'web' && 'encryptedUri' in e2ee) {
            formData.append('file', {
                uri: e2ee.encryptedUri,
                name: e2ee.uploadFileName,
                type: FALLBACK_MIME_TYPE,
            } as any);
        } else {
            throw new E2EESecureSendBlockedError('invalid_payload', msg.message_id);
        }

        return formData;
    }

    /**
     * Handles message send failures with error-classification-based retry logic.
     * 
     * Error Classification Impact:
     * - BLOCKING: Message stays at head of queue, blocks later messages (network/server errors)
     * - NON_BLOCKING: Message marked as error, skipped in future iterations (client/business errors)
     * - ABORT: No retry, no state change (user-initiated cancellation)
     */
    private async handleFailure(msg: LocalMessageEntry, err: unknown): Promise<void> {
        const classification = classifyError(err);
        
        // ABORT: User initiated cancellation (logout/pause) - don't retry, don't update state
        if (classification === 'ABORT') {
            console.log(`${TAG} Aborted request for ${msg.message_id} - no retry`);
            return;
        }

        const retryCount = (msg.retry_count || 0) + 1;
        const secureBlocked = isE2EESecureSendBlockedError(err);
        const fallbackErrorMessage = msg.message_type === 'text'
            ? 'Message could not be sent.'
            : 'File could not be sent.';
        const errorMessage = secureBlocked
            ? fallbackErrorMessage
            : err instanceof Error ? err.message : String(err);
        
        // NON_BLOCKING errors (4xx/client/business/security-policy errors):
        // Mark as terminal immediately - don't waste retries or block later messages
        const isNonBlocking = classification === 'NON_BLOCKING';
        const terminal = isNonBlocking || retryCount >= MAX_RETRIES;

        await updateMessageStatus(msg.message_id, {
            status: terminal ? 'error' : 'pending',
            retry_count: retryCount,
            last_retry_at: isNonBlocking ? null : new Date().toISOString(),
            error_message: errorMessage,
            error_is_blocking: !isNonBlocking, // true for BLOCKING, false for NON_BLOCKING
        });

        this.syncInMemoryMessageStatus(msg.chat_id, msg.message_id, {
            status: terminal ? 'error' : 'pending',
            progress: terminal ? undefined : 0,
        });
        this.syncPreviewStatus(msg.chat_id, [msg.message_id], terminal ? 'error' : 'pending');

        if (terminal) {
            const fallback =
                msg.message_type === 'text'
                    ? 'Message could not be sent.'
                    : 'File could not be sent.';
            
            // For non-blocking errors, show specific error message
            const userMessage = isNonBlocking 
                ? getChatErrorMessage(err, fallback)
                : getChatErrorMessage(err, fallback);
            
            $chatMessagesState.setError(msg.chat_id, userMessage);
            
            if (secureBlocked) {
                console.warn(`${TAG} Secure send blocked for ${msg.message_id} (${err.reason}) - marking non-blocking error, no transport call`);
            } else if (isNonBlocking) {
                console.warn(`${TAG} Non-blocking error (${classification}) for ${msg.message_id} - marking as error, will skip: ${errorMessage}`);
            } else {
                console.error(`${TAG} Failed permanently (${retryCount}/${MAX_RETRIES}): ${msg.message_id} - ${errorMessage}`);
            }
            return;
        }

        // BLOCKING errors (network/server): Apply exponential backoff
        // Message stays at head of queue, blocking later messages
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, retryCount - 1);
        this.scheduleRetry(backoffMs);
        console.warn(`${TAG} Blocking error (attempt ${retryCount}/${MAX_RETRIES}) for ${msg.message_id} - retry in ${backoffMs}ms (blocks queue)`);
    }

    private isInBackoff(msg: LocalMessageEntry): boolean {
        if (!msg.last_retry_at || msg.retry_count === 0) return false;
        return this.getBackoffRemainingMs(msg) > 0;
    }

    private getBackoffRemainingMs(msg: LocalMessageEntry): number {
        if (!msg.last_retry_at || msg.retry_count === 0) return 0;
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, msg.retry_count - 1);
        const lastRetry = new Date(msg.last_retry_at).getTime();
        return Math.max(0, backoffMs - (Date.now() - lastRetry));
    }

    private syncInMemoryMessageStatus(chatId: string, messageId: string, updates: Partial<MessageEntry>): void {
        $chatMessagesState.updateMessageStatus(chatId, messageId, updates);
    }

    private syncPreviewStatus(chatId: string, messageIds: string[], status: string): void {
        const chatEntry = $chatListState.chatsById[chatId]?.peek();
        if (!chatEntry?.last_message_id || !messageIds.includes(chatEntry.last_message_id)) {
            return;
        }

        $chatListState.upsertChat({
            ...chatEntry,
            last_message_status: status,
            updated_at: new Date().toISOString(),
        } as ChatEntry);
    }

    private upsertOutgoingPreview(
        chatId: string,
        message: MessageEntry,
        recipientId: string,
        recipientName?: string,
    ): void {
        const existingChat = $chatListState.chatsById[chatId]?.peek();
        const contactEntry = $contactsState.contactsById[recipientId]?.peek() || $contactsState.addedYouById[recipientId]?.peek();
        $chatListState.upsertChat({
            ...existingChat,
            chat_id: chatId,
            other_user_id: existingChat?.other_user_id || recipientId,
            other_user_name: existingChat?.other_user_name || contactEntry?.name || recipientName || 'User',
            other_user_username: existingChat?.other_user_username || contactEntry?.username || '',
            avatar_url: existingChat?.avatar_url ?? contactEntry?.avatarUrl ?? null,
            last_message_content: getPreviewText(message),
            last_message_created_at: message.created_at,
            last_message_type: message.message_type,
            last_message_status: message.status || 'pending',
            last_message_is_from_me: true,
            last_message_id: message.message_id,
            last_message_sender_id: authState.userId.peek() || null,
            last_message_is_unsent: false,
            unread_count: existingChat?.unread_count || 0,
            created_at: existingChat?.created_at || message.created_at,
            other_user_last_read_at: existingChat?.other_user_last_read_at || new Date(0).toISOString(),
            other_user_last_delivered_at: existingChat?.other_user_last_delivered_at || '',
            updated_at: message.created_at,
            avatar_file_id: existingChat?.avatar_file_id ?? contactEntry?.avatarFileId ?? null,
            cached_avatar_file_id: existingChat?.cached_avatar_file_id ?? contactEntry?.cachedAvatarFileId ?? null,
            is_contactable: existingChat?.is_contactable ?? true,
            local_message_count: Math.max(1, existingChat?.local_message_count ?? 0),
        } as ChatEntry);
    }

    private scheduleRetry(delayMs: number): void {
        if (this._paused) return;

        const clampedDelay = Math.max(0, delayMs);
        const deadline = Date.now() + clampedDelay;
        if (this._retryDeadline != null && this._retryDeadline <= deadline) {
            return;
        }

        this.clearRetryTimer();
        this._retryDeadline = deadline;
        this._retryTimer = setTimeout(() => {
            this._retryTimer = null;
            this._retryDeadline = null;
            void this.processQueue();
        }, clampedDelay);
    }

    private clearRetryTimer(): void {
        if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
        }
        this._retryDeadline = null;
    }
}

export const outboxQueue = new OutboxQueue();
