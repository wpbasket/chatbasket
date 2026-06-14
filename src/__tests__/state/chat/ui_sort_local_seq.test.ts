/**
 * Tests for the UI sort function getMessageCreatedAtMs / sortMessagesByLocalCreatedAtDesc.
 *
 * Sort logic (after fix):
 *   1. Primary key: server `created_at` (epoch ms) — same scale for ALL messages
 *   2. Tie-breaker: `local_seq` (monotonic local counter) — only when two
 *      messages share the exact same millisecond
 *
 * Verifies:
 *   - Outgoing and incoming sort by the SAME field (created_at) — no scale mixing
 *   - Mixed incoming + outgoing chat sorts in real chronological order
 *   - local_seq breaks ties only when created_at collides
 *   - local_seq=0 is a valid value (not "missing")
 *   - Replaces from server ACK do not cause jumps
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

// ── Tests ───────────────────────────────────────────────────────────────────

describe('UI sort by created_at (with local_seq tie-breaker)', () => {
    let $chatMessagesState: any;

    beforeEach(() => {
        jest.isolateModules(() => {
            const chatState = require('@/state/personalState/chat/personal.state.chat');
            $chatMessagesState = chatState.$chatMessagesState;
        });
    });

    describe('All messages sort by created_at (same scale)', () => {
        it('sorts outgoing messages by created_at, not local_seq', async () => {
            // File pressed first (local_seq=1, created_at=T1)
            // Text pressed second (local_seq=2, created_at=T2, T2 > T1)
            const fileMsg = makeMessage({
                message_id: 'file-1',
                local_seq: 1,
                created_at: '2026-01-01T00:00:01.000Z',
            });
            const textMsg = makeMessage({
                message_id: 'text-1',
                local_seq: 2,
                created_at: '2026-01-01T00:00:02.000Z',
            });

            await $chatMessagesState.addMessage('chat-1', fileMsg, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', textMsg, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // DESC by created_at: text-1 (T2) first, file-1 (T1) second
            expect(messages.map((m: any) => m.message_id)).toEqual(['text-1', 'file-1']);
        });

        it('outgoing with later created_at appears above outgoing with earlier created_at, regardless of local_seq', async () => {
            // local_seq order ≠ chronological order, but sort must use created_at
            const oldMsg = makeMessage({
                message_id: 'old',
                local_seq: 100, // higher local_seq
                created_at: '2026-01-01T00:00:01.000Z', // 1 second
            });
            const newMsg = makeMessage({
                message_id: 'new',
                local_seq: 50, // lower local_seq
                created_at: '2026-01-01T00:01:39.000Z', // 99 seconds (1 min 39 s)
            });

            await $chatMessagesState.addMessage('chat-1', oldMsg, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', newMsg, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // DESC by created_at: new (99s) first, old (1s) second
            expect(messages.map((m: any) => m.message_id)).toEqual(['new', 'old']);
        });
    });

    describe('Mixed incoming + outgoing messages', () => {
        it('sorts mixed incoming and outgoing in real chronological order (the reported bug)', async () => {
            // This reproduces the EXACT scenario from the user's screenshot:
            //   User 1 → User 2: hi (outgoing)
            //   User 2 → User 1: hello (incoming)
            //   User 1 → User 2: asap (outgoing)
            //   User 2 → User 1: meet (incoming)
            //
            // The OLD buggy sort put all incoming (epoch ms) above all outgoing (local_seq).
            // The NEW sort must put them in real chronological order.
            const hi = makeMessage({
                message_id: 'hi',
                is_from_me: true,
                local_seq: 1,
                created_at: '2026-01-01T11:14:00.000Z', // 11:14
            });
            const hello = makeMessage({
                message_id: 'hello',
                is_from_me: false,
                // No local_seq for incoming
                created_at: '2026-01-01T11:14:30.000Z', // 11:14:30
            });
            const asap = makeMessage({
                message_id: 'asap',
                is_from_me: true,
                local_seq: 2,
                created_at: '2026-01-01T11:15:00.000Z', // 11:15
            });
            const meet = makeMessage({
                message_id: 'meet',
                is_from_me: false,
                created_at: '2026-01-01T11:15:30.000Z', // 11:15:30
            });

            await $chatMessagesState.addMessage('chat-1', hi, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', hello, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', asap, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', meet, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // Expected real chronological order (DESC = newest first):
            //   meet (11:15:30), asap (11:15), hello (11:14:30), hi (11:14)
            expect(messages.map((m: any) => m.message_id)).toEqual(['meet', 'asap', 'hello', 'hi']);
        });

        it('does not let incoming messages always sort above outgoing (the original bug)', async () => {
            // Old behavior bug: incoming created_at = epoch ms (~1.7T), outgoing local_seq = 1
            // → incoming ALWAYS appeared above outgoing
            // New behavior: both sort by created_at → no scale mixing
            const outgoing = makeMessage({
                message_id: 'outgoing',
                is_from_me: true,
                local_seq: 1,
                created_at: '2026-01-01T12:00:00.000Z', // noon
            });
            const incoming = makeMessage({
                message_id: 'incoming',
                is_from_me: false,
                created_at: '2026-01-01T11:00:00.000Z', // 11am (earlier)
            });

            await $chatMessagesState.addMessage('chat-1', outgoing, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', incoming, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // Outgoing (noon) above incoming (11am) — no longer the inverted bug
            expect(messages.map((m: any) => m.message_id)).toEqual(['outgoing', 'incoming']);
        });
    });

    describe('local_seq tie-breaker for same-millisecond messages', () => {
        it('uses local_seq as tie-breaker when two messages have identical created_at', async () => {
            // Both messages have the EXACT same created_at (same millisecond)
            const first = makeMessage({
                message_id: 'first',
                local_seq: 10,
                created_at: '2026-01-01T12:00:00.000Z',
            });
            const second = makeMessage({
                message_id: 'second',
                local_seq: 20, // higher local_seq = pressed later
                created_at: '2026-01-01T12:00:00.000Z',
            });

            await $chatMessagesState.addMessage('chat-1', first, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', second, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // Same created_at → tie-breaker local_seq DESC: second (20) first
            expect(messages.map((m: any) => m.message_id)).toEqual(['second', 'first']);
        });

        it('tie-breaker: messages without local_seq (incoming) get value 0', async () => {
            // Two incoming messages with identical created_at — both have local_seq undefined
            // Tie-breaker is 0 for both → sort is stable but order is JS engine dependent.
            // The KEY assertion: they do NOT jump above outgoing messages of a different timestamp.
            const outgoing = makeMessage({
                message_id: 'outgoing',
                is_from_me: true,
                local_seq: 5,
                created_at: '2026-01-01T12:00:00.000Z', // Same as incoming
            });
            const incomingA = makeMessage({
                message_id: 'incoming-a',
                is_from_me: false,
                created_at: '2026-01-01T12:00:00.000Z', // Same timestamp
            });

            await $chatMessagesState.addMessage('chat-1', outgoing, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', incomingA, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // Same created_at → tie-break: outgoing (local_seq=5) above incoming (local_seq=0)
            expect(messages.map((m: any) => m.message_id)).toEqual(['outgoing', 'incoming-a']);
        });

        it('treats local_seq=0 as a valid value in tie-breaker (not missing)', async () => {
            const seq0 = makeMessage({
                message_id: 'seq-0',
                local_seq: 0,
                created_at: '2026-01-01T12:00:00.000Z',
            });
            const seq1 = makeMessage({
                message_id: 'seq-1',
                local_seq: 1,
                created_at: '2026-01-01T12:00:00.000Z',
            });

            await $chatMessagesState.addMessage('chat-1', seq0, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', seq1, { skipAck: true });

            const messages = $chatMessagesState.chats['chat-1'].messages.peek();
            // Same created_at → tie-break: seq-1 (1) above seq-0 (0)
            expect(messages.map((m: any) => m.message_id)).toEqual(['seq-1', 'seq-0']);
        });
    });

    describe('replaceMessage does not cause jump', () => {
        it('server ACK with later created_at puts message in correct chronological position', async () => {
            // The "preparing" / queue blocking fix ensures server created_at is in
            // correct chronological order. So after server ACK, no UI jump.
            const fileMsg = makeMessage({
                message_id: 'temp-file',
                temp_id: 'temp-file',
                local_seq: 1,
                created_at: '2026-01-01T12:00:00.000Z', // Press time
                status: 'pending',
            });
            const textMsg = makeMessage({
                message_id: 'temp-text',
                temp_id: 'temp-text',
                local_seq: 2,
                created_at: '2026-01-01T12:00:01.000Z', // Pressed 1s after file
                status: 'pending',
            });

            await $chatMessagesState.addMessage('chat-1', fileMsg, { skipAck: true });
            await $chatMessagesState.addMessage('chat-1', textMsg, { skipAck: true });

            // Initial order: text (T+1s) above file (T+0s)
            let messages = $chatMessagesState.chats['chat-1'].messages.peek();
            expect(messages.map((m: any) => m.message_id)).toEqual(['temp-text', 'temp-file']);

            // File uploads first (queue blocked text). Server returns correct chronological created_at.
            $chatMessagesState.replaceMessage('chat-1', 'temp-file', {
                ...fileMsg,
                message_id: 'real-file',
                temp_id: null,
                status: 'sent',
                created_at: '2026-01-01T12:00:00.500Z', // Server time, still BEFORE text
                local_seq: 1,
            });

            // Order should be UNCHANGED — server created_at preserves chronology
            messages = $chatMessagesState.chats['chat-1'].messages.peek();
            expect(messages.map((m: any) => m.message_id)).toEqual(['temp-text', 'real-file']);
        });

        it('setMessages uses created_at for sort (local_seq only as tie-breaker)', async () => {
            const messages = [
                makeMessage({ message_id: 'msg-a', local_seq: 3, created_at: '2026-01-01T00:00:01.000Z' }),
                makeMessage({ message_id: 'msg-b', local_seq: 1, created_at: '2026-01-01T00:01:39.000Z' }), // 99 s
                makeMessage({ message_id: 'msg-c', local_seq: 2, created_at: '2026-01-01T00:00:50.000Z' }), // 50 s
            ];

            await $chatMessagesState.setMessages('chat-1', messages, { skipSenderSync: true });

            const sorted = $chatMessagesState.chats['chat-1'].messages.peek();
            // DESC by created_at: msg-b (99s), msg-c (50s), msg-a (1s)
            // local_seq values are DIFFERENT timestamps, so local_seq is not used
            expect(sorted.map((m: any) => m.message_id)).toEqual(['msg-b', 'msg-c', 'msg-a']);
        });
    });
});
