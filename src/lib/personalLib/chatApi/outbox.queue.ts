import { Platform } from 'react-native';
import type { ChatEntry, MessageEntry } from '@/lib/personalLib';
import { ChatTransport } from './chat.transport';
import {
    getPendingOutboxMessages,
    getMediaBlob,
    swapTempIdToRealId,
    updateMessageStatus,
} from '@/lib/storage/personalStorage/chat/chat.storage';
import type { LocalMessageEntry } from '@/lib/storage/personalStorage/chat/chat.storage.schema';
import { $chatMessagesState, $chatListState } from '@/state/personalState/chat/personal.state.chat';
import { authState } from '@/state/auth/state.auth';
import { copyFileToPrivateDir } from '@/lib/personalLib/fileSystem/file.copy';
import { getPreviewText } from '@/utils/personalUtils/util.chatPreview';
import { getChatErrorMessage } from '@/utils/personalUtils/util.chatErrors';

const TAG = '[OutboxQueue]';
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2_000;

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

    pause(): void {
        this._paused = true;
        this.clearRetryTimer();
        console.log(`${TAG} Paused`);
    }

    resume(): void {
        this._paused = false;
        console.log(`${TAG} Resumed`);
        void this.processQueue();
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
            (input.messageType === 'image'
                ? 'image/jpeg'
                : input.messageType === 'video'
                    ? 'video/mp4'
                    : input.messageType === 'audio'
                        ? 'audio/mpeg'
                        : 'application/octet-stream');

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
            status: 'pending',
            delivered_to_recipient: false,
            synced_to_sender_primary: true,
            acked_by_server: false,
            file_name: fileName,
            file_size: fileSize,
            progress: 0,
        };

        const copyResult = await copyFileToPrivateDir(
            input.asset.uri,
            tempId,
            fileName,
            fileMimeType || undefined,
            Platform.OS === 'web' ? input.asset.file : undefined,
        );

        optimisticMsg.local_uri = copyResult.localUri;
        optimisticMsg.file_url = copyResult.localUri;

        await $chatMessagesState.addMessage(input.chatId, optimisticMsg);
        this.upsertOutgoingPreview(input.chatId, optimisticMsg, input.recipientId, input.recipientName);

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
                for (const msg of pending) {
                    if (this._paused) {
                        console.log(`${TAG} Paused mid-queue.`);
                        break;
                    }

                    if (this.isInBackoff(msg)) {
                        const remainingMs = this.getBackoffRemainingMs(msg);
                        nextRetryMs = nextRetryMs == null ? remainingMs : Math.min(nextRetryMs, remainingMs);
                        console.log(`${TAG} Skipping ${msg.message_id} (backoff active: ${remainingMs}ms remaining)`);
                        continue;
                    }

                    await this.processMessage(msg);
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

    private async processMessage(msg: LocalMessageEntry): Promise<void> {
        const id = msg.message_id;
        console.log(`${TAG} Processing ${id} (type=${msg.message_type}, retry=${msg.retry_count})`);

        await updateMessageStatus(id, { status: 'sending' });
        this.syncInMemoryMessageStatus(msg.chat_id, id, { status: 'sending' });
        this.syncPreviewStatus(msg.chat_id, [id], 'pending');

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

    private async sendText(msg: LocalMessageEntry): Promise<void> {
        const response = await ChatTransport.sendMessage({
            recipient_id: msg.recipient_id,
            content: msg.content || '',
            message_type: 'text',
        });

        if (!response?.message_id) {
            throw new Error(`Server returned no message_id for ${msg.message_id}`);
        }

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

        const sentMessage: MessageEntry = {
            ...response,
            status: 'sent',
            content: response.content || msg.content || '',
            message_type: response.message_type || 'text',
            chat_id: response.chat_id || msg.chat_id,
            recipient_id: response.recipient_id || msg.recipient_id,
            is_from_me: true,
            delivered_to_recipient: response.delivered_to_recipient ?? false,
            synced_to_sender_primary: response.synced_to_sender_primary ?? true,
        };

        await this.promoteTempMessage(msg, sentMessage);
        console.log(`${TAG} Text sent: ${msg.message_id} -> ${response.message_id}`);
    }

    private async sendFile(msg: LocalMessageEntry): Promise<void> {
        const formData = await this.buildFormDataForRetry(msg);
        const response = await ChatTransport.uploadFileWithProgress(formData, (progress) => {
            this.syncInMemoryMessageStatus(msg.chat_id, msg.message_id, {
                status: 'sending',
                progress,
            });
        });

        if (!response?.message_id) {
            throw new Error(`Server returned no message_id for file ${msg.message_id}`);
        }

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

        const sentMessage: MessageEntry = {
            ...response,
            chat_id: msg.chat_id,
            recipient_id: msg.recipient_id,
            is_from_me: true,
            message_type: msg.message_type,
            content: msg.content || '',
            status: 'sent',
            delivered_to_recipient: false,
            synced_to_sender_primary: true,
            local_uri: msg.local_uri,
            file_name: response.file_name ?? msg.file_name,
            file_size: response.file_size ?? msg.file_size,
            file_mime_type: response.file_mime_type ?? msg.file_mime_type,
            view_url: response.view_url || msg.local_uri || undefined,
            download_url: response.download_url,
            progress: 100,
            file_id: response.file_id ?? null,
            expires_at: response.expires_at,
        };

        await this.promoteTempMessage(msg, sentMessage);
        console.log(`${TAG} File sent: ${msg.message_id} -> ${response.message_id}`);
    }

    private async promoteTempMessage(msg: LocalMessageEntry, sentMessage: MessageEntry): Promise<void> {
        $chatMessagesState.removeMessage(msg.chat_id, msg.message_id);
        await $chatMessagesState.addMessage(msg.chat_id, sentMessage);

        const currentEntry = $chatListState.chatsById[msg.chat_id]?.peek();
        if (!currentEntry) return;

        if (currentEntry.last_message_id !== msg.message_id && currentEntry.last_message_id !== sentMessage.message_id) {
            return;
        }

        $chatListState.upsertChat({
            ...currentEntry,
            last_message_content: getPreviewText(sentMessage),
            last_message_created_at: sentMessage.created_at,
            last_message_status: 'sent',
            last_message_is_from_me: true,
            last_message_type: sentMessage.message_type,
            last_message_id: sentMessage.message_id,
            last_message_sender_id: authState.userId.peek() || null,
            last_message_is_unsent: false,
            updated_at: sentMessage.created_at,
        } as ChatEntry);
    }

    private async buildFormDataForRetry(msg: LocalMessageEntry): Promise<FormData> {
        const formData = new FormData();
        formData.append('recipient_id', msg.recipient_id);
        formData.append('message_type', msg.message_type);
        formData.append('caption', msg.content || '');

        if (Platform.OS === 'web') {
            const media = await getMediaBlob(msg.message_id);
            if (!media) {
                throw new Error(`No blob found in IDB for ${msg.message_id}`);
            }
            const file = new File([media.blob], msg.file_name || media.fileName || 'file', {
                type: msg.file_mime_type || media.mimeType || 'application/octet-stream',
            });
            formData.append('file', file);
        } else {
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

    private async handleFailure(msg: LocalMessageEntry, err: unknown): Promise<void> {
        const retryCount = (msg.retry_count || 0) + 1;
        const errorMessage = err instanceof Error ? err.message : String(err);
        const terminal = retryCount >= MAX_RETRIES;

        await updateMessageStatus(msg.message_id, {
            status: terminal ? 'error' : 'pending',
            retry_count: retryCount,
            last_retry_at: new Date().toISOString(),
            error_message: errorMessage,
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
            $chatMessagesState.setError(msg.chat_id, getChatErrorMessage(err, fallback));
            console.error(`${TAG} Failed permanently (${retryCount}/${MAX_RETRIES}): ${msg.message_id} - ${errorMessage}`);
            return;
        }

        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, retryCount - 1);
        this.scheduleRetry(backoffMs);
        console.warn(`${TAG} Attempt ${retryCount}/${MAX_RETRIES} failed: ${msg.message_id} - next retry in ${backoffMs}ms`);
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
        $chatListState.upsertChat({
            ...existingChat,
            chat_id: chatId,
            other_user_id: existingChat?.other_user_id || recipientId,
            other_user_name: existingChat?.other_user_name || recipientName || 'User',
            other_user_username: existingChat?.other_user_username || '',
            avatar_url: existingChat?.avatar_url ?? null,
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
