import { Platform } from 'react-native';
import { apiClient } from "@/lib/constantLib";
import { authState } from "@/state/auth/state.auth";
import { wsClient } from "./ws.client";
import type {
    GetChatsResponse,
    GetMessagesResponse,
    EligibilityResponse,
    AckDeliveryResponse,
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

/**
 * Common wrapper that attempts WebSocket communication first.
 * If the WebSocket is disconnected, it falls back to the provided REST action.
 */
async function request<T>(type: string, payload: any, restAction: () => Promise<T>): Promise<T> {
    if (wsClient.isConnected) {
        try {
            return await wsClient.send<T>(type, payload);
        } catch (err) {
            console.warn(`[API] WS request "${type}" failed, falling back to REST:`, err);
            return restAction();
        }
    }
    return restAction();
}

/** POST /personal/chat/check-eligibility */
async function checkEligibility(payload: CheckEligibilityPayload): Promise<EligibilityResponse> {
    return apiClient.post<EligibilityResponse>('/personal/chat/check-eligibility', payload);
}

/** POST /personal/chat/create → returns ChatEntry (or existing chat) */
async function createChat(payload: CreateChatPayload): Promise<ChatEntry> {
    return apiClient.post<ChatEntry>('/personal/chat/create', payload);
}

/** POST /personal/chat/send → returns the created MessageEntry */
async function sendMessage(payload: SendMessagePayload): Promise<MessageEntry> {
    return request<MessageEntry>(
        'send_message',
        payload,
        () => apiClient.post<MessageEntry>('/personal/chat/send', payload)
    );
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
    return request<AckDeliveryResponse>(
        'ack_delivery',
        payload,
        () => apiClient.post<AckDeliveryResponse>('/personal/chat/ack', payload)
    );
}

/** 
 * POST /personal/chat/ack-batch (Phase B)
 * WS: 'ack_delivery_batch'
 * REST Fallback: Backend lacks a dedicated batch endpoint, so we loop over individual ACKs.
 */
async function acknowledgeDeliveryBatch(payload: AckDeliveryBatchPayload): Promise<AckDeliveryResponse> {
    return request<AckDeliveryResponse>(
        'ack_delivery_batch',
        payload,
        async () => {
            console.log(`[API] REST Fallback: Looping ${payload.message_ids.length} individual ACKs`);
            for (const id of payload.message_ids) {
                try {
                    await acknowledgeDelivery({
                        message_id: id,
                        acknowledged_by: 'recipient',
                        success: payload.success
                    });
                } catch (e) {
                    console.error(`[API] REST Fallback: Failed to ACK message ${id}`, e);
                }
            }
            return { acknowledged: true };
        }
    );
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
    onProgress: (progress: number) => void
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

/** POST /personal/chat/mark-read → backend returns { success: true } */
async function markChatRead(payload: MarkChatReadPayload): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(
        'mark_read',
        payload,
        () => apiClient.post<{ success: boolean }>('/personal/chat/mark-read', payload)
    );
}

/** POST /personal/chat/unsend */
async function unsendMessage(payload: UnsendMessagePayload): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(
        'unsend',
        payload,
        () => apiClient.post<{ success: boolean }>('/personal/chat/unsend', payload)
    );
}

/** POST /personal/chat/delete-for-me */
async function deleteMessageForMe(payload: DeleteMessageForMePayload): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(
        'delete_for_me',
        payload,
        () => apiClient.post<{ success: boolean }>('/personal/chat/delete-for-me', payload)
    );
}

/** GET /personal/chat/sync-actions */
async function getSyncActions(query: GetSyncActionsQuery): Promise<GetSyncActionsResponse> {
    const params = new URLSearchParams();
    if (query.limit != null) params.set('limit', String(query.limit));
    return apiClient.get<GetSyncActionsResponse>(`/personal/chat/sync-actions?${params.toString()}`);
}

/** POST /personal/chat/sync-actions/ack */
async function acknowledgeSyncAction(payload: AcknowledgeSyncActionPayload): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>('/personal/chat/sync-actions/ack', payload);
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
