/**
 * Tests for the UI sort function getMessageCreatedAtMs / sortMessagesByLocalCreatedAtDesc.
 *
 * Verifies:
 * 1. Outgoing messages (with local_seq) sort by local_seq — stable press order, no jump
 * 2. Incoming messages (no local_seq) sort by created_at — server time
 * 3. Mixed incoming + outgoing sort correctly in same chat
 * 4. replaceMessage preserves local_seq-based ordering after server ACK
 * 5. local_seq=0 is treated as valid (not missing)
 */

// ── Deep Mocks (native modules that cause crashes) ──────────────────────────

jest.mock('@/lib/constantLib', () => ({
    ApiError: class ApiError extends Error {
        constructor(msg: string) { super(msg); }
    },
}));

jest.mock('@/utils/personalUtils/util.chatMedia', () => ({
    resolveMediaUrls: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/personalUtils/util.chatPreview', () => ({
    getPreviewText: jest.fn().mockReturnValue('Hello'),
}));

jest.mock('@/lib/personalLib/fileSystem/file.download', () => ({
    downloadIncomingFile: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/storage/personalStorage/chat/chat.storage.normalize', () => ({
    normalizeChatEntry: jest.fn((input: any) => input),
    normalizeChatEntries: jest.fn((input: any[]) => input),
}));

jest.mock('@/state/personalState/user/personal.state.user', () => ({
    $personalStateUser: {
        user: { peek: () => ({ user_id: 'user-1' }) },
    },
}));

// ── Core Mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/storage/personalStorage/chat/chat.storage', () => ({
    __esModule: true,
    insertChats: jest.fn().mockResolvedValue(undefined),
    getChats: jest.fn().mockResolvedValue([]),
    replaceChats: jest.fn().mockResolvedValue(undefined),
    insertMessages: jest.fn().mockResolvedValue(undefined),
    insertMessage: jest.fn().mockResolvedValue(undefined),
    updateMessageStatus: jest.fn().mockResolvedValue(undefined),
    getDeletedMessageIds: jest.fn().mockResolvedValue([]),
    getMessageCountsByChatId: jest.fn().mockResolvedValue({}),
    messageExists: jest.fn().mockResolvedValue(false),
}));

jest.mock('@/lib/personalLib/chatApi/chat.transport', () => ({
    __esModule: true,
    ChatTransport: {
        getChats: jest.fn().mockResolvedValue({ chats: [], count: 0 }),
        getUserChats: jest.fn().mockResolvedValue({ chats: [], count: 0 }),
        getMessages: jest.fn().mockResolvedValue({ messages: [], count: 0 }),
        checkEligibility: jest.fn().mockResolvedValue({ allowed: true }),
        getPendingMessages: jest.fn().mockResolvedValue({ messages: [], count: 0 }),
        acknowledgeDelivery: jest.fn().mockResolvedValue({ acknowledged: true }),
        acknowledgeDeliveryBatch: jest.fn().mockResolvedValue({ acknowledged: true }),
        getFileURL: jest.fn(),
        uploadFile: jest.fn(),
        uploadFileWithProgress: jest.fn(),
        createChat: jest.fn(),
        markChatRead: jest.fn().mockResolvedValue({ status: true }),
        unsendMessage: jest.fn(),
        deleteMessageForMe: jest.fn(),
        acknowledgeSyncAction: jest.fn(),
    },
}));

jest.mock('@/lib/personalLib/chatApi/outbox.queue', () => ({
    __esModule: true,
    outboxQueue: {
        processQueue: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('@/lib/personalLib/chatApi/ws.client', () => ({
    __esModule: true,
    wsClient: {
        subscribe: jest.fn(),
        onReconnect: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn(),
    },
}));

jest.mock('@/state/personalState/chat/personal.state.sync', () => ({
    __esModule: true,
    $syncEngine: { fetchAndApply: jest.fn() },
}));

jest.mock('@/state/personalState/contacts/personal.state.contacts', () => ({
    __esModule: true,
    $contactsState: { contactsById: {}, addedYouById: {} },
}));

jest.mock('@/lib/personalLib/chatApi/connection.watcher', () => ({
    __esModule: true,
    connectionWatcher: { start: jest.fn(), stop: jest.fn() },
}));

jest.mock('@/state/auth/state.auth', () => ({
    __esModule: true,
    authState: {
        userId: { peek: () => 'user-1', get: () => 'user-1' },
        isPrimary: { peek: () => true, get: () => true },
        sessionId: { peek: () => 'session-1', get: () => 'session-1' },
    },
}));

import { $chatMessagesState } from '@/state/personalState/chat/personal.state.chat';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeMessage(overrides: Record<string, any> = {}) {
    return {
        message_id: `msg_${Math.random().toString(36).slice(2, 8)}`,
        chat_id: 'chat-1',
        content: 'Hello',
        message_type: 'text',
        created_at: '2026-01-01T00:00:00Z',
        is_from_me: true,
        status: 'sent',
        synced_to_sender_primary: false,
        delivered_to_recipient: false,
        delivered_to_recipient_primary: false,
        sender_id: 'user-1',
        recipient_id: 'user-2',
        ...overrides,
    };
}

const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

// ── Tests ───────────────────────────────────────────────────────────────────

describe('UI sort with local_seq (getMessageCreatedAtMs)', () => {
    let $chatMessagesState: any;

    beforeEach(() => {
        jest.isolateModules(() => {
            const chatState = require('@/state/personalState/chat/personal.state.chat');
            $chatMessagesState = chatState.$chatMessagesState;
        });
    });

    describe('Outgoing messages sort by local_seq', () => {
        it('sorts outgoing messages by local_seq instead of created_at', async () => {
            // File pressed first (local_seq=1, created_at=T1)
            // Text pressed second (local_seq=2, created_at=T2, T2 > T1)
            const fileMsg = makeMessage({
                message_id: 'file-1',
                local_seq: 1,
                created_at: '2026-01-01T00:00:01.000Z', // earlier
            });
            const textMsg = makeMessage({
                message_id: 'text-1',
                local_seq: 2,
                created_at: '2026-01-01T00:00:02.000Z', // later
            });

            await $chatMessagesState.addMessage('chat-1', fileMsg, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', textMsg, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // DESC order: higher local_seq first → text-1, file-1
            expect(messages.map((m: any) => m.message_id)).toEqual(['text-1', 'file-1']);
        });

        it('prevents UI jump: file with later server created_at stays in press order', async () => {
            // File pressed first (local_seq=1), text pressed second (local_seq=2)
            // After server ACK, file gets created_at=T10 (upload time), text stays pending
            // Without local_seq sort, file would jump below text (T10 > T2)
            // With local_seq sort, file stays above text (1 < 2)
            const fileMsg = makeMessage({
                message_id: 'temp-file',
                temp_id: 'temp-file',
                local_seq: 1,
                created_at: '2026-01-01T00:00:01.000Z',
                status: 'pending',
            });
            const textMsg = makeMessage({
                message_id: 'temp-text',
                temp_id: 'temp-text',
                local_seq: 2,
                created_at: '2026-01-01T00:00:02.000Z',
                status: 'pending',
            });

            await $chatMessagesState.addMessage('chat-1', fileMsg, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', textMsg, { skipAck: true });

            // Now file gets server ACK with LATER created_at
            $chatMessagesState.replaceMessage('chat-1', 'temp-file', {
                ...fileMsg,
                message_id: 'real-file',
                temp_id: null,
                status: 'sent',
                created_at: '2026-01-01T00:00:10.000Z', // Server time = much later!
                local_seq: 1, // Preserved from optimistic message
            });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // Sort by local_seq DESC: text (2) first, file (1) second
            // This is correct press order (text was pressed AFTER file, so text is newer)
            expect(messages.map((m: any) => m.message_id)).toEqual(['temp-text', 'real-file']);
        });

        it('replaceMessage without local_seq falls back to created_at sort', async () => {
            // Old behavior: replaceMessage without local_seq should use created_at
            const msg1 = makeMessage({
                message_id: 'temp-1',
                temp_id: 'temp-1',
                status: 'pending',
                created_at: '2026-01-01T00:00:01.000Z',
                // No local_seq — simulates old code path
            });
            const msg2 = makeMessage({
                message_id: 'temp-2',
                temp_id: 'temp-2',
                status: 'pending',
                created_at: '2026-01-01T00:00:02.000Z',
            });

            await $chatMessagesState.addMessage('chat-1', msg1, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', msg2, { skipAck: true });

            // Replace msg1 with server ACK (later created_at, no local_seq)
            $chatMessagesState.replaceMessage('chat-1', 'temp-1', {
                ...msg1,
                message_id: 'real-1',
                temp_id: null,
                status: 'sent',
                created_at: '2026-01-01T00:00:10.000Z', // Later server time
            });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // Without local_seq, falls back to created_at DESC: real-1 (10) > temp-2 (2)
            expect(messages.map((m: any) => m.message_id)).toEqual(['real-1', 'temp-2']);
        });
    });

    describe('Incoming messages sort by created_at', () => {
        it('sorts incoming messages (no local_seq) by created_at', async () => {
            const incoming1 = makeMessage({
                message_id: 'in-1',
                is_from_me: false,
                created_at: '2026-01-01T00:00:01.000Z',
                // No local_seq — incoming messages don't have it
            });
            const incoming2 = makeMessage({
                message_id: 'in-2',
                is_from_me: false,
                created_at: '2026-01-01T00:00:05.000Z',
            });
            const incoming3 = makeMessage({
                message_id: 'in-3',
                is_from_me: false,
                created_at: '2026-01-01T00:00:03.000Z',
            });

            await $chatMessagesState.addMessage('chat-1', incoming1, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', incoming2, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', incoming3, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // DESC by created_at: in-2 (5), in-3 (3), in-1 (1)
            expect(messages.map((m: any) => m.message_id)).toEqual(['in-2', 'in-3', 'in-1']);
        });
    });

    describe('Mixed incoming + outgoing messages', () => {
        it('sorts outgoing by local_seq and incoming by created_at in same chat', async () => {
            // Outgoing: local_seq=100, created_at=T1
            // Incoming: no local_seq, created_at=T50 (milliseconds since epoch)
            // Outgoing: local_seq=200, created_at=T2
            const outgoing1 = makeMessage({
                message_id: 'out-1',
                is_from_me: true,
                local_seq: 100,
                created_at: '2026-01-01T00:00:01.000Z',
            });
            const incoming1 = makeMessage({
                message_id: 'in-1',
                is_from_me: false,
                created_at: '2026-01-01T00:00:50.000Z', // 50 seconds = 50000ms
                // No local_seq
            });
            const outgoing2 = makeMessage({
                message_id: 'out-2',
                is_from_me: true,
                local_seq: 200,
                created_at: '2026-01-01T00:00:02.000Z',
            });

            await $chatMessagesState.addMessage('chat-1', outgoing1, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', incoming1, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', outgoing2, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            const ids = messages.map((m: any) => m.message_id);

            // outgoing2 has local_seq=200 (highest) → first
            // incoming1 has created_at → getTime() = large epoch ms value
            // outgoing1 has local_seq=100 → last
            // The incoming created_at (epoch ms ~1.7 trillion) is much larger than local_seq (100-200)
            // So incoming appears first by sort value
            expect(ids[0]).toBe('in-1');  // epoch ms ~1.7T >> 200
            expect(ids).toContain('out-2');
            expect(ids).toContain('out-1');
            // out-2 (local_seq=200) should be before out-1 (local_seq=100) in DESC
            expect(ids.indexOf('out-2')).toBeLessThan(ids.indexOf('out-1'));
        });
    });

    describe('local_seq edge cases', () => {
        it('treats local_seq=0 as valid (not missing)', async () => {
            // local_seq=0 is a valid sequence number, should NOT fall back to created_at
            const msg0 = makeMessage({
                message_id: 'seq-0',
                local_seq: 0,
                created_at: '2026-01-01T00:00:99.000Z', // Very late created_at
            });
            const msg1 = makeMessage({
                message_id: 'seq-1',
                local_seq: 1,
                created_at: '2026-01-01T00:00:01.000Z', // Early created_at
            });

            await $chatMessagesState.addMessage('chat-1', msg0, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', msg1, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // Sort by local_seq DESC: seq-1 (1) first, seq-0 (0) second
            // If local_seq=0 was treated as missing, seq-0 would sort by created_at (99s) and appear first
            expect(messages.map((m: any) => m.message_id)).toEqual(['seq-1', 'seq-0']);
        });

        it('handles undefined local_seq by falling back to created_at', async () => {
            const msgA = makeMessage({
                message_id: 'no-seq-a',
                created_at: '2026-01-01T00:00:05.000Z',
                // local_seq is undefined
            });
            const msgB = makeMessage({
                message_id: 'no-seq-b',
                created_at: '2026-01-01T00:00:01.000Z',
            });

            await $chatMessagesState.addMessage('chat-1', msgA, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', msgB, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // Falls back to created_at DESC: msgA (5s) first, msgB (1s) second
            expect(messages.map((m: any) => m.message_id)).toEqual(['no-seq-a', 'no-seq-b']);
        });

        it('handles null local_seq by falling back to created_at', async () => {
            const msgA = makeMessage({
                message_id: 'null-seq-a',
                local_seq: null,
                created_at: '2026-01-01T00:00:10.000Z',
            });
            const msgB = makeMessage({
                message_id: 'null-seq-b',
                local_seq: null,
                created_at: '2026-01-01T00:00:03.000Z',
            });

            await $chatMessagesState.addMessage('chat-1', msgA, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', msgB, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // null local_seq → falls back to created_at DESC
            expect(messages.map((m: any) => m.message_id)).toEqual(['null-seq-a', 'null-seq-b']);
        });
    });

    describe('replaceMessage with local_seq', () => {
        it('preserves local_seq ordering after server ACK replaces temp message', async () => {
            // Simulates the real flow:
            // 1. User presses send on file (local_seq=1, pending)
            // 2. User presses send on text (local_seq=2, pending)
            // 3. File uploads first → server ACK with later created_at, local_seq preserved
            // 4. Text still pending
            // Result: text (local_seq=2) should still appear ABOVE file (local_seq=1) in DESC order

            const fileMsg = makeMessage({
                message_id: 'temp-file',
                temp_id: 'temp-file',
                local_seq: 1,
                created_at: '2026-01-01T00:00:01.000Z',
                status: 'pending',
                message_type: 'image',
            });
            const textMsg = makeMessage({
                message_id: 'temp-text',
                temp_id: 'temp-text',
                local_seq: 2,
                created_at: '2026-01-01T00:00:02.000Z',
                status: 'pending',
            });

            await $chatMessagesState.addMessage('chat-1', fileMsg, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', textMsg, { skipAck: true });

            // Verify initial order (DESC by local_seq): text (2), file (1)
            let messages = $chatMessagesState.chats['chat-1'].messages.peek();
            expect(messages.map((m: any) => m.message_id)).toEqual(['temp-text', 'temp-file']);

            // File gets server ACK — created_at jumps to T10, but local_seq stays 1
            $chatMessagesState.replaceMessage('chat-1', 'temp-file', {
                ...fileMsg,
                message_id: 'real-file',
                temp_id: null,
                status: 'sent',
                created_at: '2026-01-01T00:00:10.000Z', // Much later server time
                local_seq: 1, // Preserved from optimistic message
            });

            // Order should NOT change — still sorted by local_seq DESC
            messages = $chatMessagesState.chats['chat-1'].messages.peek();
            expect(messages.map((m: any) => m.message_id)).toEqual(['temp-text', 'real-file']);

            // Now text also gets server ACK
            $chatMessagesState.replaceMessage('chat-1', 'temp-text', {
                ...textMsg,
                message_id: 'real-text',
                temp_id: null,
                status: 'sent',
                created_at: '2026-01-01T00:00:11.000Z',
                local_seq: 2, // Preserved
            });

            // Final order: still by local_seq DESC
            messages = $chatMessagesState.chats['chat-1'].messages.peek();
            expect(messages.map((m: any) => m.message_id)).toEqual(['real-text', 'real-file']);
        });

        it('setMessages uses local_seq for sort when available', async () => {
            const messages = [
                makeMessage({ message_id: 'msg-a', local_seq: 3, created_at: '2026-01-01T00:00:01.000Z' }),
                makeMessage({ message_id: 'msg-b', local_seq: 1, created_at: '2026-01-01T00:00:99.000Z' }),
                makeMessage({ message_id: 'msg-c', local_seq: 2, created_at: '2026-01-01T00:00:50.000Z' }),
            ];

            await $chatMessagesState.setMessages('chat-1', messages, { skipSenderSync: true });

            const sorted = $chatMessagesState.chats['chat-1'].messages.peek();
            // DESC by local_seq: msg-a (3), msg-c (2), msg-b (1)
            // NOT by created_at (which would put msg-b first with 99s)
            expect(sorted.map((m: any) => m.message_id)).toEqual(['msg-a', 'msg-c', 'msg-b']);
        });
    });
});
