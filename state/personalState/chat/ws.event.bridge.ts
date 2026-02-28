/**
 * WebSocket Event Bridge
 *
 * Maps backend WebSocket events to Legend State actions.
 * This is the single integration point between the WS client and the chat state.
 *
 * Event Flow:
 *   Backend WS → ws.client.ts → ws.event.bridge.ts → $chatMessagesState / $chatListState
 *
 * Each handler is fire-and-forget — errors are logged but never bubble up.
 */
import type { MessageEntry, ChatEntry } from '@/lib/personalLib';
import type { WSEvent } from '@/lib/personalLib/chatApi/ws.client';
import { wsClient } from '@/lib/personalLib/chatApi/ws.client';
import { PersonalChatApi } from '@/lib/personalLib/chatApi/personal.api.chat';
import { $chatMessagesState, $chatListState, sharedAckTracker, ackIncomingMessages } from '@/state/personalState/chat/personal.state.chat';
import { $syncEngine } from '@/state/personalState/chat/personal.state.sync';
import { getPreviewText } from '@/utils/personalUtils/util.chatPreview';

// ─── Event Handlers ─────────────────────────────────────────────────────────

/**
 * new_message: A new message was sent in a chat we're part of.
 *
 * Payload from backend matches MessageEntry (MessageResponse JSON):
 * { message_id, chat_id, recipient_id, content, message_type, is_from_me, created_at, ... }
 */
function handleNewMessage(payload: any): void {
    console.log('[WS Bridge] handleNewMessage: ENTER', JSON.stringify(payload));
    const msg = payload as MessageEntry;
    if (!msg.chat_id || !msg.message_id) {
        console.warn('[WS Bridge] new_message: INVALID payload — missing chat_id or message_id', payload);
        return;
    }

    // Backend WS payloads don't carry the frontend-only 'status' field.
    // A message arriving over the wire is already server-confirmed, so it is 'sent'.
    if (!msg.status) {
        msg.status = 'sent';
    }

    // Add message to the active chat if it's open
    const activeChatId = $chatMessagesState.activeChatId.peek();
    console.log(`[WS Bridge] new_message: activeChatId=${activeChatId}, msg.chat_id=${msg.chat_id}`);

    if (activeChatId === msg.chat_id) {
        // Check for duplicates (the sender's device already has it via optimistic update)
        const existing = $chatMessagesState.chats.peek()?.[msg.chat_id]?.messagesById?.[msg.message_id];
        if (existing) {
            console.log(`[WS Bridge] new_message: DUPLICATE ${msg.message_id}, skipping`);
            return;
        }

        console.log(`[WS Bridge] new_message: ADDING to active chat state — msgID=${msg.message_id}`);
        $chatMessagesState.addMessage(msg.chat_id, msg);

        // Auto-read logic: since the chat is open, immediately mark as read (debounced)
        if (!msg.is_from_me) {
            console.log(`[WS Bridge] new_message: AUTO-READING message (debounced) because chat is open`);
            $chatMessagesState.debouncedMarkRead(msg.chat_id);
            $chatListState.markChatRead(msg.chat_id);
        }
    } else {
        console.log(`[WS Bridge] new_message: chat is NOT active, triggering background auto-ack`);
        // Trigger background delivery ACK for chats in the inbox
        ackIncomingMessages([msg]);
    }

    // Update chat list preview (upsert with latest message info)
    const currentEntry = $chatListState.chatsById[msg.chat_id]?.peek();
    console.log(`[WS Bridge] new_message: chatListEntry exists=${!!currentEntry}`);

    const previewContent = getPreviewText(msg);

    const isChatActive = activeChatId === msg.chat_id;
    const shouldIncrementUnread = !msg.is_from_me && !isChatActive;

    if (currentEntry) {
        const updatedEntry: ChatEntry = {
            ...currentEntry,
            last_message_content: previewContent,
            last_message_created_at: msg.created_at,
            last_message_type: msg.message_type,
            last_message_is_from_me: msg.is_from_me,
            last_message_id: msg.message_id,
            last_message_status: msg.status ?? 'sent',
            last_message_is_unsent: msg.message_type === 'unsent',
            unread_count: shouldIncrementUnread
                ? (currentEntry.unread_count || 0) + 1
                : (isChatActive ? 0 : currentEntry.unread_count),
        };
        console.log(`[WS Bridge] new_message: UPSERTING chat list — unread_count=${updatedEntry.unread_count}`);
        $chatListState.upsertChat(updatedEntry);
    } else {
        // Construct a new ChatEntry for previously unknown chats (instantly shows up on Home screen)
        const otherUserId = msg.is_from_me ? msg.recipient_id : (msg as any).sender_id || msg.recipient_id; // Fallback for sender_id

        const newEntry: ChatEntry = {
            chat_id: msg.chat_id,
            other_user_id: otherUserId,
            other_user_name: '', // Will be updated by contacts or subsequent sync
            other_user_username: '',
            avatar_url: '',
            last_message_content: previewContent,
            last_message_created_at: msg.created_at,
            last_message_type: msg.message_type,
            last_message_is_from_me: msg.is_from_me,
            last_message_id: msg.message_id,
            last_message_status: msg.status ?? 'sent',
            last_message_sender_id: msg.is_from_me ? 'me' : otherUserId, // Placeholder or real ID
            last_message_is_unsent: msg.message_type === 'unsent',
            unread_count: shouldIncrementUnread ? 1 : 0,
            created_at: msg.created_at,
            updated_at: msg.created_at,
            other_user_last_read_at: '',
            other_user_last_delivered_at: '',
        };
        console.log(`[WS Bridge] new_message: CREATING NEW chat list entry — unread_count=${newEntry.unread_count}`);
        $chatListState.upsertChat(newEntry);
    }

    console.log(`[WS Bridge] new_message: DONE — msgID=${msg.message_id} chatID=${msg.chat_id} is_from_me=${msg.is_from_me} content="${msg.content?.substring(0, 50)}"`);
}

/**
 * delivery_ack: Recipient has acknowledged delivery of a message we sent.
 *
 * Payload: { message_id, chat_id, acknowledged_by }
 */
function handleDeliveryAck(payload: any): void {
    try {
        console.log('[WS Bridge] handleDeliveryAck: ENTER', JSON.stringify(payload));

        // Support both Phase A (singular) and Phase B (batched/array)
        const messageIds: string[] = Array.isArray(payload.message_ids)
            ? payload.message_ids
            : payload.message_id
                ? [payload.message_id]
                : [];

        const chat_id = payload.chat_id;
        const delivered_at = payload.delivered_at;

        if (messageIds.length === 0) {
            console.warn('[WS Bridge] delivery_ack: MISSING message_ids, skipping');
            return;
        }

        // 1. Remove from shared lock
        messageIds.forEach(id => sharedAckTracker.delete(id));

        // 2. Update the message status / chat meta
        const activeChatId = $chatMessagesState.activeChatId.peek();
        const targetChatId = chat_id || activeChatId;

        console.log(`[WS Bridge] delivery_ack: targetChatId=${targetChatId} (fromPayload=${chat_id}, active=${activeChatId})`);

        if (targetChatId) {
            if (delivered_at) {
                console.log(`[WS Bridge] delivery_ack: CALLING markMessagesDeliveredUpTo(${targetChatId}, ${delivered_at})`);
                $chatMessagesState.markMessagesDeliveredUpTo(targetChatId, delivered_at);
            } else {
                console.log(`[WS Bridge] delivery_ack: CALLING markMessagesDelivered(${targetChatId}, ${messageIds.length} ids)`);
                $chatMessagesState.markMessagesDelivered(targetChatId, messageIds);
            }
        } else {
            console.warn('[WS Bridge] delivery_ack: NO targetChatId found, cannot update state');
        }

        console.log(`[WS Bridge] delivery_ack: DONE — ids=${messageIds.join(',')}`);
    } catch (err) {
        console.error('[WS Bridge] ❌ CRITICAL ERROR in handleDeliveryAck:', err);
    }
}

/**
 * read_receipt: The other participant has read a chat.
 *
 * Payload: { chat_id, reader_id, read_at }
 *
 * This maps to the Yellow→Green tick transition for messages we sent.
 */
function handleReadReceipt(payload: any): void {
    console.log('[WS Bridge] handleReadReceipt: ENTER', JSON.stringify(payload));
    const { chat_id, reader_id, read_at } = payload;
    if (!chat_id) {
        console.warn('[WS Bridge] read_receipt: MISSING chat_id, skipping');
        return;
    }

    // 1. Update status for active chat or list preview
    $chatMessagesState.markMessagesReadUpTo(chat_id, read_at);

    const activeChatId = $chatMessagesState.activeChatId.peek();
    console.log(`[WS Bridge] read_receipt: DONE — chat_id=${chat_id} reader_id=${reader_id} read_at=${read_at} isActiveChat=${activeChatId === chat_id}`);
}

/**
 * unsend: Messages were unsent (tombstoned) by the sender.
 *
 * Payload: { chat_id, message_ids }
 */
function handleUnsend(payload: any): void {
    console.log('[WS Bridge] handleUnsend: ENTER', JSON.stringify(payload));
    const { chat_id, message_ids, sender_id } = payload;
    if (!chat_id || !Array.isArray(message_ids)) {
        console.warn('[WS Bridge] unsend: INVALID payload — missing chat_id or message_ids', payload);
        return;
    }

    console.log(`[WS Bridge] unsend: CALLING unsendMessages for chat=${chat_id}, count=${message_ids.length}, sender=${sender_id}`);
    $chatMessagesState.unsendMessages(chat_id, message_ids, sender_id);

    console.log(`[WS Bridge] unsend: DONE — ${message_ids.length} messages in chat ${chat_id}`);
}

/**
 * delete_for_me: Messages were deleted-for-me by the same user on another device.
 *
 * Payload: { message_ids, chat_id }
 */
function handleDeleteForMe(payload: any): void {
    console.log('[WS Bridge] handleDeleteForMe: ENTER', JSON.stringify(payload));
    const { message_ids, chat_id } = payload;
    if (!Array.isArray(message_ids)) {
        console.warn('[WS Bridge] delete_for_me: INVALID payload — missing message_ids', payload);
        return;
    }

    // Use the chat_id from the payload if available, otherwise fall back to the active chat
    const targetChatId = chat_id || $chatMessagesState.activeChatId.peek();
    console.log(`[WS Bridge] delete_for_me: targetChatId=${targetChatId}, count=${message_ids.length}, ids=${message_ids.join(',')}`);
    if (targetChatId) {
        console.log(`[WS Bridge] delete_for_me: REMOVING ${message_ids.length} messages from chat ${targetChatId}`);
        $chatMessagesState.removeMessages(targetChatId, message_ids);

        // Clear the chat list preview if the deleted message was the last preview message
        const chatEntry = $chatListState.chatsById[targetChatId]?.peek();
        if (chatEntry && message_ids.includes(chatEntry.last_message_id)) {
            console.log(`[WS Bridge] delete_for_me: Cleared preview for chat ${targetChatId} (was last_message_id=${chatEntry.last_message_id})`);
            $chatListState.chatsById[targetChatId].assign({
                last_message_content: null,
                last_message_type: null,
            });
        }
    } else {
        console.log(`[WS Bridge] delete_for_me: NO chat_id and NO active chat, messages will be removed on next fetch`);
    }

    console.log(`[WS Bridge] delete_for_me: DONE — ${message_ids.length} messages`);
}

/**
 * sync_action: A sync action was created (covers unsend, delete_for_me, etc.).
 * This is a catch-all for actions that don't fit the above categories.
 *
 * Payload: matches SyncActionResponse
 */
function handleSyncAction(payload: any): void {
    console.log('[WS Bridge] handleSyncAction: ENTER', JSON.stringify(payload));
    console.log('[WS Bridge] sync_action: CALLING $syncEngine.fetchAndApply()');
    $syncEngine.fetchAndApply();
    console.log('[WS Bridge] sync_action: DONE — fetchAndApply triggered');
}

// ─── Event Router ───────────────────────────────────────────────────────────

function routeWSEvent(event: WSEvent): void {
    // Drop events that contain a ref field (already handled by wsClient.send promise logic)
    if (event.ref) {
        // console.log(`[WS Bridge] Ignoring response event (ref=${event.ref})`);
        return;
    }

    switch (event.type) {
        case 'new_message':
            handleNewMessage(event.payload);
            break;
        case 'delivery_ack':
            handleDeliveryAck(event.payload);
            break;
        case 'read_receipt':
            handleReadReceipt(event.payload);
            break;
        case 'unsend':
            handleUnsend(event.payload);
            break;
        case 'delete_for_me':
            handleDeleteForMe(event.payload);
            break;
        case 'sync_action':
            handleSyncAction(event.payload);
            break;
        case 'error':
            console.error(`[WS Bridge] Server reported error:`, event.error);
            break;
        default:
            console.warn(`[WS Bridge] UNKNOWN event type: "${event.type}"`, event);
    }
}

// ─── Lifecycle: Start/Stop ──────────────────────────────────────────────────

let unsubscribe: (() => void) | null = null;
let unsubscribeReconnect: (() => void) | null = null;

/**
 * Start the WebSocket event bridge.
 * Call this when the user enters the personal (authenticated) section.
 */
export function startWSEventBridge(): void {
    if (unsubscribe) return;
    unsubscribe = wsClient.subscribe(routeWSEvent);

    // Auto-sync on reconnection
    unsubscribeReconnect = wsClient.onReconnect(() => {
        console.log('[WS Bridge] Reconnected! Triggering sync...');
        $syncEngine.fetchAndApply();
        $chatMessagesState.syncPendingMessages();
    });

    wsClient.connect();
}

/**
 * Stop the WebSocket event bridge.
 * Call this when the user leaves the personal section or logs out.
 */
export function stopWSEventBridge(): void {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    if (unsubscribeReconnect) {
        unsubscribeReconnect();
        unsubscribeReconnect = null;
    }
    wsClient.disconnect();
}
