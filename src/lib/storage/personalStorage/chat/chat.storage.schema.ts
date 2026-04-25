// lib/storage/personalStorage/chat/chat.storage.schema.ts

/**
 * Message entry in local storage.
 * Extends MessageEntry with local-only fields.
 */
export interface LocalMessageEntry {
    // Server fields (mirrors MessageEntry)
    message_id: string;
    chat_id: string;
    recipient_id: string;
    content: string | null;
    message_type: 'text' | 'file' | 'image' | 'video' | 'audio' | 'unsent';
    status: 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'error' | 'failed';
    is_from_me: boolean;
    delivered_to_recipient: boolean;
    delivered_to_recipient_primary: boolean;
    synced_to_sender_primary: boolean;
    created_at: string;
    expires_at: string | null;
    file_id: string | null;
    file_name: string | null;
    file_size: number | null;
    file_mime_type: string | null;
    view_url: string | null;
    download_url: string | null;
    file_token_expiry: string | null;

    // Local-only fields
    local_uri: string | null;      // Local file path (before upload)
    temp_id: string | null;        // Client-generated ID before server response
    acked_by_server: boolean;      // True after server ACK
    deleted_for_me: boolean;       // True after "delete for me"
    inserted_at: string;           // Local insertion timestamp
    updated_at: string;            // Last update timestamp

    // Outbox retry fields (only meaningful for is_from_me messages with status pending/sending/error)
    retry_count: number;           // Number of send attempts (0 = first attempt)
    last_retry_at: string | null;  // ISO timestamp of last retry attempt
    error_message: string | null;  // Last error message (cleared on successful send)
    error_is_blocking: boolean | null;  // True if error should block queue (network/server), false if non-blocking (client/business)
}

/**
 * Chat metadata in local storage.
 */
export interface LocalChatEntry {
    chat_id: string;
    other_user_id: string;
    other_user_name: string;
    other_user_username: string;
    avatar_url: string | null;
    avatar_file_id: string | null;
    cached_avatar_file_id: string | null;
    created_at: string;
    unread_count: number;
    other_user_last_read_at: string;
    other_user_last_delivered_at: string;
    last_message_content: string | null;
    last_message_created_at: string | null;
    last_message_type: string | null;
    last_message_is_from_me: boolean;
    last_message_status: string;
    last_message_sender_id: string | null;
    last_message_id: string | null;
    last_message_is_unsent: boolean;
    updated_at: string;
    is_contactable: boolean;
}

// NOTE: OutboxEntry has been removed. Outbox operations use LocalMessageEntry directly.
// The "outbox" is a logical concept — a filtered query on the messages table:
//   WHERE status IN ('pending', 'sending') AND is_from_me = true
// Retry fields (retry_count, last_retry_at, error_message) are on LocalMessageEntry.
//
// Design rationale (Correction #36 — best industry standard):
// - Signal, WhatsApp, and Telegram all use a single messages table with status-based filtering
// - Eliminates dual-write risk (no insert-into-outbox → send → delete-from-outbox → insert-into-messages race)
// - Single source of truth for UI rendering — no need to merge two data sources
// - Optimistic UI reads from one table; outbox processor queries same table with status filter
// - 3 nullable retry columns on messages table is negligible overhead
