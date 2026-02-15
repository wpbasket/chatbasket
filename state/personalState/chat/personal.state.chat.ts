import { observable, batch, computed, type Observable } from '@legendapp/state';
import { useValue } from '@legendapp/state/react';
import type { ChatEntry, MessageEntry } from '@/lib/personalLib';
import { PersonalChatApi } from '@/lib/personalLib/chatApi/personal.api.chat';
import { $personalStateUser } from '../user/personal.state.user';

// Helper to auto-ack incoming messages
const ackIncomingMessages = (messages: MessageEntry[]) => {
    const user = $personalStateUser.user.peek();
    const myId = user?.id;
    if (!myId) return;

    // Filter for incoming messages that are NOT yet marked as delivered
    const unacked = messages.filter(m => !m.is_from_me && !m.delivered_to_recipient);

    if (unacked.length === 0) return;

    // Find the latest message (by created_at)
    // Arrays are usually sorted new -> old, so we might need to check.
    // The state code sorts: new Date(b.created_at) - new Date(a.created_at) -> Descending (Newest first).
    // So the first element in 'unacked' (if sorted) is the newest.
    // Let's safe-guard by sorting just in case 'messages' passed in isn't sorted perfectly.
    unacked.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const latestMessage = unacked[0];

    // Fire ONE ack for the latest message. Backend handles "Ack All Previous".
    PersonalChatApi.acknowledgeDelivery({
        message_id: latestMessage.message_id,
        acknowledged_by: 'recipient',
        success: true,
    }).then(() => {
        console.log(`[Auto-Ack] Bulk acknowledged up to message ${latestMessage.message_id}`);
    }).catch(err => {
        console.error(`[Auto-Ack] Failed to bulk ack message ${latestMessage.message_id}`, err);
    });
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
        });
    },
    upsertChat(entry: ChatEntry) {
        state$.chatsById[entry.chat_id].set(entry);
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
    setActiveChatId: (chatId: string | null) => void;
    updateInputText: (chatId: string, text: string) => void;
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

    setMessages(chatId: string, entries: MessageEntry[]) {
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const sorted = [...entries].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            chat.messages.set(sorted);
            const byId: Record<string, MessageEntry> = {};
            for (const entry of sorted) {
                byId[entry.message_id] = entry;
            }
            chat.messagesById.set(byId);
            chat.messageIds.set(sorted.map((e) => e.message_id));
            chat.messageIds.set(sorted.map((e) => e.message_id));
            chat.offset.set(sorted.length);

            // Auto-Ack
            ackIncomingMessages(sorted);
        });
    },

    prependMessages(chatId: string, entries: MessageEntry[]) {
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
            ackIncomingMessages(newEntries);
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

            // Auto-Ack
            ackIncomingMessages([entry]);
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
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const currentMessages = chat.messages.peek();
            const filtered = currentMessages.filter((m: MessageEntry) => m.message_id !== messageId);

            chat.messages.set(filtered);
            chat.messagesById[messageId].delete();
            chat.messageIds.set(filtered.map((m: MessageEntry) => m.message_id));
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
