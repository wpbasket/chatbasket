/**
 * Tests for the `is_contactable` privacy flag in chat sync.
 *
 * Validates:
 * 1. Server-returned chats → is_contactable: true
 * 2. Preserved (excluded) chats → is_contactable: false
 * 3. Self-healing: excluded user reappears → is_contactable restores to true
 * 4. All-empty server response preserves everything as non-contactable
 */

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/storage/personalStorage/chat/chat.storage', () => ({
    insertChats: jest.fn().mockResolvedValue(undefined),
    getChats: jest.fn().mockResolvedValue([]),
    replaceChats: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/personalLib/chatApi/chat.transport', () => ({
    ChatTransport: {
        getChats: jest.fn().mockResolvedValue({ chats: [], count: 0 }),
        getMessages: jest.fn().mockResolvedValue({ messages: [], count: 0 }),
        checkEligibility: jest.fn().mockResolvedValue({ allowed: true }),
    },
}));

jest.mock('@/lib/personalLib/chatApi/outbox.queue', () => ({
    outboxQueue: {
        processQueue: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('@/lib/personalLib/chatApi/connection.watcher', () => ({
    connectionWatcher: { start: jest.fn(), stop: jest.fn() },
}));

import { $chatListState } from '@/state/personalState/chat/personal.state.chat';
import type { ChatEntry } from '@/lib/personalLib/models/personal.model.chat';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeChatEntry(overrides: Partial<ChatEntry> & { chat_id: string; other_user_id: string }): ChatEntry {
    return {
        other_user_name: 'User',
        other_user_username: 'user',
        avatar_url: `https://example.com/${overrides.other_user_id}.jpg`,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        other_user_last_read_at: '2026-01-01T00:00:00Z',
        other_user_last_delivered_at: '2026-01-01T00:00:00Z',
        last_message_content: 'Hello',
        last_message_created_at: '2026-01-01T00:00:00Z',
        last_message_type: 'text',
        last_message_is_from_me: false,
        last_message_status: 'sent',
        last_message_sender_id: overrides.other_user_id,
        last_message_id: `msg_${overrides.chat_id}`,
        last_message_is_unsent: false,
        unread_count: 0,
        avatar_file_id: null,
        cached_avatar_file_id: null,
        ...overrides,
    };
}

/** Read the plain JS snapshot from the Legend State observable */
function getChat(chatId: string): ChatEntry | undefined {
    const all = $chatListState.chatsById.peek();
    return all[chatId];
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('is_contactable flag', () => {
    beforeEach(() => {
        $chatListState.reset();
    });

    it('marks server-returned chats as is_contactable: true', async () => {
        await $chatListState.setChats([
            makeChatEntry({ chat_id: 'c1', other_user_id: 'alice' }),
            makeChatEntry({ chat_id: 'c2', other_user_id: 'bob' }),
        ]);

        expect(getChat('c1')?.is_contactable).toBe(true);
        expect(getChat('c2')?.is_contactable).toBe(true);
    });

    it('marks preserved (excluded) chats as is_contactable: false', async () => {
        // Sync 1: Alice + Bob
        await $chatListState.setChats([
            makeChatEntry({ chat_id: 'c1', other_user_id: 'alice' }),
            makeChatEntry({ chat_id: 'c2', other_user_id: 'bob' }),
        ]);

        // Sync 2: Only Alice (Bob blocked/private)
        await $chatListState.setChats([
            makeChatEntry({ chat_id: 'c1', other_user_id: 'alice' }),
        ]);

        expect(getChat('c1')?.is_contactable).toBe(true);
        expect(getChat('c2')).toBeDefined();
        expect(getChat('c2')?.is_contactable).toBe(false);
    });

    it('self-heals: excluded user reappearing restores is_contactable', async () => {
        // Sync 1: Both
        await $chatListState.setChats([
            makeChatEntry({ chat_id: 'c1', other_user_id: 'alice' }),
            makeChatEntry({ chat_id: 'c2', other_user_id: 'bob' }),
        ]);

        // Sync 2: Bob excluded
        await $chatListState.setChats([
            makeChatEntry({ chat_id: 'c1', other_user_id: 'alice' }),
        ]);
        expect(getChat('c2')?.is_contactable).toBe(false);

        // Sync 3: Bob back (unblocked)
        await $chatListState.setChats([
            makeChatEntry({ chat_id: 'c1', other_user_id: 'alice' }),
            makeChatEntry({ chat_id: 'c2', other_user_id: 'bob', avatar_url: 'https://new.jpg' }),
        ]);

        expect(getChat('c2')?.is_contactable).toBe(true);
        expect(getChat('c2')?.avatar_url).toBe('https://new.jpg');
    });

    it('empty server response preserves all as non-contactable', async () => {
        await $chatListState.setChats([
            makeChatEntry({ chat_id: 'c1', other_user_id: 'alice' }),
            makeChatEntry({ chat_id: 'c2', other_user_id: 'bob' }),
        ]);

        await $chatListState.setChats([]);

        expect(getChat('c1')).toBeDefined();
        expect(getChat('c1')?.is_contactable).toBe(false);
        expect(getChat('c2')).toBeDefined();
        expect(getChat('c2')?.is_contactable).toBe(false);
    });

    it('updates data for contactable chats (server is source of truth)', async () => {
        await $chatListState.setChats([
            makeChatEntry({ chat_id: 'c1', other_user_id: 'alice', unread_count: 0 }),
        ]);

        await $chatListState.setChats([
            makeChatEntry({ chat_id: 'c1', other_user_id: 'alice', unread_count: 5 }),
        ]);

        expect(getChat('c1')?.unread_count).toBe(5);
        expect(getChat('c1')?.is_contactable).toBe(true);
    });

    it('repeated syncs without user do not mutate preserved data', async () => {
        await $chatListState.setChats([
            makeChatEntry({ chat_id: 'c1', other_user_id: 'alice' }),
            makeChatEntry({ chat_id: 'c2', other_user_id: 'bob' }),
        ]);

        // Sync 2: Bob excluded
        await $chatListState.setChats([
            makeChatEntry({ chat_id: 'c1', other_user_id: 'alice' }),
        ]);
        const bobAfter2 = getChat('c2');

        // Sync 3: Bob still excluded
        await $chatListState.setChats([
            makeChatEntry({ chat_id: 'c1', other_user_id: 'alice' }),
        ]);

        expect(getChat('c2')?.is_contactable).toBe(false);
        expect(getChat('c2')?.avatar_url).toBe(bobAfter2?.avatar_url);
    });
});
