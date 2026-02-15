import { observable, batch, computed, type Observable } from '@legendapp/state';
import { useValue } from '@legendapp/state/react';
import type { ChatEntry, MessageEntry } from '@/lib/personalLib';
import { $personalStateUser } from '../user/personal.state.user';

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
    getCurrentUserId: () => string;
    setLoading: (value: boolean) => void;
    setError: (value: string | null) => void;
    setChats: (entries: ChatEntry[]) => void;
    upsertChat: (entry: ChatEntry) => void;
    updateUnreadCount: (chatId: string, count: number) => void;
    markChatRead: (chatId: string) => void;
    markFetched: () => void;
    reset: () => void;
}

const state$: any = observable({
    chats: [] as ChatEntry[],
    loading: false,
    error: null as string | null,
    lastFetchedAt: null as number | null,

    getCurrentUserId(): string {
        return $personalStateUser.user?.id?.peek() || '';
    },

    setLoading(value: boolean) {
        state$.loading.set(value);
    },
    setError(value: string | null) {
        state$.error.set(value);
    },

    setChats(entries: ChatEntry[]) {
        const sorted = [...entries].sort((a, b) => {
            const aTime = a.last_message_created_at ?? a.created_at;
            const bTime = b.last_message_created_at ?? b.created_at;
            return new Date(bTime).getTime() - new Date(aTime).getTime();
        });

        state$.chats.set(sorted);
    },

    upsertChat(entry: ChatEntry) {
        const current = state$.chats.get();
        const filtered = current.filter((c: ChatEntry) => c.chat_id !== entry.chat_id);
        state$.setChats([entry, ...filtered]);
    },

    updateUnreadCount(chatId: string, count: number) {
        const currentChats = state$.chats.peek();
        const index = currentChats.findIndex((c: ChatEntry) => c?.chat_id === chatId);
        if (index !== -1) {
            const updatedChat = { ...currentChats[index], unread_count: count };
            state$.chats[index].set(updatedChat);
        }
    },

    markChatRead(chatId: string) {
        state$.updateUnreadCount(chatId, 0);
    },

    markFetched() {
        state$.lastFetchedAt.set(Date.now());
    },

    reset() {
        batch(() => {
            state$.chats.set([]);
            state$.loading.set(false);
            state$.error.set(null);
            state$.lastFetchedAt.set(null);
        });
    },
});

state$.assign({
    chatsById: computed((): Record<string, ChatEntry> => {
        const chats = state$.chats.get();
        const byId: Record<string, ChatEntry> = {};
        for (const entry of chats) {
            if (entry?.chat_id) {
                byId[entry.chat_id] = entry;
            }
        }
        return byId;
    }),

    chatIds: computed((): string[] => {
        return state$.chats.get().map((e: ChatEntry) => e.chat_id);
    }),

    totalUnreadCount: computed((): number => {
        return state$.chats.get().reduce((sum: number, c: ChatEntry) => sum + (c.unread_count || 0), 0);
    }),

    hasChats: computed((): boolean => {
        return state$.chats.get().length > 0;
    }),
});

export const $chatListState: Observable<ChatListState> = state$;

export { useValue };


// ============================================================================
// Chat Messages State (Active Conversation — [chat_id].tsx)
// ============================================================================

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

export const $chatMessagesState = observable({
    activeChatId: null as string | null,
    isChatOpen: false,
    chats: {} as Record<string, ChatData>,

    setLoading(chatId: string, value: boolean) {
        ensureChat(chatId).loading.set(value);
    },
    setError(chatId: string, value: string | null) {
        ensureChat(chatId).error.set(value);
    },
    setSending(chatId: string, value: boolean) {
        ensureChat(chatId).sending.set(value);
    },

    /**
     * Replaces the message list entirely for a specific chat.
     */
    setMessages(chatId: string, entries: MessageEntry[]) {
        batch(() => {
            const chat = ensureChat(chatId);
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
            chat.offset.set(sorted.length);
        });
    },

    /**
     * Prepends older messages (pagination) for a specific chat.
     */
    prependMessages(chatId: string, entries: MessageEntry[]) {
        batch(() => {
            const chat = ensureChat(chatId);
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
            chat.offset.set(merged.length);
        });
    },

    /**
     * Adds a new message to the top for a specific chat.
     */
    addMessage(chatId: string, entry: MessageEntry) {
        batch(() => {
            const chat = ensureChat(chatId);
            const existing = chat.messagesById.peek();
            if (existing[entry.message_id]) return;

            const current = chat.messages.peek();
            const updated = [entry, ...current].slice(0, 1000);

            chat.messages.set(updated);
            chat.messagesById[entry.message_id].set(entry);
            chat.messageIds.set(updated.map((e) => e.message_id));
        });
    },

    /**
     * Updates message status for a specific chat.
     */
    updateMessageStatus(chatId: string, messageId: string, updates: Partial<MessageEntry>) {
        const chat = ensureChat(chatId);
        const message$ = chat.messagesById[messageId];
        if (message$.peek()) {
            message$.assign(updates);

            const currentMessages = chat.messages.peek();
            const index = currentMessages.findIndex((m: MessageEntry) => m.message_id === messageId);
            if (index !== -1) {
                chat.messages[index].assign(updates);
            }
        }
    },

    /**
     * Removes a message for a specific chat.
     */
    removeMessage(chatId: string, messageId: string) {
        const chat = ensureChat(chatId);
        const currentMessages = chat.messages.peek();
        const filtered = currentMessages.filter((m: MessageEntry) => m.message_id !== messageId);

        chat.messages.set(filtered);
        chat.messagesById[messageId].delete();
        chat.messageIds.set(filtered.map((m: MessageEntry) => m.message_id));
    },

    setActiveChatId(chatId: string | null) {
        $chatMessagesState.activeChatId.set(chatId);
        if (chatId) {
            ensureChat(chatId);
        }
    },

    reset(chatId?: string) {
        if (chatId) {
            $chatMessagesState.chats[chatId].set(createDefaultChatData());
        } else {
            $chatMessagesState.activeChatId.set(null);
            $chatMessagesState.chats.set({});
        }
    },
});

/** Helper to ensure a chat entry exists in the map */
function ensureChat(chatId: string) {
    if (!$chatMessagesState.chats[chatId].peek()) {
        $chatMessagesState.chats[chatId].set(createDefaultChatData());
    }
    return $chatMessagesState.chats[chatId];
}
