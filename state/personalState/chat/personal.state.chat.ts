import { observable, batch, computed, type Observable } from '@legendapp/state';
import { useValue } from '@legendapp/state/react';
import type { ChatEntry, MessageEntry } from '@/lib/personalLib';
import { PersonalChatApi } from '@/lib/personalLib/chatApi/personal.api.chat';
import { $personalStateUser } from '../user/personal.state.user';
import { authState } from '../../auth/state.auth';

// Track in-flight or last successful ACK to avoid redundant API spam
const lastAckedMsgId: Record<string, string> = {};

// Helper to auto-ack incoming messages (Recipient ACK) AND outgoing syncs (Sender ACK)
const ackIncomingMessages = (messages: MessageEntry[], options?: { skipSenderSync?: boolean }) => {
    const user = $personalStateUser.user.peek();
    const myId = user?.id;
    if (!myId) return;

    if (options?.skipSenderSync) {
        console.log(`[Auto-Ack] ackIncomingMessages called with skipSenderSync=TRUE. Ignoring ${messages.length} messages for sender sync.`);
    } else {
        console.log(`[Auto-Ack] ackIncomingMessages called. checking ${messages.length} messages.`);
    }

    // 1. Group incoming messages by chat to ensure we process each affected chat
    const affectedChatIds = new Set(messages.map(m => m.chat_id));

    for (const chatId of affectedChatIds) {
        const chatData = chatMessages$.chats[chatId].peek();
        if (!chatData) continue;

        const allMessagesInChat = chatData.messages || [];

        // --- PART A: Recipient Delivery ACK (Incoming Messages) ---
        const unackedDelivery = allMessagesInChat.filter(m => !m.is_from_me && !m.delivered_to_recipient);
        if (unackedDelivery.length > 0) {
            unackedDelivery.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            const latestMsg = unackedDelivery[0];

            if (lastAckedMsgId[chatId + '_recv'] !== latestMsg.message_id) {
                lastAckedMsgId[chatId + '_recv'] = latestMsg.message_id;
                console.log(`[Auto-Ack] Firing RECIPIENT delivery ACK for ${chatId} up to ${latestMsg.message_id}`);

                PersonalChatApi.acknowledgeDelivery({
                    message_id: latestMsg.message_id,
                    acknowledged_by: 'recipient',
                    success: true,
                }).then(() => {
                    batch(() => {
                        unackedDelivery.forEach(m => {
                            const msg$ = chatMessages$.chats[chatId].messagesById[m.message_id];
                            if (msg$.peek()) msg$.delivered_to_recipient.set(true);
                        });
                    });
                }).catch(() => {
                    delete lastAckedMsgId[chatId + '_recv'];
                });
            }
        }

        // --- PART B: Sender Sync ACK (Outgoing Messages from other devices) ---
        const unackedSync = allMessagesInChat.filter(m => m.is_from_me && !m.synced_to_sender_primary);

        const isPrimary = authState.isPrimary.peek();

        if (isPrimary && !options?.skipSenderSync && unackedSync.length > 0) {
            console.log(`[Auto-Ack] Found ${unackedSync.length} candidates for Sender Sync in ${chatId}. Processing...`);
            unackedSync.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            const latestSyncMsg = unackedSync[0];

            if (lastAckedMsgId[chatId + '_send'] !== latestSyncMsg.message_id) {
                lastAckedMsgId[chatId + '_send'] = latestSyncMsg.message_id;
                console.log(`[Auto-Ack] Firing SENDER sync ACK for ${chatId} up to ${latestSyncMsg.message_id}`);

                PersonalChatApi.acknowledgeDelivery({
                    message_id: latestSyncMsg.message_id,
                    acknowledged_by: 'sender',
                    success: true,
                }).then(() => {
                    batch(() => {
                        unackedSync.forEach(m => {
                            const msg$ = chatMessages$.chats[chatId].messagesById[m.message_id];
                            if (msg$.peek()) msg$.synced_to_sender_primary.set(true);
                        });
                    });
                }).catch((err) => {
                    console.warn('[Auto-Ack] Sync ACK failed:', err);
                    // If backend says Forbidden (403), we are NOT primary. Auto-correct state.
                    const isForbidden = err?.code === 403 || err?.status === 403 || err?.message?.includes('Forbidden') || err?.message?.includes('403');

                    if (isForbidden) {
                        console.warn('[Auto-Ack] Sync ACK Forbidden (403). BACKING OFF. Will not retry for this message.');
                        // DO NOT downgrade isPrimary.
                        // DO NOT delete the lock. Keeping 'lastAckedMsgId' set prevents the loop.
                    } else {
                        // Always delete the lock so we can retry (or stop if state changed)
                        delete lastAckedMsgId[chatId + '_send'];
                    }
                });
            }
        }
    }
};

/**
 * Background helper to fetch all pending (undelivered) messages and ACK them.
 * This ensures "Delivered" status is confirmed safely ONLY after storing contents.
 */
const syncPendingMessages = async () => {
    try {
        const response = await PersonalChatApi.getPendingMessages({ limit: 100 });
        const messages = response.messages || [];
        if (messages.length === 0) return;

        console.log(`[Background-Sync] Found ${messages.length} undelivered messages. Storing before ACK.`);

        batch(() => {
            // Group messages by chat to batch state updates
            const byChat: Record<string, MessageEntry[]> = {};
            messages.forEach(m => {
                if (!byChat[m.chat_id]) byChat[m.chat_id] = [];
                byChat[m.chat_id].push(m);
            });

            // 1. Store all messages safely in local state
            // This triggers 'ackIncomingMessages' via 'setMessages' for each chat
            for (const [chatId, entries] of Object.entries(byChat)) {
                $chatMessagesState.setMessages(chatId, entries);
            }
        });

    } catch (err) {
        console.error('[Background-Sync] Failed to fetch pending messages', err);
    }
};

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
            syncPendingMessages();
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
    removeMessage: (chatId: string, messageId: string) => void;
    removeMessages: (chatId: string, messageIds: string[]) => void;
    unsendMessages: (chatId: string, messageIds: string[]) => void;
    setActiveChatId: (chatId: string | null) => void;
    updateInputText: (chatId: string, text: string) => void;
    toggleSelectMode: (chatId: string, enabled: boolean) => void;
    toggleMessageSelection: (chatId: string, messageId: string) => void;
    clearSelection: (chatId: string) => void;
    reset: (chatId?: string) => void;
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

    addMessage(chatId: string, entry: MessageEntry) {
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const existing = chat.messagesById.peek();
            if (existing[entry.message_id]) return;

            const current = chat.messages.peek();
            const updated = [entry, ...current].slice(0, 1000);

            chat.messages.set(updated);
            chat.messagesById[entry.message_id].set(entry);
            chat.messagesById[entry.message_id].set(entry);
            chat.messageIds.set(updated.map((e) => e.message_id));

            // Auto-Ack (Skip sender sync since we just sent it)
            console.log(`[ChatActions] addMessage: Adding local message ${entry.message_id}. Skipping Sender Sync.`);
            ackIncomingMessages([entry], { skipSenderSync: true });
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

    unsendMessages(chatId: string, messageIds: string[]) {
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const idSet = new Set(messageIds);

            messageIds.forEach(id => {
                const message$ = chat.messagesById[id];
                if (message$.peek()) {
                    message$.assign({
                        content: 'Message unsent',
                        // @ts-ignore - dynamic extension for UI
                        is_unsent: true
                    });
                }
            });

            // Update chat list preview if necessary
            const chatListEntry = $chatListState.chatsById[chatId].peek();
            if (chatListEntry) {
                const sortedMessages = chat.messages.peek();
                if (sortedMessages.length > 0) {
                    const lastMsg = sortedMessages[0];
                    if (idSet.has(lastMsg.message_id)) {
                        $chatListState.upsertChat({
                            ...chatListEntry,
                            last_message_content: 'Message unsent',
                            // @ts-ignore
                            last_message_is_unsent: true
                        });
                    }
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
};

export const $chatMessagesState = {
    ...chatActions,
    activeChatId: chatMessages$.activeChatId,
    isChatOpen: chatMessages$.isChatOpen,
    chats: chatMessages$.chats,
} as unknown as ChatMessagesState;
