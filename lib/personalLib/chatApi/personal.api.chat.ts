import { apiClient } from "@/lib/constantLib";
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
    GetMessagesQuery,
    MarkChatReadPayload,
    GetFileURLQuery,
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
async function sendMessage(payload: SendMessagePayload): Promise<MessageEntry> {
    return apiClient.post<MessageEntry>('/personal/chat/send', payload);
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

/** GET /personal/chat/list → returns full chat inbox */
async function getUserChats(): Promise<GetChatsResponse> {
    return apiClient.get<GetChatsResponse>('/personal/chat/list');
}

/** POST /personal/chat/upload (multipart/form-data) */
async function uploadFile(formData: FormData): Promise<UploadFileResponse> {
    return apiClient.post<UploadFileResponse>('/personal/chat/upload', formData);
}

/** GET /personal/chat/file-url?message_id= */
async function getFileURL(query: GetFileURLQuery): Promise<GetFileURLResponse> {
    const params = new URLSearchParams({ message_id: query.message_id });
    return apiClient.get<GetFileURLResponse>(`/personal/chat/file-url?${params.toString()}`);
}

/** POST /personal/chat/mark-read → backend returns { success: true } */
async function markChatRead(payload: MarkChatReadPayload): Promise<{ success: boolean }> {
    return apiClient.post<{ success: boolean }>('/personal/chat/mark-read', payload);
}


export const PersonalChatApi = {
    checkEligibility,
    createChat,
    sendMessage,
    getMessages,
    acknowledgeDelivery,
    getUserChats,
    uploadFile,
    getFileURL,
    markChatRead,
};
