// ============================================================================
// MESSAGE TYPES
// ============================================================================

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file';

// ============================================================================
// RESPONSE MODELS — match Go personalmodel/chat_models.go
// ============================================================================

/**
 * ChatEntry represents a single chat in the user's chat list (inbox).
 * Maps to Go `ChatResponse`.
 */
export interface ChatEntry {
    chat_id: string;
    other_user_id: string;
    other_user_name: string;
    other_user_username: string;
    avatar_url: string | null;        // Go *string
    created_at: string;               // Go time.Time → JSON string
    updated_at: string;
    other_user_last_read_at: string;  // Go time.Time → JSON string (Added Phase 9)
    last_message_content: string | null;     // Go *string
    last_message_created_at: string | null;  // Go *time.Time → JSON string | null
    last_message_type: string | null;        // Go *string
    last_message_is_from_me: boolean;        // Calculated by backend
    last_message_status: string;             // Go string (Required now)
    last_message_sender_id: string | null;   // Go *string
    unread_count: number;
}

/**
 * MessageEntry represents a single message within a chat.
 * Maps to Go `MessageResponse`.
 */
export interface MessageEntry {
    message_id: string;
    chat_id: string;
    is_from_me: boolean;
    recipient_id: string;
    content: string;
    message_type: string;    // Go string (text|image|video|audio|file)
    delivered_to_recipient: boolean; // Go bool (Added in Phase 8b)
    status?: 'pending' | 'sent' | 'read';
    created_at: string;      // Go time.Time → JSON string
    expires_at: string;
}

/**
 * EligibilityResponse indicates whether the user can message a recipient.
 * Maps to Go `MessagingEligibilityResponse`.
 */
export interface EligibilityResponse {
    allowed: boolean;
    reason?: string;         // Go omitempty
}

/**
 * GetChatsResponse wraps the chat list endpoint response.
 * Maps to Go `GetUserChatsResponse`.
 */
export interface GetChatsResponse {
    chats: ChatEntry[];
    count: number;
}

/**
 * GetMessagesResponse wraps the messages endpoint response.
 * Maps to Go `GetMessagesResponse`.
 */
export interface GetMessagesResponse {
    messages: MessageEntry[];
    count: number;
}

/**
 * AckDeliveryResponse wraps the ACK endpoint response.
 * Maps to Go `AcknowledgeDeliveryResponse`.
 */
export interface AckDeliveryResponse {
    acknowledged: boolean;
}

/**
 * UploadFileResponse wraps the file upload endpoint response.
 * Maps to Go `UploadFileResponse`.
 */
export interface UploadFileResponse {
    message_id: string;
    file_url: string;
    file_name: string | null;   // Go *string
    file_size: number | null;   // Go *int64
    created_at: string;
    expires_at: string;
}

/**
 * GetFileURLResponse wraps the file URL fetch response.
 * Maps to Go `GetFileURLResponse`.
 */
export interface GetFileURLResponse {
    file_url: string;
}

// ============================================================================
// REQUEST PAYLOADS — match Go payload structs
// ============================================================================

/** POST /personal/chat/check-eligibility */
export interface CheckEligibilityPayload {
    recipient_id: string;
}

/** POST /personal/chat/create */
export interface CreateChatPayload {
    recipient_id: string;
}

/**
 * POST /personal/chat/send
 * Note: backend auto-creates chat via CreateOrGetChat → no chat_id needed.
 */
export interface SendMessagePayload {
    recipient_id: string;
    content: string;
    message_type: string;    // text|image|video|audio|file
}

/** POST /personal/chat/ack */
export interface AckDeliveryPayload {
    message_id: string;
    acknowledged_by: 'recipient' | 'sender';
    success: boolean;
}

/**
 * GET /personal/chat/messages — Go uses `query:` tag binding (query params).
 */
export interface GetMessagesQuery {
    chat_id: string;
    limit?: number;
    offset?: number;
}

/** POST /personal/chat/mark-read */
export interface MarkChatReadPayload {
    chat_id: string;
}

/** GET /personal/chat/file-url — query params */
export interface GetFileURLQuery {
    message_id: string;
}
