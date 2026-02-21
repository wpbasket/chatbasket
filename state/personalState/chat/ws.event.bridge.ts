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
import { $chatMessagesState, $chatListState } from '@/state/personalState/chat/personal.state.chat';
import { $syncEngine } from '@/state/personalState/chat/personal.state.sync';

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

        // Auto-read logic: since the chat is open, immediately mark as read
        if (!msg.is_from_me) {
            console.log(`[WS Bridge] new_message: AUTO-READING message because chat is open`);
            void PersonalChatApi.markChatRead({ chat_id: msg.chat_id }).catch((err) => {
                console.warn(`[WS Bridge] new_message: Failed to auto-read`, err);
            });
            $chatListState.markChatRead(msg.chat_id);
        }
    } else {
        console.log(`[WS Bridge] new_message: chat is NOT active, skipping addMessage (will update list only)`);

        // Even if the chat isn't open, the device HAS received the message.
        // We MUST send a delivery ACK so the sender sees the Yellow Tick and the DB updates.
        if (!msg.is_from_me) {
            console.log(`[WS Bridge] new_message: Sending BACKGROUND delivery ACK for ${msg.message_id}`);
            PersonalChatApi.acknowledgeDelivery({
                message_id: msg.message_id,
                acknowledged_by: 'recipient',
                success: true,
            }).catch(err => console.warn(`[WS Bridge] Background ACK failed`, err));
        }
    }

    // Update chat list preview (upsert with latest message info)
    const currentEntry = $chatListState.chatsById[msg.chat_id]?.peek();
    console.log(`[WS Bridge] new_message: chatListEntry exists=${!!currentEntry}`);
    if (currentEntry) {
        let previewContent = msg.content;
        if (!previewContent && msg.file_name) {
            previewContent = `📄 ${msg.file_name}`;
        }

        const updatedEntry: ChatEntry = {
            ...currentEntry,
            last_message_content: previewContent,
            last_message_created_at: msg.created_at,
            last_message_type: msg.message_type,
            last_message_is_from_me: msg.is_from_me,
            last_message_id: msg.message_id,
            last_message_status: msg.status ?? 'sent',
            unread_count: !msg.is_from_me && activeChatId !== msg.chat_id
                ? (currentEntry.unread_count || 0) + 1
                : currentEntry.unread_count,
        };
        console.log(`[WS Bridge] new_message: UPSERTING chat list — unread_count=${updatedEntry.unread_count}`);
        $chatListState.upsertChat(updatedEntry);
    }

    console.log(`[WS Bridge] new_message: DONE — msgID=${msg.message_id} chatID=${msg.chat_id} is_from_me=${msg.is_from_me} content="${msg.content?.substring(0, 50)}"`);
}

/**
 * delivery_ack: Recipient has acknowledged delivery of a message we sent.
 *
 * Payload: { message_id, chat_id, acknowledged_by }
 */
function handleDeliveryAck(payload: any): void {
    console.log('[WS Bridge] handleDeliveryAck: ENTER', JSON.stringify(payload));
    const { message_id, chat_id } = payload;
    if (!message_id) {
        console.warn('[WS Bridge] delivery_ack: MISSING message_id, skipping');
        return;
    }

    // Update the message status if the chat is open
    const activeChatId = $chatMessagesState.activeChatId.peek();
    console.log(`[WS Bridge] delivery_ack: activeChatId=${activeChatId}, payload.chat_id=${chat_id}`);
    if (chat_id) {
        console.log(`[WS Bridge] delivery_ack: UPDATING messages up to ${message_id} in chat ${chat_id} → delivered_to_recipient=true`);
        $chatMessagesState.markMessagesDeliveredUpTo(chat_id, message_id);
    }

    console.log(`[WS Bridge] delivery_ack: DONE — msgID=${message_id}`);
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

    // Update the chat list entry with the new read timestamp
    const currentEntry = $chatListState.chatsById[chat_id]?.peek();
    console.log(`[WS Bridge] read_receipt: chatListEntry exists=${!!currentEntry}, chat_id=${chat_id}`);
    if (currentEntry) {
        console.log(`[WS Bridge] read_receipt: UPSERTING other_user_last_read_at=${read_at} for chat ${chat_id}`);
        $chatListState.upsertChat({
            ...currentEntry,
            other_user_last_read_at: read_at,
        });
    }

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
    const { chat_id, message_ids } = payload;
    if (!chat_id || !Array.isArray(message_ids)) {
        console.warn('[WS Bridge] unsend: INVALID payload — missing chat_id or message_ids', payload);
        return;
    }

    console.log(`[WS Bridge] unsend: CALLING unsendMessages for chat=${chat_id}, count=${message_ids.length}, ids=${message_ids.join(',')}`);
    $chatMessagesState.unsendMessages(chat_id, message_ids);

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
        default:
            console.warn(`[WS Bridge] UNKNOWN event type: "${event.type}"`, event);
    }
}

// ─── Lifecycle: Start/Stop ──────────────────────────────────────────────────

let unsubscribe: (() => void) | null = null;

/**
 * Start the WebSocket event bridge.
 * Call this when the user enters the personal (authenticated) section.
 */
export function startWSEventBridge(): void {
    if (unsubscribe) return;
    unsubscribe = wsClient.subscribe(routeWSEvent);
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
    wsClient.disconnect();
}
