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
import { ChatTransport } from '@/lib/personalLib/chatApi/chat.transport';
import { $chatMessagesState, $chatListState, ackIncomingMessages } from '@/state/personalState/chat/personal.state.chat';
import { insertMessage, messageExists, updateMessageStatus, deleteMessage as storageDeleteMessage, recordFailedInsert, cleanupMessageMedia } from '@/lib/storage/personalStorage/chat/chat.storage';
import { downloadIncomingFile } from '@/lib/personalLib/fileSystem/file.download';
import { authState } from '@/state/auth/state.auth';
import { $syncEngine } from '@/state/personalState/chat/personal.state.sync';
import { getPreviewText } from '@/utils/personalUtils/util.chatPreview';
import { $contactsState } from '@/state/personalState/contacts/personal.state.contacts';
import { resolveMediaUrls } from '@/utils/personalUtils/util.chatMedia';
import { ApiError } from '@/lib/constantLib';

// Production-safe debug logger — compiled out in release builds
const dbg = __DEV__ ? console.log.bind(console) : () => { };

async function refreshChatsAuthoritatively(): Promise<void> {
    try {
        const response = await ChatTransport.getUserChats();
        await $chatListState.setChats(response?.chats ?? []);
        $chatListState.markFetched();
    } catch (err) {
        console.warn('[WS Bridge] Failed authoritative chat-list refresh', err);
    }
}

// ─── Event Handlers ─────────────────────────────────────────────────────────

/**
 * new_message: A new message was sent in a chat we're part of.
 *
 * Payload from backend matches MessageEntry (MessageResponse JSON):
 * { message_id, chat_id, recipient_id, content, message_type, is_from_me, created_at, ... }
 */
async function handleNewMessage(payload: any): Promise<void> {
    dbg('[WS Bridge] handleNewMessage: ENTER', JSON.stringify(payload));
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

    // Phase D: Storage-based dedup (replaces in-memory sharedAckTracker)
    const alreadyExists = await messageExists(msg.message_id);
    if (alreadyExists) {
        dbg(`[WS Bridge] new_message: DUPLICATE (storage) ${msg.message_id}, skipping`);
        return;
    }

    // Phase D: Persist to local storage BEFORE anything else (Rule 1)
    try {
        await insertMessage(msg);
        dbg(`[WS Bridge] new_message: PERSISTED ${msg.message_id}`);
    } catch (err) {
        console.error(`[WS Bridge] new_message: PERSIST FAILED ${msg.message_id}`, err);
        recordFailedInsert();
        return; // Do NOT ACK if persist failed — server will re-deliver
    }

    // Add message to the active chat if it's open
    const activeChatId = $chatMessagesState.activeChatId.peek();
    dbg(`[WS Bridge] new_message: activeChatId=${activeChatId}, msg.chat_id=${msg.chat_id}`);

    if (activeChatId === msg.chat_id) {
        dbg(`[WS Bridge] new_message: ADDING to active chat state — msgID=${msg.message_id}`);
        // addMessage already persists, skipAck ensures we wait for download before final ACK
        await $chatMessagesState.addMessage(msg.chat_id, { ...msg, progress: 0 }, { skipAck: true });
    }

    // Phase 4b: Download media BEFORE ACK
    // Rule 7: primary blocks ACK on failure, non-primary continues
    // Rule 8: null isPrimary = non-primary
    const isPrimary = authState.isPrimary.peek() === true;
    try {
        // Ensure token is fresh before download (User Request: Refresh only for downloads)
        await resolveMediaUrls([msg]);
        await updateMessageStatus(msg.message_id, { 
            download_url: msg.download_url,
            view_url: msg.view_url,
            file_token_expiry: msg.file_token_expiry
        } as any);

        const localUri = await downloadIncomingFile(msg, (p) => {
            $chatMessagesState.updateMessageProgress(msg.chat_id, msg.message_id, p);
        });

        if (localUri) {
            msg.local_uri = localUri;
            await updateMessageStatus(msg.message_id, { local_uri: localUri });

            // Update in-memory state if message was already added
            $chatMessagesState.updateMessageStatus(msg.chat_id, msg.message_id, {
                local_uri: localUri,
                progress: 100
            });

            dbg(`[WS Bridge] new_message: DOWNLOADED media → ${localUri}`);
        }
    } catch (err) {
        console.error(`[WS Bridge] new_message: DOWNLOAD FAILED ${msg.message_id}`, err);

        const statusCode = (err as any)?.status || (err as any)?.code;
        const isPermanentError = statusCode === 404;
        const targetStatus = isPermanentError ? 'error' : 'failed';
        const DOWNLOAD_FAILED_URI = 'error://download-failed';
        
        // Persist error status + sentinel to storage
        await updateMessageStatus(msg.message_id, { 
            status: targetStatus,
            local_uri: DOWNLOAD_FAILED_URI 
        } as any).catch(e => console.warn('[WS Bridge] Failed to persist download error', e));

        // Mark as error so the UI stops the loader and shows error icon
        $chatMessagesState.updateMessageStatus(msg.chat_id, msg.message_id, {
            status: targetStatus,
            local_uri: DOWNLOAD_FAILED_URI,
            progress: 0
        });

        // Rule 7: Primary MUST block ACK on failure so it retries on next boot/connect.
        // Non-primary devices SHOULD continue to ACK if they've marked it with a sentinel,
        // otherwise they'll be stuck in an infinite "ActivityIndicator" loop because
        // they can't fetch from the other session's local backend.
        if (isPrimary) {
            dbg(`[WS Bridge] new_message: Primary session blocking ACK for failed download ${msg.message_id}`);
            return;
        }
        
        dbg(`[WS Bridge] new_message: Non-primary session allowing ACK for failed download (sentinel set)`);
        // Continue to ACK logic below...
    }

    // Explicitly fire Part B (sender-sync ACK) for cross-device sync of our own messages.
    // OR trigger background ACK for recipient.
    if (activeChatId === msg.chat_id) {
        if (msg.is_from_me) {
            ackIncomingMessages([msg]).catch(err =>
                console.warn('[WS Bridge] sender sync ACK failed', err)
            );
        } else {
            // Delivery ACK for incoming messages — download already succeeded above
            ackIncomingMessages([msg]).catch(err =>
                console.warn('[WS Bridge] active-chat delivery ACK failed', err)
            );
        }

        // Auto-read logic: since the chat is open, immediately mark as read (debounced)
        if (!msg.is_from_me) {
            dbg(`[WS Bridge] new_message: AUTO-READING message (debounced) because chat is open`);
            $chatMessagesState.debouncedMarkRead(msg.chat_id);
        }
    } else {
        dbg(`[WS Bridge] new_message: chat is NOT active, triggering background auto-ack`);
        // Trigger background delivery ACK for chats in the inbox
        ackIncomingMessages([msg]).catch(err =>
            console.warn('[WS Bridge] background ACK failed', err)
        );
    }

    // Update chat list preview (upsert with latest message info)
    const currentEntry = $chatListState.chatsById[msg.chat_id]?.peek();
    dbg(`[WS Bridge] new_message: chatListEntry exists=${!!currentEntry}`);

    const previewContent = getPreviewText(msg);

    const isChatActive = activeChatId === msg.chat_id;
    const shouldIncrementUnread = !msg.is_from_me && !isChatActive;

    if (currentEntry) {
        const currentUserId = authState.userId.peek();
        const updatedEntry: ChatEntry = {
            ...currentEntry,
            last_message_content: previewContent,
            last_message_created_at: msg.created_at,
            last_message_type: msg.message_type,
            last_message_is_from_me: msg.is_from_me,
            last_message_id: msg.message_id,
            last_message_status: msg.status ?? 'sent',
            last_message_sender_id: msg.is_from_me
                ? (currentUserId || null)
                : currentEntry.other_user_id,
            last_message_is_unsent: msg.message_type === 'unsent',
            unread_count: shouldIncrementUnread
                ? (currentEntry.unread_count || 0) + 1
                : currentEntry.unread_count,
            updated_at: msg.created_at,
        };
        dbg(`[WS Bridge] new_message: UPSERTING chat list - unread_count=${updatedEntry.unread_count}`);
        $chatListState.upsertChat(updatedEntry);
    } else {
        // Construct a new ChatEntry for previously unknown chats (instantly shows up on Home screen)
        const currentUserId = authState.userId.peek();
        let otherUserId: string | null = null;
        if (msg.is_from_me) {
            otherUserId = msg.recipient_id || null;
        } else {
            const senderId = (msg as any).sender_id ? String((msg as any).sender_id) : null;
            if (senderId && (!currentUserId || senderId !== currentUserId)) {
                otherUserId = senderId;
            } else if (currentUserId && msg.recipient_id && msg.recipient_id !== currentUserId) {
                otherUserId = msg.recipient_id;
            }
        }

        if (!otherUserId) {
            console.warn('[WS Bridge] new_message: Unable to resolve other_user_id for unknown chat. Triggering authoritative refresh.');
            await refreshChatsAuthoritatively();
            return;
        }

        const contact =
            $contactsState.contactsById[otherUserId]?.peek() ||
            $contactsState.addedYouById[otherUserId]?.peek();

        const newEntry: ChatEntry = {
            chat_id: msg.chat_id,
            other_user_id: otherUserId,
            other_user_name: contact?.nickname ?? contact?.name ?? '',
            other_user_username: contact?.username ?? '',
            avatar_url: contact?.avatarUrl ?? null,
            avatar_file_id: contact?.avatarFileId ?? null,
            cached_avatar_file_id: contact?.cachedAvatarFileId ?? null,
            last_message_content: previewContent,
            last_message_created_at: msg.created_at,
            last_message_type: msg.message_type,
            last_message_is_from_me: msg.is_from_me,
            last_message_id: msg.message_id,
            last_message_status: msg.status ?? 'sent',
            last_message_sender_id: msg.is_from_me ? (currentUserId || null) : otherUserId,
            last_message_is_unsent: msg.message_type === 'unsent',
            unread_count: !msg.is_from_me ? 1 : 0,
            local_message_count: 1,
            created_at: msg.created_at,
            updated_at: msg.created_at,
            other_user_last_read_at: '',
            other_user_last_delivered_at: '',
        };
        dbg(`[WS Bridge] new_message: CREATING NEW chat list entry - unread_count=${newEntry.unread_count}`);
        $chatListState.upsertChat(newEntry);
    }

    // Increment local_message_count for non-active, EXISTING chats.
    // Active chats already increment via $chatMessagesState.addMessage().
    // New chats (else branch above) already have local_message_count: 1 on the entry.
    if (!isChatActive && currentEntry) {
        $chatListState.incrementMessageCount(msg.chat_id, 1);
    }

    dbg(`[WS Bridge] new_message: DONE — msgID=${msg.message_id} chatID=${msg.chat_id} is_from_me=${msg.is_from_me} content="${msg.content?.substring(0, 50)}"`);
}

/**
 * delivery_ack: Recipient has acknowledged delivery of a message we sent.
 *
 * Payload: { message_id, chat_id, acknowledged_by }
 */
function handleDeliveryAck(payload: any): void {
    try {
        dbg('[WS Bridge] handleDeliveryAck: ENTER', JSON.stringify(payload));

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

        // Phase D: sharedAckTracker removed — storage is now the source of truth

        // Update the message status / chat meta
        const activeChatId = $chatMessagesState.activeChatId.peek();
        const targetChatId = chat_id || activeChatId;

        dbg(`[WS Bridge] delivery_ack: targetChatId=${targetChatId} (fromPayload=${chat_id}, active=${activeChatId})`);

        if (targetChatId) {
            if (delivered_at) {
                dbg(`[WS Bridge] delivery_ack: CALLING markMessagesDeliveredUpTo(${targetChatId}, ${delivered_at})`);
                $chatMessagesState.markMessagesDeliveredUpTo(targetChatId, delivered_at);
            } else {
                dbg(`[WS Bridge] delivery_ack: CALLING markMessagesDelivered(${targetChatId}, ${messageIds.length} ids)`);
                $chatMessagesState.markMessagesDelivered(targetChatId, messageIds);
            }
        } else {
            console.warn('[WS Bridge] delivery_ack: NO targetChatId found, cannot update state');
        }

        dbg(`[WS Bridge] delivery_ack: DONE — ids=${messageIds.join(',')}`);
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
    dbg('[WS Bridge] handleReadReceipt: ENTER', JSON.stringify(payload));
    const { chat_id, reader_id, read_at } = payload;
    if (!chat_id) {
        console.warn('[WS Bridge] read_receipt: MISSING chat_id, skipping');
        return;
    }

    // 1. Update status for active chat or list preview
    $chatMessagesState.markMessagesReadUpTo(chat_id, read_at);

    const activeChatId = $chatMessagesState.activeChatId.peek();
    dbg(`[WS Bridge] read_receipt: DONE — chat_id=${chat_id} reader_id=${reader_id} read_at=${read_at} isActiveChat=${activeChatId === chat_id}`);
}

/**
 * unsend: Messages were unsent (tombstoned) by the sender.
 *
 * Payload: { chat_id, message_ids }
 */
function handleUnsend(payload: any): void {
    dbg('[WS Bridge] handleUnsend: ENTER', JSON.stringify(payload));
    const { chat_id, message_ids, sender_id } = payload;
    if (!chat_id || !Array.isArray(message_ids)) {
        console.warn('[WS Bridge] unsend: INVALID payload — missing chat_id or message_ids', payload);
        return;
    }

    dbg(`[WS Bridge] unsend: CALLING unsendMessages for chat=${chat_id}, count=${message_ids.length}, sender=${sender_id}`);
    $chatMessagesState.unsendMessages(chat_id, message_ids, sender_id);

    // Phase D: Persist unsend to local storage so it survives reload
    Promise.all(message_ids.map((id: string) =>
        updateMessageStatus(id, { message_type: 'unsent', content: 'Message unsent' })
    )).catch(err => console.warn('[WS Bridge] unsend storage update failed', err));

    // Phase D: Clean up file data (media blob / local file) on recipient side
    cleanupMessageMedia(message_ids)
        .catch(err => console.warn('[WS Bridge] unsend media cleanup failed', err));

    dbg(`[WS Bridge] unsend: DONE — ${message_ids.length} messages in chat ${chat_id}`);
}

/**
 * delete_for_me: Messages were deleted-for-me by the same user on another device.
 *
 * Payload: { message_ids, chat_id }
 */
function handleDeleteForMe(payload: any): void {
    dbg('[WS Bridge] handleDeleteForMe: ENTER', JSON.stringify(payload));
    const { message_ids, chat_id } = payload;
    if (!Array.isArray(message_ids)) {
        console.warn('[WS Bridge] delete_for_me: INVALID payload — missing message_ids', payload);
        return;
    }

    // Use the chat_id from the payload if available, otherwise fall back to the active chat
    const targetChatId = chat_id || $chatMessagesState.activeChatId.peek();
    dbg(`[WS Bridge] delete_for_me: targetChatId=${targetChatId}, count=${message_ids.length}, ids=${message_ids.join(',')}`);
    // Phase D: ALWAYS soft-delete in storage — deleteMessage only needs message_id,
    // not chat_id. Without this, missing chat_id + no active chat would skip the
    // storage update, and deleted messages would reappear on next load.
    Promise.all(message_ids.map((id: string) => storageDeleteMessage(id)))
        .catch(err => console.warn('[WS Bridge] delete_for_me storage update failed', err));

    if (targetChatId) {
        dbg(`[WS Bridge] delete_for_me: REMOVING ${message_ids.length} messages from chat ${targetChatId}`);
        $chatMessagesState.removeMessages(targetChatId, message_ids);

        $chatListState.clearPreviewIfLastMessage(targetChatId, message_ids);
    } else {
        dbg(`[WS Bridge] delete_for_me: NO chat_id and NO active chat — storage soft-deleted, will be removed from state on next load`);
    }

    dbg(`[WS Bridge] delete_for_me: DONE — ${message_ids.length} messages`);
}

/**
 * sync_action: A sync action was created (covers unsend, delete_for_me, etc.).
 * This is a catch-all for actions that don't fit the above categories.
 *
 * Payload: matches SyncActionResponse
 */
function handleSyncAction(payload: any): void {
    dbg('[WS Bridge] handleSyncAction: ENTER', JSON.stringify(payload));
    dbg('[WS Bridge] sync_action: CALLING $syncEngine.fetchAndApply()');
    $syncEngine.fetchAndApply();
    dbg('[WS Bridge] sync_action: DONE — fetchAndApply triggered');
}

// ─── Event Router ───────────────────────────────────────────────────────────

function routeWSEvent(event: WSEvent): void {
    // Drop events that contain a ref field (already handled by wsClient.send promise logic)
    if (event.ref) {
        // dbg(`[WS Bridge] Ignoring response event (ref=${event.ref})`);
        return;
    }

    switch (event.type) {
        case 'new_message':
            handleNewMessage(event.payload).catch(err =>
                console.error('[WS Bridge] handleNewMessage FAILED:', err)
            );
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
        case 'ping_response':
            // Server acknowledged our keepalive ping — no action needed.
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
        dbg('[WS Bridge] Reconnected! Triggering sync...');
        refreshChatsAuthoritatively().then(() => {
            // If a chat is currently open, mark it as read after syncing.
            // Catches messages that arrived while we were offline.
            const activeChatId = $chatMessagesState.activeChatId.peek();
            if (activeChatId) {
                $chatMessagesState.debouncedMarkRead(activeChatId);
            }
        });
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
