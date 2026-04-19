// ============================================================================
// MESSAGE TYPES
// ============================================================================

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'unsent';

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
    other_user_last_delivered_at: string; // Added Phase 18
    last_message_content: string | null;     // Go *string
    last_message_created_at: string | null;  // Go *time.Time → JSON string | null
    last_message_type: string | null;        // Go *string
    last_message_is_from_me: boolean;        // Calculated by backend
    last_message_status: string;             // Go string (Required now)
    last_message_sender_id: string | null;   // Go *string
    last_message_id: string | null;          // Added Phase 14
    last_message_is_unsent?: boolean;        // Added Phase 5.3
    unread_count: number;

    // Local-only field (not from server) — set by client during sync
    is_contactable?: boolean;                // false when server omits this chat (blocked/private)
    local_message_count?: number;            // Count of non-deleted messages in local DB (0 = hidden from chat list)
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
    message_type: string;    // Go string (text|image|video|audio|file|unsent)
    delivered_to_recipient: boolean; // Go bool (Added in Phase 8b)
    delivered_to_recipient_primary?: boolean; // Go bool (Added Phase C) — backend MessageResponse field
    synced_to_sender_primary: boolean; // Added in Phase 17
    is_unsent?: boolean;             // Added Phase 5.3
    status?: 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'error' | 'failed'; // Phase D: expanded union
    created_at: string;      // Go time.Time → JSON string
    expires_at: string;
    file_name?: string | null;
    file_size?: number | null;
    file_mime_type?: string | null;
    view_url?: string;
    download_url?: string;
    progress?: number;
    file_id?: string | null;
    file_token_expiry?: string | null;

    // Phase D — local-only fields (optional: not present in server responses)
    acked_by_server?: boolean;       // True after server ACK
    deleted_for_me?: boolean;        // True after "delete for me"
    local_uri?: string | null;       // Local file path (before upload)
    temp_id?: string | null;         // Client-generated ID before server response
    
    // Outbox & Error Tracking (Added Phase D+1)
    retry_count?: number;            // Number of send attempts
    last_retry_at?: string | null;   // ISO timestamp of last retry attempt
    error_message?: string | null;   // Last error message
    error_is_blocking?: boolean | null; // True if error should block queue
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
    other_user_last_read_at: string; // Go time.Time → JSON string (Added)
    other_user_last_delivered_at: string; // Added Phase 18
}

/**
 * AckDeliveryResponse wraps the ACK endpoint response.
 * Maps to Go `AcknowledgeDeliveryResponse`.
 */
export interface AckDeliveryResponse {
    acknowledged: boolean;
}

/**
 * AckDeliveryBatchResponse wraps the WS batch ACK response.
 * Maps to Go `AckDeliveryBatchResponse` — returned by WS `ack_delivery_batch_response`.
 * Note: the REST fallback path returns `AckDeliveryResponse` (individual ACK loops).
 */
export interface AckDeliveryBatchResponse {
    acknowledged_count: number;
}

/**
 * StatusOkayResponse wraps the standard success response from the backend.
 * Maps to Go `model.StatusOkay` — returned by mark_read, unsend, delete_for_me, ack_sync_action.
 */
export interface StatusOkayResponse {
    status: boolean;
    message: string;
}

/**
 * UploadFileResponse wraps the file upload endpoint response.
 * Maps to Go `UploadFileResponse`.
 */
export interface UploadFileResponse {
    message_id: string;
    file_id: string;
    message_type: string;
    file_mime_type?: string | null;
    view_url?: string;
    download_url: string;
    file_name: string | null;
    file_size: number | null;
    created_at: string;
    expires_at: string;
    file_token_expiry?: string | null;
}

/**
 * GetFileURLResponse wraps the file URL fetch response.
 */
export interface GetFileURLResponse {
    view_url?: string;
    download_url: string;
    file_token_expiry?: string | null;
}

/**
 * SyncActionResponse represents a single synchronization command from the relay.
 */
export interface SyncActionEntry {
    id: string;
    user_id: string;
    action_type: 'unsend' | 'delete_for_me';
    payload: any; // Context-dependent (contains message_ids, chat_id, etc.)
    delivered_to_primary: boolean;
    created_at: string;
}

/**
 * GetSyncActionsResponse wraps the sync actions list endpoint.
 */
export interface GetSyncActionsResponse {
    actions: SyncActionEntry[];
    count: number;
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

export interface AckDeliveryPayload {
    message_id: string;
    acknowledged_by: 'recipient' | 'sender';
    success: boolean;
}

/** POST /personal/chat/ack-batch (Phase B) */
export interface AckDeliveryBatchPayload {
    message_ids: string[];
    acknowledged_by: 'recipient' | 'sender';
    recipient_id?: string; // Optional for sender-sync broadcasts
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

/** POST /personal/chat/unsend */
export interface UnsendMessagePayload {
    chat_id: string;
    message_ids: string[];
}

/** POST /personal/chat/delete-for-me */
export interface DeleteMessageForMePayload {
    message_ids: string[];
}

/** GET /personal/chat/sync-actions — query params */
export interface GetSyncActionsQuery {
    limit?: number;
}

/** POST /personal/chat/sync-actions/ack */
export interface AcknowledgeSyncActionPayload {
    action_id: string;
}
