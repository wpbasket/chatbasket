import { Platform } from 'react-native';
import { apiClient } from "@/lib/constantLib";
import { authState } from "@/state/auth/state.auth";
import type {
    GetChatsResponse,
    GetMessagesResponse,
    EligibilityResponse,
    AckDeliveryResponse,
    AckDeliveryBatchResponse,
    StatusOkayResponse,
    ConfirmChatUploadResponse,
    GetFileURLResponse,
    CheckEligibilityPayload,
    CreateChatPayload,
    SendMessagePayload,
    AckDeliveryPayload,
    AckDeliveryBatchPayload,
    GetMessagesQuery,
    MarkChatReadPayload,
    GetFileURLQuery,
    UnsendMessagePayload,
    DeleteMessageForMePayload,
    GetSyncActionsQuery,
    GetSyncActionsResponse,
    AcknowledgeSyncActionPayload,
    PresignChatUploadPayload,
    PresignChatUploadResponse,
    ConfirmChatUploadPayload,
    ChatEntry,
    MessageEntry,
    HistorySyncRequestPayload,
    HistorySyncResponse,
    HistorySyncUploadPayload,
    HistorySyncDownloadResponse,
} from "@/lib/personalLib";

/** POST /personal/chat/check-eligibility */
async function checkEligibility(payload: CheckEligibilityPayload): Promise<EligibilityResponse> {
    return apiClient.post<EligibilityResponse>('/personal/chat/check-eligibility', payload);
}

/** POST /personal/chat/create → returns ChatEntry (or existing chat) */
async function createChat(payload: CreateChatPayload): Promise<ChatEntry> {
    return apiClient.post<ChatEntry>('/personal/chat/create', payload);
}

/** POST /personal/chat/send → returns the created MessageEntry */
async function sendMessage(payload: SendMessagePayload, signal?: AbortSignal): Promise<MessageEntry> {
    return apiClient.post<MessageEntry>('/personal/chat/send', payload, { signal });
}

/**
 * GET /personal/chat/messages?chat_id=&limit=&offset=
 * Backend uses Go `query:` tag binding — params go in the URL.
 */
async function getMessages(query: GetMessagesQuery): Promise<GetMessagesResponse> {
    const params = new URLSearchParams({ chat_id: query.chat_id });
    if (query.limit != null) params.set('limit', String(query.limit));
    if (query.offset != null) params.set('offset', String(query.offset));
    return apiClient.get<GetMessagesResponse>(`/personal/chat/messages?${params.toString()}`);
}

/** POST /personal/chat/ack */
async function acknowledgeDelivery(payload: AckDeliveryPayload): Promise<AckDeliveryResponse> {
    return apiClient.post<AckDeliveryResponse>('/personal/chat/ack', payload);
}

/** 
 * POST /personal/chat/ack-batch (REST fallback — no batch endpoint exists)
 * Loops individual ACKs. Use ChatTransport.acknowledgeDeliveryBatch for WS-first batching.
 */
async function acknowledgeDeliveryBatch(payload: AckDeliveryBatchPayload): Promise<AckDeliveryBatchResponse> {
    for (const id of payload.message_ids) {
        try {
            await acknowledgeDelivery({ message_id: id, acknowledged_by: 'recipient', success: payload.success });
        } catch (e) {
            console.error(`[REST] acknowledgeDeliveryBatch: Failed to ACK message ${id}`, e);
        }
    }
    return { acknowledged_count: payload.message_ids.length };
}

/** GET /personal/chat/list → returns full chat inbox */
async function getUserChats(): Promise<GetChatsResponse> {
    return apiClient.get<GetChatsResponse>('/personal/chat/list');
}

/** POST /personal/chat/presign */
async function presignChatUpload(payload: PresignChatUploadPayload, signal?: AbortSignal): Promise<PresignChatUploadResponse> {
    return apiClient.post<PresignChatUploadResponse>('/personal/chat/presign', payload, { signal });
}

/** POST /personal/chat/confirm */
async function confirmChatUpload(payload: ConfirmChatUploadPayload, signal?: AbortSignal): Promise<ConfirmChatUploadResponse> {
    return apiClient.post<ConfirmChatUploadResponse>('/personal/chat/confirm', payload, { signal });
}

/** GET /personal/chat/file-url?message_id= */
async function getFileURL(query: GetFileURLQuery): Promise<GetFileURLResponse> {
    const params = new URLSearchParams({ message_id: query.message_id });
    return apiClient.get<GetFileURLResponse>(`/personal/chat/file-url?${params.toString()}`);
}

/** POST /personal/chat/mark-read */
async function markChatRead(payload: MarkChatReadPayload): Promise<StatusOkayResponse> {
    return apiClient.post<StatusOkayResponse>('/personal/chat/mark-read', payload);
}

/** POST /personal/chat/unsend */
async function unsendMessage(payload: UnsendMessagePayload): Promise<StatusOkayResponse> {
    return apiClient.post<StatusOkayResponse>('/personal/chat/unsend', payload);
}

/** POST /personal/chat/delete-for-me */
async function deleteMessageForMe(payload: DeleteMessageForMePayload): Promise<StatusOkayResponse> {
    return apiClient.post<StatusOkayResponse>('/personal/chat/delete-for-me', payload);
}

/** GET /personal/chat/sync-actions */
async function getSyncActions(query: GetSyncActionsQuery): Promise<GetSyncActionsResponse> {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    return apiClient.get<GetSyncActionsResponse>(`/personal/chat/sync-actions?${params.toString()}`);
}

/** POST /personal/chat/sync-actions/ack */
async function acknowledgeSyncAction(payload: AcknowledgeSyncActionPayload): Promise<StatusOkayResponse> {
    return apiClient.post<StatusOkayResponse>('/personal/chat/sync-actions/ack', payload);
}


/** GET /personal/chat/pending?limit= */
async function getPendingMessages(query: { limit?: number }): Promise<GetMessagesResponse> {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    return apiClient.get<GetMessagesResponse>(`/personal/chat/pending?${params.toString()}`);
}

/** POST /personal/chat/history-sync/request */
async function requestHistorySync(payload: HistorySyncRequestPayload): Promise<HistorySyncResponse> {
    return apiClient.post<HistorySyncResponse>('/personal/chat/history-sync/request', payload);
}

/** POST /personal/chat/history-sync/upload */
async function uploadHistorySync(payload: HistorySyncUploadPayload): Promise<void> {
    return apiClient.post<void>('/personal/chat/history-sync/upload', payload);
}

/** GET /personal/chat/history-sync?request_id= */
async function downloadHistorySync(request_id: string): Promise<HistorySyncDownloadResponse> {
    const params = new URLSearchParams({ request_id });
    return apiClient.get<HistorySyncDownloadResponse>(`/personal/chat/history-sync?${params.toString()}`);
}

export const PersonalChatApi = {
    checkEligibility,
    createChat,
    sendMessage,
    getMessages,
    acknowledgeDelivery,
    acknowledgeDeliveryBatch,
    getUserChats,
    presignChatUpload,
    confirmChatUpload,
    getFileURL,
    markChatRead,
    unsendMessage,
    deleteMessageForMe,
    getSyncActions,
    acknowledgeSyncAction,
    getPendingMessages,
    requestHistorySync,
    uploadHistorySync,
    downloadHistorySync,
};
