import { observable, batch, computed, type Observable } from '@legendapp/state';
import { useValue } from '@legendapp/state/react';
import type { ChatEntry, MessageEntry } from '@/lib/personalLib';
import { ChatTransport } from '@/lib/personalLib/chatApi/chat.transport';
import { getPreviewText } from '@/utils/personalUtils/util.chatPreview';
import { resolveMediaUrls } from '@/utils/personalUtils/util.chatMedia';
import { ApiError } from '@/lib/constantLib';
import { $personalStateUser } from '../user/personal.state.user';
import { authState } from '../../auth/state.auth';
import * as ChatStorage from '@/lib/storage/personalStorage/chat/chat.storage';
import { downloadIncomingFile } from '@/lib/personalLib/fileSystem/file.download';
import { normalizeChatEntries, normalizeChatEntry } from '@/lib/storage/personalStorage/chat/chat.storage.normalize';


let isSyncingPending = false;
/**
 * Auto-ACK incoming messages (Recipient ACK) AND outgoing syncs (Sender ACK).
 * Phase D: This is fire-and-forget — persistence happens BEFORE this is called.
 * No debounce, no in-memory tracker. Storage is the source of truth.
 */
export const ackIncomingMessages = async (messages: MessageEntry[], options?: { skipSenderSync?: boolean; skipMediaCheck?: boolean }): Promise<void> => {
    if (messages.length === 0) return;

    const isPrimary = authState.isPrimary.peek();

    // --- PART A: Recipient Delivery ACK (Incoming messages we haven't ACK'd) ---
    const toAck = messages.filter(m => {
        if (m.is_from_me) return false;

        // Check if already ACK'd according to our role (Primary vs Non-Primary)
        const alreadyAcked = m.delivered_to_recipient && (!isPrimary || m.delivered_to_recipient_primary);
        if (alreadyAcked) return false;

        // --- Safety Filter: NEVER ACK media without local persistence ---
        // Callers that manage downloads themselves (syncPendingMessages, soft-delete)
        // pass skipMediaCheck to bypass this guard.
        if (!options?.skipMediaCheck) {
            const isMedia = ['image', 'video', 'audio', 'file'].includes(m.message_type);
            // ONLY block ACK if there is a URL to download and we haven't persisted it yet.
            // If download_url is missing, it's a broken message—ACK it to stop the loop.
            if (isMedia && m.download_url && !m.local_uri) {
                return false;
            }
        }

        return true;
    });

    if (toAck.length > 0) {
        const idsToAck = toAck.map(m => m.message_id);
        try {
            console.log(`[Auto-Ack] Firing BATCH delivery ACK (${idsToAck.length} messages)`);
            await ChatTransport.acknowledgeDeliveryBatch({
                message_ids: idsToAck,
                acknowledged_by: 'recipient',
                success: true,
            });

            // Update local storage + in-memory state
            for (const id of idsToAck) {
                await ChatStorage.updateMessageStatus(id, {
                    acked_by_server: true,
                    delivered_to_recipient: true,
                    ...(isPrimary ? { delivered_to_recipient_primary: true } : {}),
                } as any);
            }

            batch(() => {
                for (const msg of toAck) {
                    const msg$ = chatMessages$.chats[msg.chat_id]?.messagesById[msg.message_id];
                    if (msg$?.peek()) {
                        msg$.delivered_to_recipient.set(true);
                        if (isPrimary) msg$.delivered_to_recipient_primary.set(true);
                    }
                }
            });
        } catch (err) {
            console.warn('[Auto-Ack] Batch ACK failed (will retry on next sync)', err);
        }
    }

    // --- PART B: Sender Sync ACK (Messages sent from other devices) ---
    if (isPrimary && !options?.skipSenderSync) {
        const unackedSync = messages.filter(m =>
            m.is_from_me && !m.synced_to_sender_primary
        );

        for (const m of unackedSync) {
            try {
                console.log(`[Auto-Ack] Firing SENDER sync ACK for ${m.message_id}`);
                await ChatTransport.acknowledgeDelivery({
                    message_id: m.message_id,
                    acknowledged_by: 'sender',
                    success: true,
                });

                await ChatStorage.updateMessageStatus(m.message_id, {
                    synced_to_sender_primary: true,
                } as any);

                const msg$ = chatMessages$.chats[m.chat_id]?.messagesById[m.message_id];
                if (msg$?.peek()) msg$.synced_to_sender_primary.set(true);
            } catch (err) {
                console.warn(`[Auto-Ack] Sync ACK failed for ${m.message_id}`, err);
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
    hydratingFromStorage: boolean;
    hydratedFromStorage: boolean;
    chatsById: Record<string, ChatEntry>;
    chatIds: string[];
    totalUnreadCount: number;
    hasChats: boolean;
    setLoading: (value: boolean) => void;
    setError: (value: string | null) => void;
    setChats: (entries: ChatEntry[]) => Promise<void>;
    loadChatsFromStorage: () => Promise<void>;
    upsertChat: (entry: ChatEntry) => void;
    persistChat: (chatId: string) => void;
    clearPreviewIfLastMessage: (chatId: string, messageIds: string[]) => void;
    updateUnreadCount: (chatId: string, count: number) => void;
    markChatRead: (chatId: string) => void;
    markFetched: () => void;
    refreshMessageCounts: () => Promise<void>;
    incrementMessageCount: (chatId: string, delta: number) => void;
    clearChatMessages: (chatId: string) => void;
    updateCachedAvatarFileId: (userId: string, fileId: string | null) => void;
    reset: () => void;
}

function sortChatsByActivity(a: ChatEntry, b: ChatEntry): number {
    const aTime = a.last_message_created_at ?? a.created_at;
    const bTime = b.last_message_created_at ?? b.created_at;
    if (!aTime || !bTime) return 0;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
}

function toChatMap(entries: ChatEntry[]): Record<string, ChatEntry> {
    const byId: Record<string, ChatEntry> = {};
    for (const entry of entries) {
        if (entry?.chat_id) {
            byId[entry.chat_id] = entry;
        }
    }
    return byId;
}

const state$ = observable({
    chatsById: {} as Record<string, ChatEntry>,
    loading: false,
    error: null as string | null,
    lastFetchedAt: null as number | null,
    hydratingFromStorage: false,
    hydratedFromStorage: false,

    // Computeds (Functions in 3.0 observables are lazy computeds)
    chats() {
        const byId = state$.chatsById.get();
        return Object.values(byId)
            .filter(c => c && c.chat_id && (c.local_message_count ?? 0) > 0)
            .sort(sortChatsByActivity);
    },
    chatIds() {
        return state$.chats.get().map((c: ChatEntry) => c.chat_id);
    },
    totalUnreadCount() {
        const byId = state$.chatsById.get();
        return Object.values(byId)
            .filter(c => (c.local_message_count ?? 0) > 0)
            .reduce((sum, c) => sum + (c.unread_count || 0), 0);
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
    async setChats(entries: ChatEntry[]) {
        const normalized = normalizeChatEntries(entries);
        // Mark all server-returned chats as contactable
        for (const chat of normalized) {
            chat.is_contactable = true;
        }

        try {
            await ChatStorage.insertChats(normalized);
        } catch (err) {
            console.warn('[ChatListState] insertChats failed; continuing with in-memory set', err);
        }

        batch(() => {
            const existing = state$.chatsById.peek();
            const incoming = toChatMap(normalized);

            // Mark preserved chats (local-only, not in server response) as non-contactable
            const merged: Record<string, ChatEntry> = {};
            for (const [id, chat] of Object.entries(existing)) {
                if (incoming[id]) continue; // will be overwritten by incoming
                if (chat.is_contactable !== false) {
                    merged[id] = { ...chat, is_contactable: false };
                } else {
                    merged[id] = chat; // already marked
                }
            }

            // Preserve local-only fields from existing state when merging
            // (server doesn't send these fields)
            for (const [id, chat] of Object.entries(incoming)) {
                if (existing[id]?.local_message_count != null) {
                    chat.local_message_count = existing[id].local_message_count;
                }
                if (!chat.cached_avatar_file_id && existing[id]?.cached_avatar_file_id) {
                    chat.cached_avatar_file_id = existing[id].cached_avatar_file_id;
                }
            }

            state$.chatsById.set({ ...merged, ...incoming });
            state$.error.set(null);
            state$.hydratingFromStorage.set(false);
            state$.hydratedFromStorage.set(true);
        });

        // Persist is_contactable: false for preserved chats to storage
        const existing = state$.chatsById.peek();
        const incoming = toChatMap(normalized);
        const preservedChats = Object.values(existing).filter(c => !incoming[c.chat_id] && c.is_contactable === false);
        if (preservedChats.length > 0) {
            ChatStorage.insertChats(preservedChats).catch(err =>
                console.warn('[ChatListState] Failed to persist is_contactable flags', err)
            );
        }

        // Proactively fetch all pending messages and ACK them
        // After sync completes, re-hydrate message counts so chats become visible
        chatActions.syncPendingMessages()
            .then(() => state$.refreshMessageCounts())
            .catch(err =>
                console.warn('[ChatListState] syncPendingMessages after setChats failed', err)
            );

        // Also hydrate counts immediately for messages already in local DB
        state$.refreshMessageCounts().catch(err =>
            console.warn('[ChatListState] initial refreshMessageCounts failed', err)
        );
    },
    async loadChatsFromStorage() {
        if (state$.hydratedFromStorage.peek() || state$.hydratingFromStorage.peek()) return;
        if (Object.keys(state$.chatsById.peek()).length > 0) {
            state$.hydratedFromStorage.set(true);
            return;
        }

        state$.hydratingFromStorage.set(true);
        try {
            // Wait for DB initialization (initChatStorage) to complete.
            // UI components can mount before hydratePersonalModules() finishes,
            // so we await the hydration promise to avoid "Database not initialized".
            const { waitForHydration } = await import('@/lib/storage/storage.init');
            const pending = waitForHydration();
            if (pending) await pending;

            if (state$.hydratedFromStorage.peek() || Object.keys(state$.chatsById.peek()).length > 0) {
                return;
            }

            const storedChats = await ChatStorage.getChats();

            // Race guard: skip local apply if network already populated in-memory state.
            if (state$.hydratedFromStorage.peek() || Object.keys(state$.chatsById.peek()).length > 0) {
                return;
            }

            const normalized = normalizeChatEntries(storedChats);
            if (normalized.length > 0) {
                // Hydrate local_message_count from the messages table
                const counts = await ChatStorage.getMessageCountsByChatId();
                for (const chat of normalized) {
                    chat.local_message_count = counts[chat.chat_id] ?? 0;
                }
                state$.chatsById.set(toChatMap(normalized));
                state$.error.set(null);
            }
        } catch (err) {
            console.warn('[ChatListState] loadChatsFromStorage failed', err);
        } finally {
            state$.hydratingFromStorage.set(false);
            state$.hydratedFromStorage.set(true);
        }
    },
    upsertChat(entry: ChatEntry) {
        const normalized = normalizeChatEntry(entry);
        if (!normalized) return;
        // Preserve local_message_count if not explicitly set in the new entry
        if (normalized.local_message_count == null) {
            const existing = state$.chatsById[normalized.chat_id]?.peek();
            if (existing?.local_message_count != null) {
                normalized.local_message_count = existing.local_message_count;
            }
        }
        state$.chatsById[normalized.chat_id].set(normalized);

        ChatStorage.insertChats([normalized]).catch(err =>
            console.warn('[ChatListState] insertChats failed in upsertChat', err)
        );
    },
    persistChat(chatId: string) {
        const current = state$.chatsById[chatId]?.peek();
        if (!current) return;
        const normalized = normalizeChatEntry(current);
        if (!normalized) return;
        ChatStorage.insertChats([normalized]).catch(err =>
            console.warn(`[ChatListState] persistChat failed for ${chatId}`, err)
        );
    },
    clearPreviewIfLastMessage(chatId: string, messageIds: string[]) {
        if (!chatId || !Array.isArray(messageIds) || messageIds.length === 0) return;
        const chat$ = state$.chatsById[chatId];
        const chat = chat$?.peek();
        if (!chat?.last_message_id || !messageIds.includes(chat.last_message_id)) return;

        chat$.assign({
            last_message_content: null,
            last_message_type: null,
            last_message_id: null,
            last_message_created_at: null,
            last_message_status: 'sent',
            last_message_is_from_me: false,
            last_message_is_unsent: false,
            last_message_sender_id: null,
            updated_at: new Date().toISOString(),
        } as Partial<ChatEntry>);

        state$.persistChat(chatId);
    },
    updateUnreadCount(chatId: string, count: number) {
        batch(() => {
            const chat$ = state$.chatsById[chatId];
            if (chat$.peek()) {
                chat$.unread_count.set(Math.max(0, count));
            }
        });
        state$.persistChat(chatId);
    },
    markChatRead(chatId: string) {
        state$.updateUnreadCount(chatId, 0);
    },
    markFetched() {
        state$.lastFetchedAt.set(Date.now());
    },
    /**
     * Re-query message counts from local DB and update all chat entries.
     * Called after bulk operations that change message counts (setChats, syncPendingMessages, etc.)
     */
    async refreshMessageCounts() {
        try {
            const counts = await ChatStorage.getMessageCountsByChatId();
            batch(() => {
                const byId = state$.chatsById.peek();
                for (const chatId of Object.keys(byId)) {
                    state$.chatsById[chatId].local_message_count.set(counts[chatId] ?? 0);
                }
            });
        } catch (err) {
            console.warn('[ChatListState] refreshMessageCounts failed', err);
        }
    },
    /**
     * Increment or decrement the local_message_count for a chat.
     * Used by message operations for reactive updates without re-querying DB.
     */
    incrementMessageCount(chatId: string, delta: number) {
        const chat$ = state$.chatsById[chatId];
        if (chat$?.peek()) {
            const current = chat$.local_message_count.peek() ?? 0;
            chat$.local_message_count.set(Math.max(0, current + delta));
        }
    },
    /**
     * Reset the chat list entry for a locally-cleared chat: zero the message
     * counts, clear the unread badge, and null out the last_message_* preview
     * fields. The chat row itself is PRESERVED so the client still knows about
     * the conversation — it will auto-rehydrate on the next incoming message.
     *
     * The chats/chatIds computeds filter `local_message_count > 0`, so after
     * this runs the chat disappears from the Home list until a new message
     * arrives. Local-only — caller is responsible for persisting via
     * ChatStorage.clearChatMessages(chatId).
     */
    clearChatMessages(chatId: string) {
        if (!chatId) return;
        const chat$ = state$.chatsById[chatId];
        if (!chat$?.peek()) return;
        batch(() => {
            chat$.assign({
                local_message_count: 0,
                unread_count: 0,
                last_message_content: null,
                last_message_type: null,
                last_message_id: null,
                last_message_created_at: null,
                last_message_status: 'sent',
                last_message_is_from_me: false,
                last_message_is_unsent: false,
                last_message_sender_id: null,
                updated_at: new Date().toISOString(),
            } as Partial<ChatEntry>);
        });
        state$.persistChat(chatId);
    },
    updateCachedAvatarFileId(userId: string, fileId: string | null) {
        batch(() => {
            const byId = state$.chatsById.peek();
            for (const chatId of Object.keys(byId)) {
                const chat$ = state$.chatsById[chatId];
                if (chat$.other_user_id.peek() === userId) {
                    chat$.cached_avatar_file_id.set(fileId);
                    chat$.updated_at.set(new Date().toISOString());
                }
            }
        });
    },
    reset() {
        batch(() => {
            state$.chatsById.set({});
            state$.loading.set(false);
            state$.error.set(null);
            state$.lastFetchedAt.set(null);
            state$.hydratingFromStorage.set(false);
            state$.hydratedFromStorage.set(false);
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
    setMessages: (chatId: string, entries: MessageEntry[], options?: { skipSenderSync?: boolean }) => Promise<void>;
    prependMessages: (chatId: string, entries: MessageEntry[], options?: { skipSenderSync?: boolean }) => Promise<void>;
    addMessage: (chatId: string, entry: MessageEntry, options?: { skipAck?: boolean; skipSenderSync?: boolean }) => Promise<void>;
    updateMessageStatus: (chatId: string, messageId: string, updates: Partial<MessageEntry>) => void;
    markMessagesDelivered: (chatId: string, messageIds: string[]) => void;
    markMessagesDeliveredUpTo: (chatId: string, deliveredAt: string) => void;
    markMessagesReadUpTo: (chatId: string, readAt: string) => void;
    removeMessage: (chatId: string, messageId: string) => void;
    removeMessages: (chatId: string, messageIds: string[]) => void;
    replaceMessage: (chatId: string, oldMessageId: string, newMessage: MessageEntry) => void;
    unsendMessages: (chatId: string, messageIds: string[], senderUserId?: string) => void;
    setActiveChatId: (chatId: string | null) => void;
    updateInputText: (chatId: string, text: string) => void;
    updateMessageProgress: (chatId: string, messageId: string, progress: number) => void;
    toggleSelectMode: (chatId: string, enabled: boolean) => void;
    toggleMessageSelection: (chatId: string, messageId: string) => void;
    clearSelection: (chatId: string) => void;
    clearChat: (chatId: string) => void;
    reset: (chatId?: string) => void;
    syncPendingMessages: () => Promise<void>;
    debouncedMarkRead: (chatId: string) => void;
    downloadMediaBatch: (chatId: string, messages: MessageEntry[]) => Promise<Set<string>>;
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

    async setMessages(chatId: string, entries: MessageEntry[], options?: { skipSenderSync?: boolean }) {
        const chat = ensureChatInternal(chatId);
        const existingByIdSnapshot = chat.messagesById.peek();

        // Phase D: Get soft-deleted IDs to prevent resurrection via INSERT OR REPLACE.
        // Without this, server sync would overwrite deleted_for_me=1 with 0.
        const deletedIds = await ChatStorage.getDeletedMessageIds(chatId);
        const deletedSet = new Set(deletedIds);

        // Phase D: Persist entries, preserving local_uri from in-memory state.
        // Filter out soft-deleted messages to prevent resurrection.
        if (entries.length > 0) {
            const entriesToPersist = entries
                .filter(e => !deletedSet.has(e.message_id))
                .map(e => ({
                    ...e,
                    local_uri: e.local_uri || existingByIdSnapshot[e.message_id]?.local_uri || null,
                }));
            if (entriesToPersist.length > 0) {
                await ChatStorage.insertMessages(entriesToPersist);
            }
        }

        batch(() => {
            const existingById = chat.messagesById.peek();

            // Merge: Keep existing local/promoted messages, update them if server has newer info.
            // IMPORTANT: Preserve local_uri and skip soft-deleted entries.
            const mergedById = { ...existingById };
            for (const entry of entries) {
                if (deletedSet.has(entry.message_id)) continue;
                const existing = mergedById[entry.message_id];
                mergedById[entry.message_id] = {
                    ...(existing || {}),
                    ...entry,
                    // Preserve local fields that the server never sends
                    local_uri: entry.local_uri || existing?.local_uri || null,
                };
            }

            const mergedList = Object.values(mergedById).sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            chat.messages.set(mergedList);
            chat.messagesById.set(mergedById);
            chat.messageIds.set(mergedList.map((e) => e.message_id));
            chat.offset.set(mergedList.length);

            // Update local_message_count to reflect actual merged state
            $chatListState.incrementMessageCount(chatId, mergedList.length - ($chatListState.chatsById[chatId]?.local_message_count.peek() ?? 0));
        });

        // Auto-Ack AFTER persist (fire-and-forget)
        // [Phase 4b] Pickup missing media for the newly synced messages before ACK
        const downloadFailedIds = await this.downloadMediaBatch(chatId, entries);

        // Filter out download-failed messages from ACK batch
        // (including soft-deleted ones) so the server stops re-delivering SUCCESSES
        const toAck = entries.filter(m => !downloadFailedIds.has(m.message_id));

        ackIncomingMessages(toAck, options).catch(err =>
            console.warn('[ChatState] setMessages ACK failed', err)
        );
    },

    async prependMessages(chatId: string, entries: MessageEntry[], options?: { skipSenderSync?: boolean }) {
        const chat = ensureChatInternal(chatId);
        const existing = chat.messagesById.peek();
        const newEntries = entries.filter((e) => !existing[e.message_id]);

        if (newEntries.length === 0) {
            chat.hasMore.set(false);
            return;
        }

        // Phase D: Get soft-deleted IDs to prevent resurrection via INSERT OR REPLACE.
        // A concurrent delete_for_me WS event could soft-delete a message between the
        // getMessagesByChat read (in loadMore) and this insertMessages write.
        const deletedIds = await ChatStorage.getDeletedMessageIds(chatId);
        const deletedSet = new Set(deletedIds);
        const safeToPersist = newEntries.filter(e => !deletedSet.has(e.message_id));

        // Phase D: Persist BEFORE ACK (Rule 1)
        if (safeToPersist.length > 0) {
            await ChatStorage.insertMessages(safeToPersist);
        }

        batch(() => {
            const current = chat.messages.get();
            const merged = [...current, ...safeToPersist].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );

            chat.messages.set(merged);
            const byId = { ...existing };
            for (const entry of safeToPersist) {
                byId[entry.message_id] = entry;
            }
            chat.messagesById.set(byId);
            chat.messageIds.set(merged.map((e) => e.message_id));
            chat.offset.set(merged.length);

            // Update local_message_count to reflect actual merged state
            $chatListState.incrementMessageCount(chatId, merged.length - ($chatListState.chatsById[chatId]?.local_message_count.peek() ?? 0));
        });

        // [Phase 4b] Pickup missing media for the prepended messages before ACK
        const downloadFailedIds = await this.downloadMediaBatch(chatId, safeToPersist);

        // Filter out download-failed messages from ACK batch
        const toAck = safeToPersist.filter(m => !downloadFailedIds.has(m.message_id));

        ackIncomingMessages(toAck, options).catch(err =>
            console.warn('[ChatState] prependMessages ACK failed', err)
        );
    },

    /**
     * Scans a batch of messages and triggers downloads for any missing media.
     * This covers historical sync, pagination, and boot scenarios.
     */
    async downloadMediaBatch(chatId: string, messages: MessageEntry[]): Promise<Set<string>> {
        const downloadFailedIds = new Set<string>();
        const mediaMessages = messages.filter(m =>
            ['image', 'video', 'audio', 'file'].includes(m.message_type) &&
            !m.local_uri
        );

        if (mediaMessages.length === 0) return downloadFailedIds;

        // Ensure tokens are fresh before starting the batch download (User Request: Refresh only for downloads)
        await resolveMediaUrls(mediaMessages);
        await ChatStorage.insertMessages(mediaMessages);

        // Sentinel URI to mark permanently failed downloads — survives merges
        // because local_uri is preserved in setMessages/prependMessages.
        // Truthy value → `!m.local_uri` filter skips it on next reload → no infinite retry.
        const DOWNLOAD_FAILED_URI = 'error://download-failed';

        // Process in small serial batches to avoid overwhelming the network
        // We use a simple loop with await to keep concurrency low (1 at a time per batch call)
        // because multiple pagination/sync calls might run in parallel.
        for (const msg of mediaMessages) {
            try {
                // If the message is missing a download URL, it's a permanent server-side data error.
                // Mark with sentinel so we don't retry and the UI shows the error icon.
                if (!msg.download_url) {
                    console.warn(`[ChatActions] downloadMediaBatch: skipping ${msg.message_id} - missing download_url`);
                    msg.local_uri = DOWNLOAD_FAILED_URI;
                    this.updateMessageStatus(chatId, msg.message_id, { local_uri: DOWNLOAD_FAILED_URI, status: 'failed' });
                    await ChatStorage.updateMessageStatus(msg.message_id, { local_uri: DOWNLOAD_FAILED_URI, status: 'failed' } as any);
                    continue;
                }

                // Determine if we should show progress (only for Audio/Video/Large Files)
                const shouldShowProgress = msg.message_type !== 'image';

                const localUri = await downloadIncomingFile(msg, (p) => {
                    if (shouldShowProgress) {
                        this.updateMessageProgress(chatId, msg.message_id, p);
                    }
                });

                if (localUri) {
                    msg.local_uri = localUri; // Mutate entry so ACK filter sees local_uri
                    await ChatStorage.updateMessageStatus(msg.message_id, { local_uri: localUri });
                    this.updateMessageStatus(chatId, msg.message_id, {
                        local_uri: localUri,
                        progress: 100
                    });
                }
            } catch (err) {
                console.error(`[ChatActions] downloadMediaBatch failed for ${msg.message_id}`, err);
                downloadFailedIds.add(msg.message_id);
                // Persist sentinel so we don't retry on next reload
                msg.local_uri = DOWNLOAD_FAILED_URI;
                this.updateMessageStatus(chatId, msg.message_id, { local_uri: DOWNLOAD_FAILED_URI, status: 'failed' });
                await ChatStorage.updateMessageStatus(msg.message_id, { local_uri: DOWNLOAD_FAILED_URI, status: 'failed' } as any);
            }
        }
        return downloadFailedIds;
    },

    async addMessage(chatId: string, entry: MessageEntry, options?: { skipAck?: boolean; skipSenderSync?: boolean }) {
        // Resolve media URLs first (async) before entering synchronous batch
        let resolvedEntry = { ...entry };
        if (resolvedEntry.file_id && !resolvedEntry.local_uri) {
            await resolveMediaUrls([resolvedEntry]);
        }

        const chat = ensureChatInternal(chatId);
        const existing = chat.messagesById.peek();
        if (existing[resolvedEntry.message_id]) return;

        // Phase D: Check if this message was soft-deleted
        const deletedIds = await ChatStorage.getDeletedMessageIds(chatId);
        if (deletedIds.includes(resolvedEntry.message_id)) {
            // Still ACK so the server stops re-delivering
            if (!options?.skipAck) {
                ackIncomingMessages([resolvedEntry], { skipSenderSync: options?.skipSenderSync ?? true, skipMediaCheck: true }).catch(err =>
                    console.warn('[ChatState] addMessage ACK (deleted msg) failed', err)
                );
            }
            return;
        }

        // Phase D: Persist BEFORE ACK (Rule 1)
        await ChatStorage.insertMessage(resolvedEntry);

        batch(() => {
            const current = chat.messages.peek();
            const updated = [resolvedEntry, ...current].slice(0, 1000);

            chat.messages.set(updated);
            chat.messagesById[resolvedEntry.message_id].set(resolvedEntry);
            chat.messageIds.set(updated.map((e) => e.message_id));

            // Increment local_message_count
            $chatListState.incrementMessageCount(chatId, 1);
        });

        // Auto-Ack AFTER persist (fire-and-forget, skip sender sync)
        if (!options?.skipAck) {
            console.log(`[ChatActions] addMessage: Persisted ${resolvedEntry.message_id}. ACK follows.`);
            ackIncomingMessages([resolvedEntry], { skipSenderSync: options?.skipSenderSync ?? true }).catch(err =>
                console.warn('[ChatState] addMessage ACK failed', err)
            );
        }
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

    updateMessageProgress(chatId: string, messageId: string, progress: number) {
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const message$ = chat.messagesById[messageId];
            if (message$.peek()) {
                message$.progress.set(progress);

                const currentMessages = chat.messages.peek();
                const index = currentMessages.findIndex((m: MessageEntry) => m.message_id === messageId);
                if (index !== -1) {
                    chat.messages[index].progress.set(progress);
                }
            }
        });
    },

    markMessagesDelivered(chatId: string, messageIds: string[]) {
        let shouldPersistChat = false;
        const changedMessageIds: string[] = [];
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const idSet = new Set(messageIds);

            messageIds.forEach(id => {
                const msg$ = chat.messagesById[id];
                if (msg$.peek() && !msg$.delivered_to_recipient.peek()) {
                    msg$.delivered_to_recipient.set(true);
                    changedMessageIds.push(id);

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
                shouldPersistChat = true;
            }
        });
        if (changedMessageIds.length > 0) {
            Promise.all(changedMessageIds.map(id =>
                ChatStorage.updateMessageStatus(id, { delivered_to_recipient: true } as any)
            )).catch(err =>
                console.warn(`[ChatState] markMessagesDelivered: Storage persist failed for ${chatId}`, err)
            );
        }
        if (shouldPersistChat) {
            $chatListState.persistChat(chatId);
        }
    },

    markMessagesDeliveredUpTo(chatId: string, deliveredAt: string) {
        if (!deliveredAt) return;
        console.log(`[ChatState] markMessagesDeliveredUpTo: ENTER chat=${chatId} deliveredAt=${deliveredAt}`);
        let shouldPersistChat = false;
        const changedMessageIds: string[] = [];
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const targetTime = new Date(deliveredAt.replace(' ', 'T')).getTime();
            if (isNaN(targetTime)) {
                console.warn(`[ChatState] markMessagesDeliveredUpTo: INVALID deliveredAt format: ${deliveredAt}`);
                return;
            }

            // GRACE PERIOD REMOVED: Match messages strictly against the server-provided timestamp.
            // Previously included + 10000ms offset which caused false positives for subsequent messages.
            const adjustedTargetTime = targetTime;
            console.log(`[ChatState] markMessagesDeliveredUpTo: targetTime=${targetTime} (Grace period removed)`);

            const currentMessages = chat.messages.peek();
            let count = 0;

            // 1. Update individual messages
            currentMessages.forEach((m: MessageEntry, index: number) => {
                const mTime = new Date(m.created_at).getTime();
                if (m.is_from_me && mTime <= adjustedTargetTime && !m.delivered_to_recipient) {
                    chat.messagesById[m.message_id].delivered_to_recipient.set(true);
                    chat.messages[index].delivered_to_recipient.set(true);
                    changedMessageIds.push(m.message_id);
                    count++;
                }
            });
            console.log(`[ChatState] markMessagesDeliveredUpTo: Updated ${count} individual messages`);

            // 2. Update Chat List meta (Source of Truth for Double Grey Tick)
            // NOTE: Legend State's `chatsById[chatId]` always returns a truthy
            // proxy even after the underlying value has been deleted, so the
            // only safe existence check is `.peek()` on the underlying value.
            // Same pattern as `markMessagesReadUpTo` below.
            const chatEntry$ = $chatListState.chatsById[chatId];
            const chatEntry = chatEntry$?.peek();
            if (chatEntry) {
                console.log(`[ChatState] markMessagesDeliveredUpTo: Updating ChatEntry in list. Setting other_user_last_delivered_at=${deliveredAt}`);
                chatEntry$.other_user_last_delivered_at.set(deliveredAt);
                shouldPersistChat = true;

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
        if (changedMessageIds.length > 0) {
            Promise.all(changedMessageIds.map(id =>
                ChatStorage.updateMessageStatus(id, { delivered_to_recipient: true } as any)
            )).catch(err =>
                console.warn(`[ChatState] markMessagesDeliveredUpTo: Storage persist failed for ${chatId}`, err)
            );
        }
        if (shouldPersistChat) {
            $chatListState.persistChat(chatId);
        }
    },

    markMessagesReadUpTo(chatId: string, readAt: string) {
        if (!readAt) return;
        console.log(`[ChatState] markMessagesReadUpTo: ENTER chat=${chatId} readAt=${readAt}`);
        let shouldPersistChat = false;
        const changedMessageIds: string[] = [];
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const targetTime = new Date(readAt.replace(' ', 'T')).getTime();
            if (isNaN(targetTime)) {
                console.warn(`[ChatState] markMessagesReadUpTo: INVALID readAt format: ${readAt}`);
                return;
            }

            // GRACE PERIOD REMOVED: Match messages strictly against the server-provided timestamp.
            // Previously included + 10000ms offset which caused false positives for subsequent messages.
            const adjustedTargetTime = targetTime;

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
                    changedMessageIds.push(m.message_id);
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
                shouldPersistChat = true;

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
        if (changedMessageIds.length > 0) {
            Promise.all(changedMessageIds.map(id =>
                ChatStorage.updateMessageStatus(id, {
                    status: 'read',
                    delivered_to_recipient: true,
                } as any)
            )).catch(err =>
                console.warn(`[ChatState] markMessagesReadUpTo: Storage persist failed for ${chatId}`, err)
            );
        }
        if (shouldPersistChat) {
            $chatListState.persistChat(chatId);
        }
    },

    removeMessage(chatId: string, messageId: string) {
        this.removeMessages(chatId, [messageId]);
    },

    removeMessages(chatId: string, messageIds: string[]) {
        let actualRemoved = 0;
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const currentMessages = chat.messages.peek();
            const idSet = new Set(messageIds);

            const filtered = currentMessages.filter((m: MessageEntry) => !idSet.has(m.message_id));
            actualRemoved = currentMessages.length - filtered.length;

            chat.messages.set(filtered);
            messageIds.forEach(id => {
                if (chat.messagesById[id].peek()) {
                    chat.messagesById[id].delete();
                }
            });
            chat.messageIds.set(filtered.map((m: MessageEntry) => m.message_id));

            // Decrement local_message_count
            if (actualRemoved > 0) {
                $chatListState.incrementMessageCount(chatId, -actualRemoved);
            }
        });
    },

    replaceMessage(chatId: string, oldMessageId: string, newMessage: MessageEntry) {
        batch(() => {
            const chat = ensureChatInternal(chatId);
            const currentMessages = chat.messages.peek();

            // Remove old message and add new in single atomic operation
            const filtered = currentMessages.filter((m: MessageEntry) => m.message_id !== oldMessageId);
            const updated = [newMessage, ...filtered].slice(0, 1000);

            // Atomic state update - single render, no flicker
            chat.messages.set(updated);
            chat.messagesById[oldMessageId]?.delete();
            chat.messagesById[newMessage.message_id].set(newMessage);
            chat.messageIds.set(updated.map((m: MessageEntry) => m.message_id));
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

    /**
     * Drop a single chat's in-memory conversation state (used when the user
     * clears a chat locally). Removes the map entry entirely and, if this chat
     * was the active one, resets activeChatId/isChatOpen so the chat screen's
     * useFocusEffect navigates back Home.
     *
     * Local-only — caller is responsible for ChatStorage.clearChatMessages(chatId)
     * and $chatListState.clearChatMessages(chatId). The chat row itself is NOT
     * removed; it stays in $chatListState.chatsById so the chat can auto‑rehydrate
     * on the next incoming message.
     */
    clearChat(chatId: string) {
        if (!chatId) return;
        batch(() => {
            const chat$ = chatMessages$.chats[chatId];
            if (chat$?.peek()) {
                chat$.delete();
            }
            if (chatMessages$.activeChatId.peek() === chatId) {
                chatMessages$.activeChatId.set(null);
                chatMessages$.isChatOpen.set(false);
            }
        });
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
        if (isSyncingPending) return; // Concurrency guard: block duplicate in-flight calls
        isSyncingPending = true;
        console.log('[ChatState] syncPendingMessages: START');
        try {
            const response = await ChatTransport.getPendingMessages({ limit: 50 });
            if (!response?.messages || response.messages.length === 0) {
                console.log('[ChatState] syncPendingMessages: No pending messages found.');
                return;
            }

            console.log(`[ChatState] syncPendingMessages: Found ${response.messages.length} messages.`);

            // Phase D fix: Get soft-deleted IDs across ALL chats in the batch to
            // prevent INSERT OR REPLACE from resurrecting deleted_for_me = 1 rows.
            const chatIds = [...new Set(response.messages.map(m => m.chat_id))];
            const allDeletedIds = new Set<string>();
            for (const chatId of chatIds) {
                const deletedIds = await ChatStorage.getDeletedMessageIds(chatId);
                for (const id of deletedIds) allDeletedIds.add(id);
            }
            const messagesToPersist = response.messages.filter(m => !allDeletedIds.has(m.message_id));

            // Normalize status: server MessageResponse has no 'status' field.
            // Without this, the storage layer defaults undefined → 'pending',
            // which hides "Delete for Me" in the UI. These are server-confirmed
            // messages, so they are at minimum 'sent'.
            for (const m of messagesToPersist) {
                if (!m.status) {
                    m.status = 'sent';
                }
            }

            // Phase D: Persist non-deleted messages to local storage BEFORE any ACK (Rule 1)
            if (messagesToPersist.length > 0) {
                await ChatStorage.insertMessages(messagesToPersist);
            }

            // Phase D fix: Download media files for messages before ACK.
            // On primary devices, primary ACK triggers backend file deletion (§8.3/§8.7.4),
            // so files MUST be downloaded first or they'll be permanently lost.
            const isPrimary = authState.isPrimary.peek() === true;
            const downloadFailedIds = new Set<string>();
            for (const msg of response.messages) {
                // Skip media downloads for soft-deleted messages — we'll ACK them
                // but not process them, so downloading their files wastes bandwidth
                // and can trap primary devices in an infinite retry loop.
                if (allDeletedIds.has(msg.message_id)) continue;
                if (msg.file_id && msg.download_url && msg.message_type !== 'text' && msg.message_type !== 'unsent') {
                    try {
                        // Phase 4b: Provide progress callback for UI if chat is open during sync
                        // Ensure token is fresh before download (User Request: Refresh only for downloads)
                        await resolveMediaUrls([msg]);
                        await ChatStorage.updateMessageStatus(msg.message_id, {
                            download_url: msg.download_url,
                            view_url: msg.view_url,
                            file_token_expiry: msg.file_token_expiry
                        } as any);

                        const localUri = await downloadIncomingFile(msg, (p) => {
                            this.updateMessageProgress(msg.chat_id, msg.message_id, p);
                        });

                        if (localUri) {
                            msg.local_uri = localUri; // Mutate so in-memory state gets local_uri
                            await ChatStorage.updateMessageStatus(msg.message_id, { local_uri: localUri } as any);
                            this.updateMessageStatus(msg.chat_id, msg.message_id, {
                                local_uri: localUri,
                                progress: 100
                            });
                        }
                    } catch (err) {
                        if (isPrimary) {
                            console.error('[ChatState] syncPendingMessages: Media download failed on PRIMARY — skipping ACK for this message', msg.message_id, err);

                            // 🆕 NEW: If the download fails with a 404 (Missing on Relay),
                            // mark it as 'error' so it stops clogging the sync queue.
                            const statusCode = (err as any)?.status || (err as any)?.code;
                            if (statusCode === 404) {
                                console.log('[ChatState] syncPendingMessages: Resource GONE (404) on relay — marking message as error', msg.message_id);
                                ChatStorage.updateMessageStatus(msg.message_id, { status: 'error' } as any).catch(() => { });
                                this.updateMessageStatus(msg.chat_id, msg.message_id, { status: 'error' });
                            } else {
                                // Track failed IDs so they're excluded from ACK and in-memory state
                                downloadFailedIds.add(msg.message_id);
                            }
                            continue;
                        }
                        console.warn('[ChatState] syncPendingMessages: Media download failed on non-primary — skipping ACK for safety', msg.message_id, err);
                        // Block ACK on non-primary to prevent the server from deleting media 
                        // before other devices (or the primary) have synced it.
                        downloadFailedIds.add(msg.message_id);
                        // Persist sentinel so we don't retry on next reload (same as downloadMediaBatch)
                        const DOWNLOAD_FAILED_URI = 'error://download-failed';
                        msg.local_uri = DOWNLOAD_FAILED_URI;
                        this.updateMessageStatus(msg.chat_id, msg.message_id, { local_uri: DOWNLOAD_FAILED_URI, status: 'failed' });
                        await ChatStorage.updateMessageStatus(msg.message_id, { local_uri: DOWNLOAD_FAILED_URI, status: 'failed' } as any);
                    }
                }
            }

            // Filter out download-failed messages from further processing
            const messagesToProcess = downloadFailedIds.size > 0
                ? response.messages.filter(m => !downloadFailedIds.has(m.message_id))
                : response.messages;

            // Exclude soft-deleted messages from in-memory state (but NOT from ACK —
            // they must be ACK'd so the server stops re-delivering them).
            const filteredToProcess = messagesToProcess.filter(m => !allDeletedIds.has(m.message_id));

            batch(() => {
                const messagesByChat: Record<string, MessageEntry[]> = {};
                for (const msg of filteredToProcess) {
                    if (!messagesByChat[msg.chat_id]) messagesByChat[msg.chat_id] = [];
                    messagesByChat[msg.chat_id].push(msg);
                }

                for (const chatId in messagesByChat) {
                    const chatMsgs = messagesByChat[chatId];
                    const activeChatId = chatMessages$.activeChatId.peek();
                    const chatStore = chatMessages$.chats[chatId];
                    const chatStoreData = chatStore.peek();

                    // 1. Add messages to active chat store (if loaded) — inline to avoid double persist
                    if (activeChatId === chatId || chatStoreData) {
                        let addedCount = 0;
                        chatMsgs.forEach(m => {
                            const chat = ensureChatInternal(chatId);
                            const existing = chat.messagesById.peek();
                            if (existing[m.message_id]) return;
                            addedCount++;
                            const current = chat.messages.peek();
                            const updated = [m, ...current].slice(0, 1000);
                            chat.messages.set(updated);
                            chat.messagesById[m.message_id].set(m);
                            chat.messageIds.set(updated.map(e => e.message_id));
                        });
                        if (addedCount > 0) {
                            $chatListState.incrementMessageCount(chatId, addedCount);
                        }
                    }

                    // 2. Update Chat List previews (Only update UI/Previews, TRUST server unread_count)
                    const currentEntry = $chatListState.chatsById[chatId]?.peek();
                    if (currentEntry) {
                        const sortedSynced = [...chatMsgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                        const lastMsg = sortedSynced[sortedSynced.length - 1];

                        const serverPreview = currentEntry.last_message_content;
                        if (serverPreview === null || serverPreview === '') {
                            continue; // Phase D fix: was `return` which broke the entire for loop
                        }

                        const isNewer = !currentEntry.last_message_created_at || (new Date(lastMsg.created_at).getTime() > new Date(currentEntry.last_message_created_at).getTime());
                        if (isNewer) {
                            const currentUserId = authState.userId.peek();
                            $chatListState.upsertChat({
                                ...currentEntry,
                                last_message_content: getPreviewText(lastMsg),
                                last_message_created_at: lastMsg.created_at,
                                last_message_type: lastMsg.message_type,
                                last_message_is_from_me: lastMsg.is_from_me,
                                last_message_status: lastMsg.status ?? 'sent',
                                last_message_sender_id: lastMsg.is_from_me
                                    ? (currentUserId || null)
                                    : currentEntry.other_user_id,
                                last_message_id: lastMsg.message_id,
                                last_message_is_unsent: lastMsg.message_type === 'unsent',
                                updated_at: lastMsg.created_at,
                            });
                        }
                    }
                }
            });

            // ACK all successfully-downloaded messages (including soft-deleted ones)
            // so the server stops re-delivering them. filteredToProcess excludes deleted
            // from in-memory state, but messagesToProcess includes them for ACK.
            await ackIncomingMessages(messagesToProcess, { skipMediaCheck: true }).catch(err =>
                console.warn('[ChatState] syncPendingMessages ACK failed', err)
            );

            console.log('[ChatState] syncPendingMessages: DONE');
        } catch (err) {
            console.error('[ChatState] syncPendingMessages: FAILED', err);
        } finally {
            isSyncingPending = false;
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

        const timer = setTimeout(async () => {
            timers.delete(chatId);
            console.log(`[ChatState] debouncedMarkRead: Firing for ${chatId}`);
            try {
                const response = await ChatTransport.markChatRead({ chat_id: chatId });
                if (response?.status === true) {
                    $chatListState.markChatRead(chatId);
                }
            } catch (err) {
                console.warn(`[ChatState] debouncedMarkRead: FAILED for ${chatId}`, err);
            }
        }, 1000);

        timers.set(chatId, timer);
    },
};

export const $chatMessagesState = {
    ...chatActions,
    activeChatId: chatMessages$.activeChatId,
    isChatOpen: chatMessages$.isChatOpen,
    chats: chatMessages$.chats,
} as unknown as ChatMessagesState;
