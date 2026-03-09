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
    UploadFileResponse,
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
    ChatEntry,
    MessageEntry,
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

/** POST /personal/chat/upload (multipart/form-data) */
async function uploadFile(formData: FormData): Promise<UploadFileResponse> {
    return apiClient.post<UploadFileResponse>('/personal/chat/upload', formData);
}

/**
 * POST /personal/chat/upload with progress tracking using XMLHttpRequest.
 * fetch() does not support upload progress tracking.
 */
function uploadFileWithProgress(
    formData: FormData,
    onProgress: (progress: number) => void,
    signal?: AbortSignal
): Promise<UploadFileResponse> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const url = `${apiClient.baseURL}/personal/chat/upload`.replace(/\/+$/, '');

        xhr.open('POST', url);

        // Standard headers
        xhr.setRequestHeader('Accept', 'application/json');

        // Add Authorization header for mobile (syncing with ApiClient logic)
        const isWeb = Platform.OS === 'web';
        const sessionId = authState.sessionId.peek();
        const userId = authState.userId.peek();

        if (sessionId && userId && !isWeb) {
            xhr.setRequestHeader('Authorization', `Bearer ${sessionId}:${userId}`);
        }

        // Web credentials mode
        if (isWeb) {
            xhr.withCredentials = true;
        }

        // Handle abort signal
        if (signal) {
            signal.addEventListener('abort', () => {
                console.log('[API] Upload aborted by signal');
                xhr.abort();
                reject(new Error('Upload aborted'));
            });
        }

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const progress = Math.round((event.loaded / event.total) * 100);
                onProgress(progress);
            }
        };

        xhr.onload = () => {
            console.log(`[API] Upload XHR onload. Status: ${xhr.status}`);
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch (e) {
                    reject(new Error('Failed to parse upload response'));
                }
            } else {
                try {
                    const errorData = JSON.parse(xhr.responseText);
                    reject(errorData);
                } catch {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new Error('Upload aborted'));

        xhr.send(formData);
    });
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


export const PersonalChatApi = {
    checkEligibility,
    createChat,
    sendMessage,
    getMessages,
    acknowledgeDelivery,
    acknowledgeDeliveryBatch,
    getUserChats,
    uploadFile,
    uploadFileWithProgress,
    getFileURL,
    markChatRead,
    unsendMessage,
    deleteMessageForMe,
    getSyncActions,
    acknowledgeSyncAction,
    getPendingMessages,
};
