/**
 * Tests for the outbox queue's `preparing` status and same-chat blocking logic.
 *
 * When a file message is enqueued, it gets status `preparing` while the file
 * is copied into the app's private directory. During this time, later messages
 * in the SAME chat must NOT upload — they wait until the file is ready.
 *
 * Validates:
 * 1. Earlier `preparing` blocks later same-chat `pending` messages
 * 2. Earlier `pending` before a later `preparing` is NOT blocked
 * 3. Cross-chat: chat A `preparing` does NOT block chat B
 * 4. Copy failure → `failed` status unblocks later same-chat messages
 * 5. Queue resumes correctly after copy completes (preparing → pending)
 * 6. Multiple `preparing` messages in same chat all block until resolved
 */

// ── Deep Mocks (native modules) ─────────────────────────────────────────────

jest.mock('@/lib/constantLib', () => ({
    ApiError: class ApiError extends Error {
        constructor(msg: string) { super(msg); }
    },
}));

jest.mock('@/utils/personalUtils/util.chatMedia', () => ({
    resolveMediaUrls: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/personalUtils/util.chatPreview', () => ({
    getPreviewText: jest.fn().mockReturnValue('preview'),
}));

jest.mock('@/utils/personalUtils/util.chatErrors', () => ({
    getChatErrorMessage: jest.fn().mockReturnValue('Something went wrong.'),
}));

jest.mock('@/lib/personalLib/fileSystem/file.copy', () => ({
    copyFileToPrivateDir: jest.fn().mockResolvedValue({ localUri: 'file://copied' }),
}));

jest.mock('@/lib/personalLib/fileSystem/file.download', () => ({
    DEFAULT_MIME_TYPES: { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/mpeg', file: 'application/octet-stream' },
    FALLBACK_MIME_TYPE: 'application/octet-stream',
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

const mockGetPendingOutboxMessages = jest.fn().mockResolvedValue([]);
const mockUpdateMessageStatus = jest.fn().mockResolvedValue(undefined);
const mockSwapTempIdToRealId = jest.fn().mockResolvedValue(undefined);
const mockInsertMessage = jest.fn().mockResolvedValue(undefined);
const mockGetMediaBlob = jest.fn().mockResolvedValue(null);

jest.mock('@/lib/storage/personalStorage/chat/chat.storage', () => ({
    __esModule: true,
    getPendingOutboxMessages: (...args: any[]) => mockGetPendingOutboxMessages(...args),
    updateMessageStatus: (...args: any[]) => mockUpdateMessageStatus(...args),
    swapTempIdToRealId: (...args: any[]) => mockSwapTempIdToRealId(...args),
    insertMessage: (...args: any[]) => mockInsertMessage(...args),
    getMediaBlob: (...args: any[]) => mockGetMediaBlob(...args),
    insertChats: jest.fn().mockResolvedValue(undefined),
    getChats: jest.fn().mockResolvedValue([]),
    replaceChats: jest.fn().mockResolvedValue(undefined),
    insertMessages: jest.fn().mockResolvedValue(undefined),
    getDeletedMessageIds: jest.fn().mockResolvedValue([]),
    getMessageCountsByChatId: jest.fn().mockResolvedValue({}),
    messageExists: jest.fn().mockResolvedValue(false),
}));

const mockSendMessage = jest.fn().mockResolvedValue({
    message_id: 'real-id',
    chat_id: 'chat-1',
    content: '',
    message_type: 'text',
    created_at: '2026-01-01T00:00:10.000Z',
    recipient_id: 'user-2',
    is_from_me: true,
    delivered_to_recipient: false,
    synced_to_sender_primary: true,
    expires_at: null,
});

jest.mock('@/lib/personalLib/chatApi/chat.transport', () => ({
    __esModule: true,
    ChatTransport: {
        sendMessage: (...args: any[]) => mockSendMessage(...args),
        uploadFileWithProgress: jest.fn().mockResolvedValue({
            message_id: 'real-file-id',
            chat_id: 'chat-1',
            content: '',
            message_type: 'image',
            created_at: '2026-01-01T00:00:10.000Z',
            recipient_id: 'user-2',
            file_id: 'file-1',
            file_name: 'photo.jpg',
            file_size: 1024,
            file_mime_type: 'image/jpeg',
            view_url: null,
            download_url: null,
            file_token_expiry: null,
            expires_at: null,
        }),
        getChats: jest.fn().mockResolvedValue({ chats: [], count: 0 }),
        getUserChats: jest.fn().mockResolvedValue({ chats: [], count: 0 }),
        getMessages: jest.fn().mockResolvedValue({ messages: [], count: 0 }),
        getPendingMessages: jest.fn().mockResolvedValue({ messages: [], count: 0 }),
        acknowledgeDelivery: jest.fn().mockResolvedValue({ acknowledged: true }),
        acknowledgeDeliveryBatch: jest.fn().mockResolvedValue({ acknowledged: true }),
        getFileURL: jest.fn(),
        uploadFile: jest.fn(),
        createChat: jest.fn(),
        markChatRead: jest.fn().mockResolvedValue({ status: true }),
        unsendMessage: jest.fn(),
        deleteMessageForMe: jest.fn(),
        acknowledgeSyncAction: jest.fn(),
        checkEligibility: jest.fn().mockResolvedValue({ allowed: true }),
    },
}));

jest.mock('@/lib/personalLib/chatApi/outbox.queue', () => {
    // We need to test the REAL OutboxQueue, not a mock.
    // So this mock does nothing — we let jest resolve the actual module.
    // Actually, we must NOT mock the outbox queue since it IS the SUT.
    // But jest.mock calls are hoisted. We need a different approach.
    // We'll use jest.requireActual in the test instead.
    throw new Error('outbox.queue should NOT be mocked — use jest.requireActual');
});

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

// E2EE mocks — avoid real crypto + native deps
jest.mock('@/lib/personalLib/e2ee/e2ee.service', () => ({
    createE2EERecipientKeyRefreshPass: () => new Map(),
    encryptOutgoingTextStrict: jest.fn().mockResolvedValue({
        ok: true,
        wire: 'encrypted-wire',
        recipient_e2ee_public_key_used: 'AAAA',
    }),
    prepareOutgoingMediaStrict: jest.fn().mockResolvedValue({
        ok: true,
        media: {
            encryptedUri: 'file://encrypted.enc',
            wrappedKey: 'wrapped-key',
            uploadFileName: 'photo.enc',
            cleanup: jest.fn(),
        },
        recipient_e2ee_public_key_used: 'AAAA',
    }),
    saveUserPublicKey: jest.fn().mockResolvedValue(undefined),
}));

// Must unmock the outbox queue so we can test the real class
jest.unmock('@/lib/personalLib/chatApi/outbox.queue');

import type { LocalMessageEntry } from '@/lib/storage/personalStorage/chat/chat.storage.schema';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeLocalMessage(overrides: Partial<LocalMessageEntry> = {}): LocalMessageEntry {
    return {
        message_id: `msg-${Math.random().toString(36).slice(2, 8)}`,
        chat_id: 'chat-1',
        recipient_id: 'user-2',
        content: 'test',
        message_type: 'text',
        status: 'pending',
        is_from_me: true,
        delivered_to_recipient: false,
        delivered_to_recipient_primary: false,
        synced_to_sender_primary: false,
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: null,
        file_id: null,
        file_name: null,
        file_size: null,
        file_mime_type: null,
        view_url: null,
        download_url: null,
        file_token_expiry: null,
        sender_e2ee_public_key: null,
        recipient_e2ee_public_key_used: null,
        local_uri: null,
        temp_id: null,
        inserted_at: new Date().toISOString(),
        deleted_for_me: 0 as any,
        deleted_for_me_at: null,
        error_message: null,
        error_is_blocking: null,
        retry_count: 0,
        last_retry_at: null,
        progress: null,
        acked_by_server: false,
        local_seq: 0,
        ...overrides,
    } as LocalMessageEntry;
}

const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Outbox preparing / same-chat blocking', () => {
    let outboxQueue: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetPendingOutboxMessages.mockResolvedValue([]);
        mockUpdateMessageStatus.mockResolvedValue(undefined);
        mockSwapTempIdToRealId.mockResolvedValue(undefined);
        mockInsertMessage.mockResolvedValue(undefined);
        mockSendMessage.mockResolvedValue({
            message_id: 'real-' + Math.random().toString(36).slice(2, 8),
            chat_id: 'chat-1',
            content: '',
            message_type: 'text',
            created_at: '2026-01-01T00:00:10.000Z',
            recipient_id: 'user-2',
            is_from_me: true,
            delivered_to_recipient: false,
            synced_to_sender_primary: true,
            expires_at: null,
        });

        // Fresh OutboxQueue instance per test
        jest.isolateModules(() => {
            const mod = require('@/lib/personalLib/chatApi/outbox.queue');
            outboxQueue = mod.outboxQueue;
        });
    });

    // ── Test 1: preparing blocks later same-chat pending ────────────────

    it('earlier preparing message blocks later pending messages in same chat', async () => {
        const fileMsg = makeLocalMessage({
            message_id: 'file-1',
            chat_id: 'chat-A',
            message_type: 'image',
            status: 'preparing',
            inserted_at: '2026-01-01T00:00:01.000Z',
            local_seq: 1,
        });
        const textMsg = makeLocalMessage({
            message_id: 'text-1',
            chat_id: 'chat-A',
            message_type: 'text',
            status: 'pending',
            inserted_at: '2026-01-01T00:00:02.000Z',
            local_seq: 2,
        });

        mockGetPendingOutboxMessages.mockResolvedValue([fileMsg, textMsg]);

        await outboxQueue.processQueue();

        // text-1 should NOT have been processed (sendMessage not called for it)
        // file-1 is preparing, so it's skipped and blocks chat-A
        expect(mockSendMessage).not.toHaveBeenCalled();
        expect(mockUpdateMessageStatus).not.toHaveBeenCalledWith(
            'text-1',
            expect.objectContaining({ status: 'sending' }),
        );
    });

    // ── Test 2: earlier pending before preparing is NOT blocked ───────────

    it('earlier pending message before a later preparing message is NOT blocked', async () => {
        const textMsg = makeLocalMessage({
            message_id: 'text-early',
            chat_id: 'chat-A',
            message_type: 'text',
            status: 'pending',
            inserted_at: '2026-01-01T00:00:01.000Z',
            local_seq: 1,
        });
        const fileMsg = makeLocalMessage({
            message_id: 'file-late',
            chat_id: 'chat-A',
            message_type: 'image',
            status: 'preparing',
            inserted_at: '2026-01-01T00:00:02.000Z',
            local_seq: 2,
        });

        mockGetPendingOutboxMessages.mockResolvedValue([textMsg, fileMsg]);

        await outboxQueue.processQueue();

        // text-early should have been processed (it came BEFORE preparing)
        expect(mockUpdateMessageStatus).toHaveBeenCalledWith(
            'text-early',
            expect.objectContaining({ status: 'sending' }),
        );
        // file-late is preparing → skipped, blocks chat-A (but nothing after it)
    });

    // ── Test 3: cross-chat — preparing does NOT block other chats ────────

    it('preparing in chat A does NOT block pending messages in chat B', async () => {
        const fileMsgA = makeLocalMessage({
            message_id: 'file-A',
            chat_id: 'chat-A',
            message_type: 'image',
            status: 'preparing',
            inserted_at: '2026-01-01T00:00:01.000Z',
            local_seq: 1,
        });
        const textMsgB = makeLocalMessage({
            message_id: 'text-B',
            chat_id: 'chat-B',
            message_type: 'text',
            status: 'pending',
            recipient_id: 'user-3',
            inserted_at: '2026-01-01T00:00:02.000Z',
            local_seq: 2,
        });

        mockGetPendingOutboxMessages.mockResolvedValue([fileMsgA, textMsgB]);

        await outboxQueue.processQueue();

        // text-B should have been processed (different chat)
        expect(mockUpdateMessageStatus).toHaveBeenCalledWith(
            'text-B',
            expect.objectContaining({ status: 'sending' }),
        );
    });

    // ── Test 4: failed copy unblocks later same-chat messages ────────────

    it('failed preparing message (copy failure) does NOT block later same-chat messages', async () => {
        const failedFileMsg = makeLocalMessage({
            message_id: 'file-failed',
            chat_id: 'chat-A',
            message_type: 'image',
            status: 'failed',       // copy failed → terminal
            error_is_blocking: false,
            inserted_at: '2026-01-01T00:00:01.000Z',
            local_seq: 1,
        });
        const textMsg = makeLocalMessage({
            message_id: 'text-after-fail',
            chat_id: 'chat-A',
            message_type: 'text',
            status: 'pending',
            inserted_at: '2026-01-01T00:00:02.000Z',
            local_seq: 2,
        });

        mockGetPendingOutboxMessages.mockResolvedValue([failedFileMsg, textMsg]);

        await outboxQueue.processQueue();

        // text-after-fail should have been processed (failed msg is skipped, not blocking)
        expect(mockUpdateMessageStatus).toHaveBeenCalledWith(
            'text-after-fail',
            expect.objectContaining({ status: 'sending' }),
        );
    });

    // ── Test 5: queue resumes after preparing becomes pending ────────────

    it('queue sends messages in correct order after preparing becomes pending', async () => {
        // First run: file is still preparing
        const fileMsg = makeLocalMessage({
            message_id: 'file-1',
            chat_id: 'chat-A',
            message_type: 'image',
            status: 'preparing',
            inserted_at: '2026-01-01T00:00:01.000Z',
            local_seq: 1,
        });
        const textMsg = makeLocalMessage({
            message_id: 'text-1',
            chat_id: 'chat-A',
            message_type: 'text',
            status: 'pending',
            inserted_at: '2026-01-01T00:00:02.000Z',
            local_seq: 2,
        });

        mockGetPendingOutboxMessages.mockResolvedValue([fileMsg, textMsg]);
        await outboxQueue.processQueue();

        // Nothing sent yet
        expect(mockSendMessage).not.toHaveBeenCalled();

        // Second run: file copy done, now pending
        const fileMsgReady = makeLocalMessage({
            ...fileMsg,
            status: 'pending',
            local_uri: 'file://copied',
        });

        // Return file first, then text (inserted_at order)
        mockGetPendingOutboxMessages.mockResolvedValue([fileMsgReady, textMsg]);

        // Make sendFile work for the image message
        mockSendMessage.mockResolvedValueOnce({
            message_id: 'real-file-1',
            chat_id: 'chat-A',
            content: '',
            message_type: 'image',
            created_at: '2026-01-01T00:00:05.000Z',
            recipient_id: 'user-2',
            file_id: 'file-1',
            file_name: 'photo.jpg',
            file_size: 1024,
            file_mime_type: 'image/jpeg',
            view_url: null,
            download_url: null,
            file_token_expiry: null,
            expires_at: null,
        });

        await outboxQueue.processQueue();

        // Both should have been processed: file first, then text
        const sendingCalls = mockUpdateMessageStatus.mock.calls.filter(
            (c: any[]) => c[1]?.status === 'sending'
        );
        expect(sendingCalls.length).toBe(2);
        expect(sendingCalls[0][0]).toBe('file-1');
        expect(sendingCalls[1][0]).toBe('text-1');
    });

    // ── Test 6: multiple preparing messages in same chat ─────────────────

    it('multiple preparing messages in same chat all block later pending messages', async () => {
        const file1 = makeLocalMessage({
            message_id: 'file-1',
            chat_id: 'chat-A',
            message_type: 'image',
            status: 'preparing',
            inserted_at: '2026-01-01T00:00:01.000Z',
            local_seq: 1,
        });
        const file2 = makeLocalMessage({
            message_id: 'file-2',
            chat_id: 'chat-A',
            message_type: 'video',
            status: 'preparing',
            inserted_at: '2026-01-01T00:00:02.000Z',
            local_seq: 2,
        });
        const textMsg = makeLocalMessage({
            message_id: 'text-1',
            chat_id: 'chat-A',
            message_type: 'text',
            status: 'pending',
            inserted_at: '2026-01-01T00:00:03.000Z',
            local_seq: 3,
        });

        mockGetPendingOutboxMessages.mockResolvedValue([file1, file2, textMsg]);

        await outboxQueue.processQueue();

        // Nothing should be sent — both files are preparing, text is blocked
        expect(mockSendMessage).not.toHaveBeenCalled();
        expect(mockUpdateMessageStatus).not.toHaveBeenCalledWith(
            'text-1',
            expect.objectContaining({ status: 'sending' }),
        );
    });

    // ── Test 7: error status (non-terminal backoff) with preparing ───────

    it('preparing blocks later messages even when earlier error-status messages exist in different chat', async () => {
        const errorMsg = makeLocalMessage({
            message_id: 'error-1',
            chat_id: 'chat-B',
            message_type: 'text',
            status: 'error',
            error_is_blocking: false,
            inserted_at: '2026-01-01T00:00:00.500Z',
            local_seq: 0,
        });
        const fileMsg = makeLocalMessage({
            message_id: 'file-A',
            chat_id: 'chat-A',
            message_type: 'image',
            status: 'preparing',
            inserted_at: '2026-01-01T00:00:01.000Z',
            local_seq: 1,
        });
        const textMsg = makeLocalMessage({
            message_id: 'text-A',
            chat_id: 'chat-A',
            message_type: 'text',
            status: 'pending',
            inserted_at: '2026-01-01T00:00:02.000Z',
            local_seq: 2,
        });

        mockGetPendingOutboxMessages.mockResolvedValue([errorMsg, fileMsg, textMsg]);

        await outboxQueue.processQueue();

        // error-1 is skipped (error status)
        // file-A is preparing → blocks chat-A
        // text-A is blocked by preparing file-A
        expect(mockSendMessage).not.toHaveBeenCalled();
    });

    // ── Test 8: enqueueFileMessage inserts row as preparing ──────────────

    it('enqueueFileMessage inserts row with preparing status immediately', async () => {
        // We need to check that addMessage is called with status: 'preparing'
        // The outbox queue calls $chatMessagesState.addMessage which we need to track

        // For this test, we mock the state layer to capture the addMessage call
        const addedMessages: any[] = [];
        const mockAddMessage = jest.fn().mockImplementation(async (_chatId: string, msg: any) => {
            addedMessages.push({ ...msg });
        });

        jest.isolateModules(() => {
            // Override the state mock for this specific test
            jest.doMock('@/state/personalState/chat/personal.state.chat', () => ({
                $chatMessagesState: {
                    chats: {},
                    addMessage: mockAddMessage,
                    replaceMessage: jest.fn(),
                    updateMessageStatus: jest.fn(),
                    setError: jest.fn(),
                },
                $chatListState: {
                    chatsById: {},
                    upsertChat: jest.fn(),
                },
            }));

            // Re-require the outbox queue with the new mocks
            const mod = require('@/lib/personalLib/chatApi/outbox.queue');
            const queue = mod.outboxQueue;

            // Don't await — let it run in background (copyFileToPrivateDir is async)
            const promise = queue.enqueueFileMessage({
                chatId: 'chat-A',
                recipientId: 'user-2',
                asset: { uri: 'file://photo.jpg', size: 1024, name: 'photo.jpg', mimeType: 'image/jpeg' },
                messageType: 'image',
            });

            // The addMessage should be called synchronously with preparing status
            // before the copy starts
            expect(mockAddMessage).toHaveBeenCalledTimes(1);
            const addedMsg = mockAddMessage.mock.calls[0][1];
            expect(addedMsg.status).toBe('preparing');
            expect(addedMsg.message_type).toBe('image');
            expect(addedMsg.chat_id).toBe('chat-A');

            // Now let the copy finish
            return promise;
        });
    });

    // ── Test 9: empty queue does nothing ─────────────────────────────────

    it('empty queue does nothing', async () => {
        mockGetPendingOutboxMessages.mockResolvedValue([]);
        await outboxQueue.processQueue();

        expect(mockSendMessage).not.toHaveBeenCalled();
        expect(mockUpdateMessageStatus).not.toHaveBeenCalled();
    });

    // ── Test 10: paused queue does nothing ───────────────────────────────

    it('paused queue does not process messages', async () => {
        const textMsg = makeLocalMessage({
            message_id: 'text-1',
            chat_id: 'chat-A',
            message_type: 'text',
            status: 'pending',
        });
        mockGetPendingOutboxMessages.mockResolvedValue([textMsg]);

        outboxQueue.pause();
        await outboxQueue.processQueue();

        expect(mockSendMessage).not.toHaveBeenCalled();
        expect(mockGetPendingOutboxMessages).not.toHaveBeenCalled();
    });

    // ── Test 11: promoteTempMessage preserves local_seq from optimistic message ──

    it('promoteTempMessage preserves local_seq from optimistic message to prevent UI jump', async () => {
        // This test verifies the fix for the UI jump bug:
        // When a message is sent, the optimistic message has local_seq = 42.
        // After server ACK, the replacement message must preserve local_seq = 42.
        // Without this, sort falls back to server created_at (which can be later
        // than a subsequent pending message's local_seq), causing the first message
        // to jump below the second after send.

        const optimisticMsg = makeLocalMessage({
            message_id: 'temp-text-1',
            chat_id: 'chat-A',
            message_type: 'text',
            content: 'hello',
            status: 'pending',
            local_seq: 42,  // ← pressed first, has local_seq
        });

        // Server response has NO local_seq and a later created_at
        mockSendMessage.mockResolvedValueOnce({
            message_id: 'real-text-1',
            chat_id: 'chat-A',
            content: 'hello',
            message_type: 'text',
            created_at: '2026-01-01T00:00:10.000Z',
            recipient_id: 'user-2',
            is_from_me: true,
            delivered_to_recipient: false,
            synced_to_sender_primary: true,
            expires_at: null,
        });

        mockGetPendingOutboxMessages.mockResolvedValue([optimisticMsg]);

        await outboxQueue.processQueue();

        // insertMessage is called by promoteTempMessage with the resolved entry.
        // The resolved entry MUST preserve local_seq from the optimistic message.
        expect(mockInsertMessage).toHaveBeenCalled();
        const insertedMsg = mockInsertMessage.mock.calls[0][0];
        expect(insertedMsg.local_seq).toBe(42);  // ← preserved from optimistic message
        expect(insertedMsg.message_id).toBe('real-text-1');  // ← server ID
        expect(insertedMsg.status).toBe('sent');
    });
});
