import { observable, batch, computed, type Observable } from '@legendapp/state';
import { useValue } from '@legendapp/state/react';
import type { ChatEntry, MessageEntry } from '@/lib/personalLib';
import { PersonalChatApi } from '@/lib/personalLib/chatApi/personal.api.chat';
import { getPreviewText } from '@/utils/personalUtils/util.chatPreview';
import { resolveMediaUrls } from '@/utils/personalUtils/util.chatMedia';
import { $personalStateUser } from '../user/personal.state.user';
import { authState } from '../../auth/state.auth';

// Track in-flight or last successful ACK to avoid redundant API spam
// Exported for WS Event Bridge to use as a shared lock
export const sharedAckTracker = new Set<string>();

// Debounce map and timers to pool multiple calls into one batch per chat
const pendingAckIdsByChat = new Map<string, Set<string>>();
const ackTimers = new Map<string, ReturnType<typeof setTimeout>>();
const ACK_DEBOUNCE_MS = 50;

// Helper to auto-ack incoming messages (Recipient ACK) AND outgoing syncs (Sender ACK)
export const ackIncomingMessages = (messages: MessageEntry[], options?: { skipSenderSync?: boolean }) => {
    if (messages.length === 0) return;

    // 1. Filter out messages already in-flight (shared lock)
    const candidates = messages.filter(m => !sharedAckTracker.has(m.message_id));
    if (candidates.length === 0) return;

    const isPrimary = authState.isPrimary.peek();

    // 2. Group candidates by chat to ensure we process each affected chat
    const affectedChatIds = new Set(candidates.map(m => m.chat_id));

    for (const chatId of affectedChatIds) {
        // Collect new candidates into the pending pool for this chat
        if (!pendingAckIdsByChat.has(chatId)) {
            pendingAckIdsByChat.set(chatId, new Set());
        }
        const pool = pendingAckIdsByChat.get(chatId)!;

        candidates.filter(c => {
            if (c.chat_id !== chatId || c.is_from_me) return false;
            // ACK if not delivered at all OR if we are primary and haven't primary-delivered yet
            // @ts-ignore - delivered_to_recipient_primary exists on backend but maybe missing from frontend type
            return !c.delivered_to_recipient || (isPrimary && !c.delivered_to_recipient_primary);
        }).forEach(c => pool.add(c.message_id));

        // Start/Reset debounce timer
        if (ackTimers.has(chatId)) {
            clearTimeout(ackTimers.get(chatId)!);
        }

        const timer = setTimeout(() => {
            ackTimers.delete(chatId);
            const idsToAck = Array.from(pendingAckIdsByChat.get(chatId) || []);
            pendingAckIdsByChat.delete(chatId);

            if (idsToAck.length === 0) return;

            // Mark as in-flight
            idsToAck.forEach(id => sharedAckTracker.add(id));

            console.log(`[Auto-Ack] Firing DEBOUNCED BATCH delivery ACK for ${chatId} (${idsToAck.length} messages)`);

            PersonalChatApi.acknowledgeDeliveryBatch({
                message_ids: idsToAck,
                acknowledged_by: 'recipient',
                success: true,
            }).then(() => {
                batch(() => {
                    idsToAck.forEach(id => {
                        const msg$ = chatMessages$.chats[chatId].messagesById[id];
                        if (msg$.peek()) {
                            msg$.delivered_to_recipient.set(true);
                            if (isPrimary) {
                                // @ts-ignore
                                msg$.delivered_to_recipient_primary.set(true);
                            }
                        }
                        sharedAckTracker.delete(id);
                    });
                });
            }).catch((err) => {
                console.warn(`[Auto-Ack] Debounced Batch ACK failed for chat ${chatId}`, err);
                idsToAck.forEach(id => sharedAckTracker.delete(id));
            });
        }, ACK_DEBOUNCE_MS);

        ackTimers.set(chatId, timer);

        // --- PART B: Sender Sync ACK (Outgoing Messages from other devices) ---
        // (Keep individual ACKs for sender sync as they are infrequent and handled differently on backend)
        const chatCandidates = candidates.filter(c => c.chat_id === chatId);

        if (isPrimary && !options?.skipSenderSync) {
            const unackedSync = chatCandidates.filter(m =>
                m.is_from_me &&
                !m.synced_to_sender_primary &&
                !sharedAckTracker.has(m.message_id)
            );

            if (unackedSync.length > 0) {
                unackedSync.forEach(m => {
                    sharedAckTracker.add(m.message_id);
                    console.log(`[Auto-Ack] Firing SENDER sync ACK for ${m.message_id}`);

                    PersonalChatApi.acknowledgeDelivery({
                        message_id: m.message_id,
                        acknowledged_by: 'sender',
                        success: true,
                    }).then(() => {
                        const msg$ = chatMessages$.chats[chatId].messagesById[m.message_id];
                        if (msg$.peek()) msg$.synced_to_sender_primary.set(true);
                        sharedAckTracker.delete(m.message_id);
                    }).catch((err) => {
                        console.warn(`[Auto-Ack] Sync ACK failed for ${m.message_id}`, err);
                        sharedAckTracker.delete(m.message_id);
                    });
                });
            }
        }
    }
};

// Proactive URL resolution removed - handled by backend in Phase 11

// ============================================================================
// Chat List State (Inbox — shown on Home screen)
// ============================================================================

interface ChatListState {
    chats: ChatEntry[];
    loading: boolean;
    error: string | null;
    lastFetchedAt: number | null;
    chatsById: Record<string, ChatEntry>;
    chatIds: string[];
    totalUnreadCount: number;
    hasChats: boolean;
    setLoading: (value: boolean) => void;
    setError: (value: string | null) => void;
    setChats: (entries: ChatEntry[]) => void;
    upsertChat: (entry: ChatEntry) => void;
    updateUnreadCount: (chatId: string, count: number) => void;
    markChatRead: (chatId: string) => void;
    markFetched: () => void;
    reset: () => void;
}

const state$ = observable({
    chatsById: {} as Record<string, ChatEntry>,
    loading: false,
    error: null as string | null,
    lastFetchedAt: null as number | null,

    // Computeds (Functions in 3.0 observables are lazy computeds)
    chats() {
        const byId = state$.chatsById.get();
        return Object.values(byId)
            .filter(c => c && c.chat_id)
            .sort((a, b) => {
                const aTime = a.last_message_created_at ?? a.created_at;
                const bTime = b.last_message_created_at ?? b.created_at;
                if (!aTime || !bTime) return 0;
                return new Date(bTime).getTime() - new Date(aTime).getTime();
            });
    },
    chatIds() {
        return state$.chats.get().map((c: ChatEntry) => c.chat_id);
    },
    totalUnreadCount() {
        const byId = state$.chatsById.get();
        return Object.values(byId).reduce((sum, c) => sum + (c.unread_count || 0), 0);
    },
    hasChats() {
        return state$.chatIds.get().length > 0;
    },

    // Actions
    setLoading(value: boolean) {
        state$.loading.set(value);
    },
    setError(value: string | null) {
        state$.error.set(value);
    },
    setChats(entries: ChatEntry[]) {
        batch(() => {
            if (!Array.isArray(entries)) {
                state$.chatsById.set({});
                return;
            }
            const byId: Record<string, ChatEntry> = {};
            for (const entry of entries) {
                if (entry?.chat_id) {
                    byId[entry.chat_id] = entry;
                }
            }
            state$.chatsById.set(byId);
            state$.error.set(null);

            // Proactively fetch all pending messages and ACK them
            chatActions.syncPendingMessages();
        });
    },
    upsertChat(entry: ChatEntry) {
        state$.chatsById[entry.chat_id].set(entry);
        // We do NOT need to trigger full sync here. 
        // upsertChat is used for local optimistic updates (sending/receiving).
        // Background sync interval (or setChats) will handle missing messages.
    },
    updateUnreadCount(chatId: string, count: number) {
        batch(() => {
            const chat$ = state$.chatsById[chatId];
            if (chat$.peek()) {
                chat$.unread_count.set(count);
            }
        });
    },
    markChatRead(chatId: string) {
        state$.updateUnreadCount(chatId, 0);
    },
    markFetched() {
        state$.lastFetchedAt.set(Date.now());
    },
    reset() {
        batch(() => {
            state$.chatsById.set({});
            state$.loading.set(false);
            state$.error.set(null);
            state$.lastFetchedAt.set(null);
        });
    },
});

export const $chatListState = state$ as unknown as Observable<ChatListState>;

export { useValue };


// ============================================================================
// Chat Messages State (Active Conversation — [chat_id].tsx)
// ============================================================================

interface ChatMessagesState {
    setLoading: (chatId: string, value: boolean) => void;
    setError: (chatId: string, value: string | null) => void;
    setSending: (chatId: string, value: boolean) => void;
    setMessages: (chatId: string, entries: MessageEntry[]) => void;
    prependMessages: (chatId: string, entries: MessageEntry[]) => void;
    addMessage: (chatId: string, entry: MessageEntry) => void;
    updateMessageStatus: (chatId: string, messageId: string, updates: Partial<MessageEntry>) => void;
    markMessagesDelivered: (chatId: string, messageIds: string[]) => void;
    markMessagesDeliveredUpTo: (chatId: string, deliveredAt: string) => void;
    markMessagesReadUpTo: (chatId: string, readAt: string) => void;
    removeMessage: (chatId: string, messageId: string) => void;
    removeMessages: (chatId: string, messageIds: string[]) => void;
    unsendMessages: (chatId: string, messageIds: string[], senderUserId?: string) => void;
    setActiveChatId: (chatId: string | null) => void;
    updateInputText: (chatId: string, text: string) => void;
    toggleSelectMode: (chatId: string, enabled: boolean) => void;
    toggleMessageSelection: (chatId: string, messageId: string) => void;
    clearSelection: (chatId: string) => void;
    reset: (chatId?: string) => void;
    syncPendingMessages: () => Promise<void>;
    debouncedMarkRead: (chatId: string) => void;
    activeChatId: Observable<string | null>;
    isChatOpen: Observable<boolean>;
    chats: Observable<Record<string, ChatData>>;
}

interface ChatData {
    recipientId: string | null;
    messages: MessageEntry[];
    messagesById: Record<string, MessageEntry>;
    messageIds: string[];
    loading: boolean;
    error: string | null;
    sending: boolean;
    hasMore: boolean;
    offset: number;
    inputText: string;
    isSelectMode: boolean;
    selectedMessageIds: string[];
    isEligible: boolean;
    eligibilityReason: string | null;
}

const createDefaultChatData = (): ChatData => ({
    recipientId: null,
    messages: [],
    messagesById: {},
    messageIds: [],
    loading: false,
    error: null,
    sending: false,
    hasMore: true,
    offset: 0,
    inputText: '',
    isSelectMode: false,
    selectedMessageIds: [],
    isEligible: true,
    eligibilityReason: null,
});

const chatMessages$ = observable({
    activeChatId: null as string | null,
    isChatOpen: false,
    chats: {} as Record<string, ChatData>,
});

/** Helper to ensure a chat entry exists in the map */
function ensureChatInternal(chatId: string) {
    if (!chatMessages$.chats[chatId].peek()) {
        chatMessages$.chats[chatId].set(createDefaultChatData());
    }
    return chatMessages$.chats[chatId];
}

const chatActions = {
    setLoading(chatId: string, value: boolean) {
        ensureChatInternal(chatId).loading.set(value);
    },
    setError(chatId: string, value: string | null) {
        ensureChatInternal(chatId).error.set(value);
    },
    setSending(chatId: string, value: boolean) {
        ensureChatInternal(chatId).sending.set(value);
    },

    setMessages(chatId: string, entries: MessageEntry[], options?: { skipSenderSync?: boolean }) {
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const existingById = chat.messagesById.peek();

            // Merge: Keep existing local/promoted messages, update them if server has newer info
            const mergedById = { ...existingById };
            for (const entry of entries) {
                mergedById[entry.message_id] = {
                    ...(mergedById[entry.message_id] || {}),
                    ...entry
                };
            }

            const mergedList = Object.values(mergedById).sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            chat.messages.set(mergedList);
            chat.messagesById.set(mergedById);
            chat.messageIds.set(mergedList.map((e) => e.message_id));
            chat.offset.set(mergedList.length);

            // Auto-Ack for any new unacknowledged messages in the batch
            ackIncomingMessages(entries, options);
        });
    },

    prependMessages(chatId: string, entries: MessageEntry[], options?: { skipSenderSync?: boolean }) {
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const existing = chat.messagesById.get();
            const newEntries = entries.filter((e) => !existing[e.message_id]);

            if (newEntries.length === 0) {
                chat.hasMore.set(false);
                return;
            }

            const current = chat.messages.get();
            const merged = [...current, ...newEntries].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            chat.messages.set(merged);
            const byId = { ...existing };
            for (const entry of newEntries) {
                byId[entry.message_id] = entry;
            }
            chat.messagesById.set(byId);
            chat.messageIds.set(merged.map((e) => e.message_id));
            chat.messageIds.set(merged.map((e) => e.message_id));
            chat.offset.set(merged.length);

            // Auto-Ack
            ackIncomingMessages(newEntries, options);
        });
    },

    async addMessage(chatId: string, entry: MessageEntry) {
        // Resolve media URLs first (async) before entering synchronous batch
        let resolvedEntry = { ...entry };
        if (resolvedEntry.file_id) {
            await resolveMediaUrls([resolvedEntry]);
        }

        batch(() => {
            const chat = ensureChatInternal(chatId);
            const existing = chat.messagesById.peek();
            if (existing[resolvedEntry.message_id]) return;

            const current = chat.messages.peek();
            const updated = [resolvedEntry, ...current].slice(0, 1000);

            chat.messages.set(updated);
            chat.messagesById[resolvedEntry.message_id].set(resolvedEntry);
            chat.messageIds.set(updated.map((e) => e.message_id));

            // Auto-Ack (Skip sender sync since we just sent it)
            console.log(`[ChatActions] addMessage: Adding local message ${resolvedEntry.message_id}. Skipping Sender Sync.`);
            ackIncomingMessages([resolvedEntry], { skipSenderSync: true });
        });
    },

    updateMessageStatus(chatId: string, messageId: string, updates: Partial<MessageEntry>) {
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const message$ = chat.messagesById[messageId];
            if (message$.peek()) {
                message$.assign(updates);

                const currentMessages = chat.messages.peek();
                const index = currentMessages.findIndex((m: MessageEntry) => m.message_id === messageId);
                if (index !== -1) {
                    chat.messages[index].assign(updates);
                }
            }
        });
    },

    markMessagesDelivered(chatId: string, messageIds: string[]) {
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const idSet = new Set(messageIds);

            messageIds.forEach(id => {
                const msg$ = chat.messagesById[id];
                if (msg$.peek() && !msg$.delivered_to_recipient.peek()) {
                    msg$.delivered_to_recipient.set(true);

                    // Also update in the messages array
                    const currentMessages = chat.messages.peek();
                    const index = currentMessages.findIndex((m: MessageEntry) => m.message_id === id);
                    if (index !== -1) {
                        chat.messages[index].delivered_to_recipient.set(true);
                    }
                }
            });

            // Update chat list preview if any of these were the last message
            const chatEntry$ = $chatListState.chatsById[chatId];
            const chatEntry = chatEntry$?.peek();
            if (chatEntry && chatEntry.last_message_id && idSet.has(chatEntry.last_message_id)) {
                chatEntry$.last_message_status.set('delivered');
            }
        });
    },

    markMessagesDeliveredUpTo(chatId: string, deliveredAt: string) {
        if (!deliveredAt) return;
        console.log(`[ChatState] markMessagesDeliveredUpTo: ENTER chat=${chatId} deliveredAt=${deliveredAt}`);
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const targetTime = new Date(deliveredAt.replace(' ', 'T')).getTime();
            if (isNaN(targetTime)) {
                console.warn(`[ChatState] markMessagesDeliveredUpTo: INVALID deliveredAt format: ${deliveredAt}`);
                return;
            }

            // GRACE PERIOD: Add 10 seconds (increased from 5s) to handle clock drift between client and server.
            const adjustedTargetTime = targetTime + 10000;
            console.log(`[ChatState] markMessagesDeliveredUpTo: targetTime=${targetTime} (+10s grace=${adjustedTargetTime})`);

            const currentMessages = chat.messages.peek();
            let count = 0;

            // 1. Update individual messages
            currentMessages.forEach((m: MessageEntry, index: number) => {
                const mTime = new Date(m.created_at).getTime();
                if (m.is_from_me && mTime <= adjustedTargetTime && !m.delivered_to_recipient) {
                    chat.messagesById[m.message_id].delivered_to_recipient.set(true);
                    chat.messages[index].delivered_to_recipient.set(true);
                    count++;
                }
            });
            console.log(`[ChatState] markMessagesDeliveredUpTo: Updated ${count} individual messages`);

            // 2. Update Chat List meta (Source of Truth for Double Grey Tick)
            const chatEntry$ = $chatListState.chatsById[chatId];
            if (chatEntry$) {
                const chatEntry = chatEntry$.peek();
                console.log(`[ChatState] markMessagesDeliveredUpTo: Updating ChatEntry in list. Setting other_user_last_delivered_at=${deliveredAt}`);
                chatEntry$.other_user_last_delivered_at.set(deliveredAt);

                // Update preview status if last message is now delivered
                if (chatEntry.last_message_is_from_me && chatEntry.last_message_created_at) {
                    const lastMsgTime = new Date(chatEntry.last_message_created_at).getTime();
                    console.log(`[ChatState] markMessagesDeliveredUpTo: lastMsgTime=${lastMsgTime}, adjustedTargetTime=${adjustedTargetTime}`);
                    if (lastMsgTime <= adjustedTargetTime && (chatEntry.last_message_status === 'sent' || chatEntry.last_message_status === 'pending')) {
                        console.log(`[ChatState] markMessagesDeliveredUpTo: Setting last_message_status to 'delivered'`);
                        chatEntry$.last_message_status.set('delivered');
                    }
                }
            } else {
                console.log(`[ChatState] markMessagesDeliveredUpTo: ChatEntry NOT FOUND in list for ${chatId}`);
            }
        });
    },

    markMessagesReadUpTo(chatId: string, readAt: string) {
        if (!readAt) return;
        console.log(`[ChatState] markMessagesReadUpTo: ENTER chat=${chatId} readAt=${readAt}`);
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const targetTime = new Date(readAt.replace(' ', 'T')).getTime();
            if (isNaN(targetTime)) {
                console.warn(`[ChatState] markMessagesReadUpTo: INVALID readAt format: ${readAt}`);
                return;
            }

            // GRACE PERIOD: Add 10 seconds for clock drift
            const adjustedTargetTime = targetTime + 10000;

            const currentMessages = chat.messages.peek();
            let count = 0;

            // 1. Update individual messages in the active chat store
            currentMessages.forEach((m: MessageEntry, index: number) => {
                const mTime = new Date(m.created_at).getTime();
                // If message was sent BEFORE or AT the read time, and is from ME, it's now read.
                if (m.is_from_me && mTime <= adjustedTargetTime && m.status !== 'read') {
                    chat.messagesById[m.message_id].status.set('read');
                    chat.messages[index].status.set('read');
                    // Implicitly delivered if read
                    chat.messagesById[m.message_id].delivered_to_recipient.set(true);
                    chat.messages[index].delivered_to_recipient.set(true);
                    count++;
                }
            });
            console.log(`[ChatState] markMessagesReadUpTo: Updated ${count} individual messages to read`);

            // 2. Update the Chat List preview status
            const chatEntry$ = $chatListState.chatsById[chatId];
            const chatEntry = chatEntry$?.peek();
            if (chatEntry) {
                console.log(`[ChatState] markMessagesReadUpTo: Updating ChatEntry in list. Preview was="${chatEntry.last_message_status}"`);
                // Update the persisted read timestamp
                chatEntry$.other_user_last_read_at.set(readAt);

                // If the last message is from me and was sent before the read time, mark preview as 'read'
                if (chatEntry.last_message_is_from_me && chatEntry.last_message_created_at) {
                    const lastMsgTime = new Date(chatEntry.last_message_created_at).getTime();
                    if (lastMsgTime <= adjustedTargetTime) {
                        console.log(`[ChatState] markMessagesReadUpTo: Setting last_message_status to 'read'`);
                        chatEntry$.last_message_status.set('read');
                    }
                }
            } else {
                console.log(`[ChatState] markMessagesReadUpTo: ChatEntry NOT FOUND in list for ${chatId}`);
            }
        });
    },

    removeMessage(chatId: string, messageId: string) {
        this.removeMessages(chatId, [messageId]);
    },

    removeMessages(chatId: string, messageIds: string[]) {
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const currentMessages = chat.messages.peek();
            const idSet = new Set(messageIds);

            const filtered = currentMessages.filter((m: MessageEntry) => !idSet.has(m.message_id));

            chat.messages.set(filtered);
            messageIds.forEach(id => {
                if (chat.messagesById[id].peek()) {
                    chat.messagesById[id].delete();
                }
            });
            chat.messageIds.set(filtered.map((m: MessageEntry) => m.message_id));
        });
    },

    unsendMessages(chatId: string, messageIds: string[], senderUserId?: string) {
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const idSet = new Set(messageIds);

            let unreadDecrementCount = 0;
            let messagesFoundInState = 0;

            messageIds.forEach(id => {
                const message$ = chat.messagesById[id];
                const msgData = message$.peek();
                if (msgData) {
                    messagesFoundInState++;
                    // Only decrement if the message wasn't from me
                    if (!msgData.is_from_me && msgData.message_type !== 'unsent') {
                        unreadDecrementCount++;
                    }

                    message$.assign({
                        content: 'Message unsent',
                        message_type: 'unsent',
                        // @ts-ignore - dynamic extension for UI
                        is_unsent: true
                    });
                }
            });

            // Update chat list preview if necessary
            const chatListEntry = $chatListState.chatsById[chatId].peek();
            if (chatListEntry) {
                let newUnreadCount = chatListEntry.unread_count || 0;

                // Fallback: if messages weren't loaded in state, estimate from payload.
                // ONLY decrement if the messages were NOT sent by me (the current user).
                // We use senderUserId from the WS payload to determine this without
                // relying on local message state.
                const isSentByMe = senderUserId
                    ? chatListEntry.other_user_id !== senderUserId
                    : false; // If no senderUserId, we can't tell — be safe and skip.

                if (messagesFoundInState === 0 && newUnreadCount > 0 && !isSentByMe) {
                    unreadDecrementCount = messageIds.length;
                }

                if (unreadDecrementCount > 0) {
                    newUnreadCount = Math.max(0, newUnreadCount - unreadDecrementCount);
                }

                const isLastMessageUnsent = chatListEntry.last_message_id
                    ? idSet.has(chatListEntry.last_message_id)
                    : false;

                if (isLastMessageUnsent) {
                    // The last message in the chat list preview was unsent.
                    // Decrement unread count by 1 (same as any other unsent message).
                    $chatListState.upsertChat({
                        ...chatListEntry,
                        last_message_content: 'Message unsent',
                        unread_count: newUnreadCount,
                        // @ts-ignore
                        last_message_is_unsent: true
                    });
                } else if (unreadDecrementCount > 0) {
                    // Decrement the count for older unsent messages
                    $chatListState.upsertChat({
                        ...chatListEntry,
                        unread_count: newUnreadCount,
                    });
                }
            }
        });
    },

    setActiveChatId(chatId: string | null) {
        chatMessages$.activeChatId.set(chatId);
        if (chatId) {
            ensureChatInternal(chatId);
        }
    },

    updateInputText(chatId: string, text: string) {
        ensureChatInternal(chatId).inputText.set(text);
    },

    toggleSelectMode(chatId: string, enabled: boolean) {
        batch(() => {
            const chat = ensureChatInternal(chatId);
            chat.isSelectMode.set(enabled);
            if (!enabled) {
                chat.selectedMessageIds.set([]);
            }
        });
    },

    toggleMessageSelection(chatId: string, messageId: string) {
        const chat = ensureChatInternal(chatId);
        const current = chat.selectedMessageIds.peek();
        const index = current.indexOf(messageId);
        if (index > -1) {
            chat.selectedMessageIds.set(current.filter(id => id !== messageId));
        } else {
            chat.selectedMessageIds.set([...current, messageId]);
        }
    },

    clearSelection(chatId: string) {
        ensureChatInternal(chatId).selectedMessageIds.set([]);
    },

    reset(chatId?: string) {
        batch(() => {
            if (chatId) {
                chatMessages$.chats[chatId].set(createDefaultChatData());
            } else {
                chatMessages$.activeChatId.set(null);
                chatMessages$.chats.set({});
                chatMessages$.isChatOpen.set(false);
            }
        });
    },

    /**
     * Fetch all messages that arrived while offline/disconnected.
     */
    async syncPendingMessages() {
        console.log('[ChatState] syncPendingMessages: START');
        try {
            const response = await PersonalChatApi.getPendingMessages({ limit: 50 });
            if (!response?.messages || response.messages.length === 0) {
                console.log('[ChatState] syncPendingMessages: No pending messages found.');
                return;
            }

            console.log(`[ChatState] syncPendingMessages: Found ${response.messages.length} messages.`);

            batch(() => {
                const messagesByChat: Record<string, MessageEntry[]> = {};
                for (const msg of response.messages) {
                    if (!messagesByChat[msg.chat_id]) messagesByChat[msg.chat_id] = [];
                    messagesByChat[msg.chat_id].push(msg);
                }

                for (const chatId in messagesByChat) {
                    const chatMsgs = messagesByChat[chatId];
                    const activeChatId = chatMessages$.activeChatId.peek();
                    const chatStore = chatMessages$.chats[chatId];
                    const chatStoreData = chatStore.peek();

                    // 1. Add messages to active chat store (if loaded)
                    if (activeChatId === chatId || chatStoreData) {
                        chatMsgs.forEach(m => chatActions.addMessage(chatId, m));
                    }

                    // 2. Update Chat List previews (Only update UI/Previews, TRUST server unread_count)
                    const currentEntry = $chatListState.chatsById[chatId]?.peek();
                    if (currentEntry) {
                        // Sort synced messages chronologically (backend SHOULD return them sorted, but let's be safe)
                        const sortedSynced = [...chatMsgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                        const lastMsg = sortedSynced[sortedSynced.length - 1];

                        // PROTECTION: Trust server's authoritative preview state. 
                        // If the server explicitly says a chat has no preview (content is empty/null),
                        // we MUST NOT allow historical sync data to re-populate it. This honors "Delete for me".
                        const serverPreview = currentEntry.last_message_content;

                        if (serverPreview === null || serverPreview === '') {
                            // Authoritative server state says this chat is empty. Stop sync from overwriting.
                            return;
                        }

                        // Only update preview if the sync found a NEWER message than what we currently show
                        const isNewer = !currentEntry.last_message_created_at || (new Date(lastMsg.created_at).getTime() > new Date(currentEntry.last_message_created_at).getTime());

                        if (isNewer) {
                            $chatListState.upsertChat({
                                ...currentEntry,
                                last_message_content: getPreviewText(lastMsg),
                                last_message_created_at: lastMsg.created_at,
                                last_message_type: lastMsg.message_type,
                                last_message_is_from_me: lastMsg.is_from_me,
                                last_message_id: lastMsg.message_id,
                                last_message_is_unsent: lastMsg.message_type === 'unsent',
                            });
                        }
                    }
                }
            });

            // Delegate standard Delivery ACKs and Sender-Sync ACKs to the shared debounce flow.
            // This ensures messages synced in the background are properly marked as received.
            ackIncomingMessages(response.messages);

            console.log('[ChatState] syncPendingMessages: DONE');
        } catch (err) {
            console.error('[ChatState] syncPendingMessages: FAILED', err);
        }
    },
    debouncedMarkRead(chatId: string) {
        if (!chatId) return;

        // Use a property on chatActions to track timers
        if (!(this as any)._markReadTimers) (this as any)._markReadTimers = new Map<string, ReturnType<typeof setTimeout>>();
        const timers = (this as any)._markReadTimers;

        if (timers.has(chatId)) {
            clearTimeout(timers.get(chatId)!);
        }

        const timer = setTimeout(() => {
            timers.delete(chatId);
            console.log(`[ChatState] debouncedMarkRead: Firing for ${chatId}`);
            PersonalChatApi.markChatRead({ chat_id: chatId }).catch((err) => {
                console.warn(`[ChatState] debouncedMarkRead: FAILED for ${chatId}`, err);
            });
        }, 2000);

        timers.set(chatId, timer);
    },
};

export const $chatMessagesState = {
    ...chatActions,
    activeChatId: chatMessages$.activeChatId,
    isChatOpen: chatMessages$.isChatOpen,
    chats: chatMessages$.chats,
} as unknown as ChatMessagesState;
