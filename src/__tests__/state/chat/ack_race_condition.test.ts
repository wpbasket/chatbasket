/**
 * Tests for the ACK race condition fix in syncPendingMessages.
 *
 * Validates:
 * 1. syncPendingMessages holds isSyncingPending until ACK completes (await fix)
 * 2. Second concurrent syncPendingMessages call is blocked by the guard
 * 3. After ACK completes, a new syncPendingMessages can run normally
 * 4. No double-ACK when called sequentially with empty queue
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

const mockAckDelivery = jest.fn().mockResolvedValue({ acknowledged: true });
const mockAckDeliveryBatch = jest.fn().mockResolvedValue({ acknowledged: true });
const mockGetPendingMessages = jest.fn();

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
        getPendingMessages: (...args: any[]) => mockGetPendingMessages(...args),
        acknowledgeDelivery: (...args: any[]) => mockAckDelivery(...args),
        acknowledgeDeliveryBatch: (...args: any[]) => mockAckDeliveryBatch(...args),
        getFileURL: jest.fn(),
        uploadFile: jest.fn(),
        uploadFileWithProgress: jest.fn(),
        createChat: jest.fn(),
        markChatRead: jest.fn(),
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

/** Flush microtask queue + timers */
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

// ── Tests ───────────────────────────────────────────────────────────────────

describe('syncPendingMessages ACK race condition', () => {
    let $chatMessagesState: any;

    beforeEach(() => {
        mockGetPendingMessages.mockReset();
        mockAckDelivery.mockReset();
        // isolateModules ensures a fresh copy of the module for each test,
        // which resets the internal isSyncingPending flag.
        jest.isolateModules(() => {
            $chatMessagesState = require('@/state/personalState/chat/personal.state.chat').$chatMessagesState;
        });
    });

    it('holds isSyncingPending lock until ACK fully completes', async () => {
        const msg1 = makeMessage({ message_id: 'msg-1' });
        const msg2 = makeMessage({ message_id: 'msg-2' });

        mockGetPendingMessages.mockResolvedValueOnce({
            messages: [msg1, msg2],
            count: 2,
        });

        let ackResolve1: (val: any) => void;
        let ackResolve2: (val: any) => void;
        mockAckDelivery
            .mockImplementationOnce(() => new Promise<any>(r => { ackResolve1 = r; }))
            .mockImplementationOnce(() => new Promise<any>(r => { ackResolve2 = r; }));

        const sync1 = $chatMessagesState.syncPendingMessages();
        await tick(50);

        mockGetPendingMessages.mockResolvedValueOnce({
            messages: [msg1, msg2],
            count: 2,
        });
        const sync2Promise = $chatMessagesState.syncPendingMessages();
        await sync2Promise;

        expect(mockGetPendingMessages).toHaveBeenCalledTimes(1);

        ackResolve1!({ acknowledged: true });
        await tick(10);
        ackResolve2!({ acknowledged: true });
        await sync1;

        expect(mockAckDelivery).toHaveBeenCalledTimes(2);
    });

    it('allows new sync after previous one fully completes', async () => {
        mockGetPendingMessages.mockResolvedValueOnce({
            messages: [makeMessage({ message_id: 'msg-r1' })],
            count: 1,
        });
        mockAckDelivery.mockResolvedValueOnce({ acknowledged: true });
        await $chatMessagesState.syncPendingMessages();

        mockGetPendingMessages.mockResolvedValueOnce({
            messages: [makeMessage({ message_id: 'msg-r2' })],
            count: 1,
        });
        mockAckDelivery.mockResolvedValueOnce({ acknowledged: true });
        await $chatMessagesState.syncPendingMessages();

        expect(mockGetPendingMessages).toHaveBeenCalledTimes(2);
        expect(mockAckDelivery).toHaveBeenCalledTimes(2);
    });

    it('does not ACK when second sync finds empty queue', async () => {
        mockGetPendingMessages.mockResolvedValueOnce({
            messages: [makeMessage({ message_id: 'msg-once' })],
            count: 1,
        });
        mockAckDelivery.mockResolvedValueOnce({ acknowledged: true });
        await $chatMessagesState.syncPendingMessages();

        mockGetPendingMessages.mockResolvedValueOnce({
            messages: [],
            count: 0,
        });
        await $chatMessagesState.syncPendingMessages();

        // ACK only called once
        expect(mockAckDelivery).toHaveBeenCalledTimes(1);
    });
});
