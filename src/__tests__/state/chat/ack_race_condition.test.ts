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

const mockDownloadIncomingFile = jest.fn().mockResolvedValue(null);
jest.mock('@/lib/personalLib/fileSystem/file.download', () => ({
    downloadIncomingFile: (...args: any[]) => mockDownloadIncomingFile(...args),
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
const mockMarkChatRead = jest.fn().mockResolvedValue({ status: true });

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
        markChatRead: (...args: any[]) => mockMarkChatRead(...args),
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

/** Flush microtask queue + timers */
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

// ── Tests ───────────────────────────────────────────────────────────────────

describe('syncPendingMessages ACK race condition', () => {
    let $chatMessagesState: any;
    let $chatListState: any;
    let ackIncomingMessages: any;
    let routeWSEvent: any;

    beforeEach(() => {
        mockGetPendingMessages.mockReset();
        mockAckDelivery.mockReset();
        mockAckDeliveryBatch.mockReset();
        mockMarkChatRead.mockReset();
        mockDownloadIncomingFile.mockReset();
        mockAckDelivery.mockResolvedValue({ acknowledged: true });
        mockAckDeliveryBatch.mockResolvedValue({ acknowledged: true });
        mockMarkChatRead.mockResolvedValue({ status: true });
        mockDownloadIncomingFile.mockResolvedValue(null);
        // isolateModules ensures a fresh copy of the module for each test,
        // which resets the internal isSyncingPending flag.
        jest.isolateModules(() => {
            const chatState = require('@/state/personalState/chat/personal.state.chat');
            $chatMessagesState = chatState.$chatMessagesState;
            $chatListState = chatState.$chatListState;
            ackIncomingMessages = chatState.ackIncomingMessages;
            routeWSEvent = require('@/state/personalState/chat/ws.event.bridge').routeWSEvent;
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

    it('does not delivery-ACK visible incoming media until local_uri exists', async () => {
        const media = makeMessage({
            message_id: 'msg-media-pending',
            is_from_me: false,
            message_type: 'video',
            file_id: 'file-1',
            download_url: 'https://files.local/video.mp4',
            local_uri: null,
            sender_id: 'user-2',
            recipient_id: 'user-1',
        });

        mockGetPendingMessages.mockResolvedValueOnce({ messages: [media], count: 1 });
        mockDownloadIncomingFile.mockResolvedValueOnce(null);

        await $chatMessagesState.syncPendingMessages();

        expect(mockAckDeliveryBatch).not.toHaveBeenCalled();
        expect(mockAckDelivery).not.toHaveBeenCalled();
    });

    it('delivery-ACKs successful messages while media download remains pending', async () => {
        const text = makeMessage({
            message_id: 'msg-text-ready',
            is_from_me: false,
            sender_id: 'user-2',
            recipient_id: 'user-1',
        });
        const media = makeMessage({
            message_id: 'msg-media-slow',
            is_from_me: false,
            message_type: 'video',
            file_id: 'file-1',
            download_url: 'https://files.local/video.mp4',
            local_uri: null,
            sender_id: 'user-2',
            recipient_id: 'user-1',
        });

        let finishDownload!: (uri: string) => void;
        mockGetPendingMessages.mockResolvedValueOnce({ messages: [text, media], count: 2 });
        mockDownloadIncomingFile.mockImplementationOnce(() => new Promise(resolve => {
            finishDownload = resolve as (uri: string) => void;
        }));

        const sync = $chatMessagesState.syncPendingMessages();
        await tick(50);

        expect(mockAckDeliveryBatch).toHaveBeenCalledTimes(1);
        expect(mockAckDeliveryBatch).toHaveBeenNthCalledWith(1, {
            message_ids: ['msg-text-ready'],
            acknowledged_by: 'recipient',
            success: true,
        });

        finishDownload('idb://video.mp4');
        await sync;

        expect(mockAckDeliveryBatch).toHaveBeenCalledWith({
            message_ids: ['msg-media-slow'],
            acknowledged_by: 'recipient',
            success: true,
        });
    });

    it('direct delivery ACK guard blocks unresolved media with file_id but no download_url', async () => {
        const media = makeMessage({
            message_id: 'msg-media-unresolved',
            is_from_me: false,
            message_type: 'video',
            file_id: 'file-1',
            download_url: null,
            local_uri: null,
            sender_id: 'user-2',
            recipient_id: 'user-1',
        });

        await ackIncomingMessages([media]);

        expect(mockAckDeliveryBatch).not.toHaveBeenCalled();
        expect(mockAckDelivery).not.toHaveBeenCalled();
    });

    it('mark_read still fires while unresolved media is pending', async () => {
        const media = makeMessage({
            message_id: 'msg-media-unread',
            is_from_me: false,
            message_type: 'video',
            file_id: 'file-1',
            download_url: null,
            local_uri: null,
            sender_id: 'user-2',
            recipient_id: 'user-1',
        });

        $chatMessagesState.setActiveChatId('chat-1');
        await $chatMessagesState.addMessage('chat-1', media, { skipAck: true });
        $chatMessagesState.debouncedMarkRead('chat-1');
        await tick(1100);

        expect(mockMarkChatRead).toHaveBeenCalledWith({ chat_id: 'chat-1' });

        $chatMessagesState.setActiveChatId(null);
        await tick(1100);
    });


    it('mark_read still fires after quick open then back', async () => {
        $chatMessagesState.setActiveChatId('chat-1');
        $chatMessagesState.debouncedMarkRead('chat-1');
        $chatMessagesState.setActiveChatId(null);

        await tick(1100);

        expect(mockMarkChatRead).toHaveBeenCalledWith({ chat_id: 'chat-1' });
    });

    it('delivery ACK does not downgrade read chat preview to delivered', () => {
        $chatListState.upsertChat({
            chat_id: 'chat-1',
            last_message_id: 'msg-read',
            last_message_status: 'read',
            last_message_is_from_me: true,
            last_message_created_at: '2026-01-01T00:00:00Z',
        });

        $chatMessagesState.markMessagesDelivered('chat-1', ['msg-read']);

        expect($chatListState.chatsById['chat-1'].last_message_status.peek()).toBe('read');
    });

    it('read receipt before delivery keeps sender single tick until delivery ACK arrives', async () => {
        const msg = makeMessage({
            message_id: 'msg-read-before-delivery',
            is_from_me: true,
            status: 'sent',
            delivered_to_recipient: false,
            created_at: '2026-01-01T00:00:00Z',
        });

        $chatListState.upsertChat({
            chat_id: 'chat-1',
            last_message_id: msg.message_id,
            last_message_status: 'sent',
            last_message_is_from_me: true,
            last_message_created_at: msg.created_at,
        });
        await $chatMessagesState.addMessage('chat-1', msg, { skipAck: true });

        $chatMessagesState.markMessagesReadUpTo('chat-1', '2026-01-01T00:00:01Z');

        expect($chatMessagesState.chats['chat-1'].messagesById[msg.message_id].status.peek()).toBe('sent');
        expect($chatMessagesState.chats['chat-1'].messagesById[msg.message_id].delivered_to_recipient.peek()).toBe(false);
        expect($chatListState.chatsById['chat-1'].last_message_status.peek()).toBe('sent');

        $chatMessagesState.markMessagesDelivered('chat-1', [msg.message_id]);

        expect($chatMessagesState.chats['chat-1'].messagesById[msg.message_id].delivered_to_recipient.peek()).toBe(true);
        expect($chatMessagesState.chats['chat-1'].messagesById[msg.message_id].status.peek()).toBe('read');
        expect($chatListState.chatsById['chat-1'].last_message_status.peek()).toBe('read');
    });

    it('WS delivery_ack with message_ids only delivers those ids even when delivered_at covers newer pending messages', async () => {
        const acked = makeMessage({
            message_id: 'msg-acked-only',
            is_from_me: true,
            status: 'sent',
            delivered_to_recipient: false,
            created_at: '2026-01-01T00:00:00.000Z',
        });
        const pending = makeMessage({
            message_id: 'msg-still-pending',
            is_from_me: true,
            status: 'pending',
            delivered_to_recipient: false,
            created_at: '2026-01-01T00:00:01.000Z',
        });

        $chatListState.upsertChat({
            chat_id: 'chat-1',
            last_message_id: pending.message_id,
            last_message_status: 'pending',
            last_message_is_from_me: true,
            last_message_created_at: pending.created_at,
        });
        await $chatMessagesState.addMessage('chat-1', acked, { skipAck: true });
        await $chatMessagesState.addMessage('chat-1', pending, { skipAck: true });

        $chatMessagesState.markMessagesReadUpTo('chat-1', '2026-01-01T00:00:02.000Z');

        routeWSEvent({
            type: 'delivery_ack',
            payload: {
                chat_id: 'chat-1',
                message_ids: [acked.message_id],
                delivered_at: '2026-01-01T00:00:03.000Z',
            },
        });

        expect($chatMessagesState.chats['chat-1'].messagesById[acked.message_id].delivered_to_recipient.peek()).toBe(true);
        expect($chatMessagesState.chats['chat-1'].messagesById[acked.message_id].status.peek()).toBe('read');
        expect($chatMessagesState.chats['chat-1'].messagesById[pending.message_id].delivered_to_recipient.peek()).toBe(false);
        expect($chatMessagesState.chats['chat-1'].messagesById[pending.message_id].status.peek()).toBe('pending');
        expect($chatListState.chatsById['chat-1'].last_message_status.peek()).toBe('pending');
    });

    it('replaceMessage uses server created_at for ordering when uploads finish', async () => {
        const videoTemp = makeMessage({
            message_id: 'temp-video',
            temp_id: 'temp-video',
            is_from_me: true,
            message_type: 'video',
            status: 'pending',
            created_at: '2026-01-01T00:00:00.000Z',
            local_uri: 'file://video.mp4',
        });
        const audioTemp = makeMessage({
            message_id: 'temp-audio',
            temp_id: 'temp-audio',
            is_from_me: true,
            message_type: 'audio',
            status: 'pending',
            created_at: '2026-01-01T00:00:01.000Z',
            local_uri: 'file://audio.m4a',
        });

        await $chatMessagesState.addMessage('chat-1', videoTemp, { skipAck: true });
        await $chatMessagesState.addMessage('chat-1', audioTemp, { skipAck: true });

        expect($chatMessagesState.chats['chat-1'].messages.peek().map((m: any) => m.message_id)).toEqual([
            'temp-audio',
            'temp-video',
        ]);

        $chatMessagesState.replaceMessage('chat-1', 'temp-video', {
            ...videoTemp,
            message_id: 'real-video',
            temp_id: null,
            status: 'sent',
            created_at: '2026-01-01T00:00:05.000Z',
        });

        const messages = $chatMessagesState.chats['chat-1'].messages.peek();
        expect(messages.map((m: any) => m.message_id)).toEqual([
            'real-video',
            'temp-audio',
        ]);
        expect(messages[0].created_at).toBe('2026-01-01T00:00:05.000Z');
    });

    it('replaceMessage updates selectedMessageIds when temp ID is swapped', async () => {
        const tempMsg = makeMessage({
            message_id: 'temp-123',
            temp_id: 'temp-123',
            is_from_me: true,
            message_type: 'text',
            status: 'pending',
            content: 'Hello',
        });

        await $chatMessagesState.addMessage('chat-1', tempMsg, { skipAck: true });

        // Select the pending message
        $chatMessagesState.toggleSelectMode('chat-1', true);
        $chatMessagesState.toggleMessageSelection('chat-1', 'temp-123');

        expect($chatMessagesState.chats['chat-1'].selectedMessageIds.peek()).toEqual(['temp-123']);

        // Replace temp with real message
        $chatMessagesState.replaceMessage('chat-1', 'temp-123', {
            ...tempMsg,
            message_id: 'real-456',
            temp_id: null,
            status: 'sent',
        });

        // selectedMessageIds should now have the real ID
        expect($chatMessagesState.chats['chat-1'].selectedMessageIds.peek()).toEqual(['real-456']);
    });

    it('replaceMessage does not affect selectedMessageIds when temp ID was not selected', async () => {
        const tempMsg = makeMessage({
            message_id: 'temp-789',
            temp_id: 'temp-789',
            is_from_me: true,
            message_type: 'text',
            status: 'pending',
            content: 'World',
        });

        await $chatMessagesState.addMessage('chat-1', tempMsg, { skipAck: true });

        // Select a different message
        $chatMessagesState.toggleSelectMode('chat-1', true);
        $chatMessagesState.toggleMessageSelection('chat-1', 'other-msg');

        expect($chatMessagesState.chats['chat-1'].selectedMessageIds.peek()).toEqual(['other-msg']);

        // Replace temp with real message
        $chatMessagesState.replaceMessage('chat-1', 'temp-789', {
            ...tempMsg,
            message_id: 'real-999',
            temp_id: null,
            status: 'sent',
        });

        // selectedMessageIds should be unchanged
        expect($chatMessagesState.chats['chat-1'].selectedMessageIds.peek()).toEqual(['other-msg']);
    });

    it('uses server created_at order for outgoing messages after promotion and sync', async () => {
        const textTemp = makeMessage({
            message_id: 'temp-text',
            temp_id: 'temp-text',
            is_from_me: true,
            message_type: 'text',
            status: 'pending',
            created_at: '2026-01-01T00:00:00.000Z',
        });
        const videoTemp = makeMessage({
            message_id: 'temp-video',
            temp_id: 'temp-video',
            is_from_me: true,
            message_type: 'video',
            status: 'pending',
            created_at: '2026-01-01T00:00:01.000Z',
            local_uri: 'file://video.mp4',
        });
        const audioTemp = makeMessage({
            message_id: 'temp-audio',
            temp_id: 'temp-audio',
            is_from_me: true,
            message_type: 'audio',
            status: 'pending',
            created_at: '2026-01-01T00:00:02.000Z',
            local_uri: 'file://audio.m4a',
        });

        await $chatMessagesState.addMessage('chat-1', videoTemp, { skipAck: true });
        await $chatMessagesState.addMessage('chat-1', audioTemp, { skipAck: true });
        await $chatMessagesState.addMessage('chat-1', textTemp, { skipAck: true });

        expect($chatMessagesState.chats['chat-1'].messages.peek().map((m: any) => m.message_id)).toEqual([
            'temp-audio',
            'temp-video',
            'temp-text',
        ]);

        // After promotion, messages use server created_at (not local)
        $chatMessagesState.replaceMessage('chat-1', 'temp-video', {
            ...videoTemp,
            message_id: 'real-video',
            temp_id: null,
            status: 'sent',
            created_at: '2026-01-01T00:00:10.000Z', // Server time
        });
        $chatMessagesState.replaceMessage('chat-1', 'temp-text', {
            ...textTemp,
            message_id: 'real-text',
            temp_id: null,
            status: 'sent',
            created_at: '2026-01-01T00:00:12.000Z', // Server time (latest)
        });
        $chatMessagesState.replaceMessage('chat-1', 'temp-audio', {
            ...audioTemp,
            message_id: 'real-audio',
            temp_id: null,
            status: 'sent',
            created_at: '2026-01-01T00:00:11.000Z', // Server time
        });

        let messages = $chatMessagesState.chats['chat-1'].messages.peek();
        // Order by server created_at DESC: text (12) → audio (11) → video (10)
        expect(messages.map((m: any) => m.message_id)).toEqual([
            'real-text',
            'real-audio',
            'real-video',
        ]);
        expect(messages.map((m: any) => m.created_at)).toEqual([
            '2026-01-01T00:00:12.000Z',
            '2026-01-01T00:00:11.000Z',
            '2026-01-01T00:00:10.000Z',
        ]);

        // Sync should also use server times (preserveOutgoingLocalCreatedAt now uses server time)
        await $chatMessagesState.setMessages('chat-1', [
            { ...messages[0], created_at: '2026-01-01T00:00:20.000Z' },
            { ...messages[1], created_at: '2026-01-01T00:00:21.000Z' },
            { ...messages[2], created_at: '2026-01-01T00:00:22.000Z' },
        ], { skipSenderSync: true });

        messages = $chatMessagesState.chats['chat-1'].messages.peek();
        // Order by new server created_at DESC: 22 → 21 → 20
        expect(messages.map((m: any) => m.message_id)).toEqual([
            'real-video',
            'real-audio',
            'real-text',
        ]);
        expect(messages.map((m: any) => m.created_at)).toEqual([
            '2026-01-01T00:00:22.000Z',
            '2026-01-01T00:00:21.000Z',
            '2026-01-01T00:00:20.000Z',
        ]);
    });

    it('delivery-ACKs visible incoming media after local_uri is stored', async () => {
        const media = makeMessage({
            message_id: 'msg-media-ready',
            is_from_me: false,
            message_type: 'video',
            file_id: 'file-1',
            download_url: 'https://files.local/video.mp4',
            local_uri: null,
            sender_id: 'user-2',
            recipient_id: 'user-1',
        });

        mockGetPendingMessages.mockResolvedValueOnce({ messages: [media], count: 1 });
        mockDownloadIncomingFile.mockResolvedValueOnce('idb://video.mp4');

        await $chatMessagesState.syncPendingMessages();

        expect(mockAckDeliveryBatch).toHaveBeenCalledWith({
            message_ids: ['msg-media-ready'],
            acknowledged_by: 'recipient',
            success: true,
        });
    });
    it('does not SENDER sync ACK visible incoming media until local_uri exists', async () => {
        const media = makeMessage({
            message_id: 'msg-sender-sync-media',
            is_from_me: true,
            message_type: 'image',
            file_id: 'file-123',
            download_url: 'https://files.local/image.jpg',
            local_uri: null,
            sender_id: 'user-1',
            recipient_id: 'user-2',
            synced_to_sender_primary: false,
        });

        // Try to ACK; it should be blocked by needsIncomingMediaLocalPersistence
        await ackIncomingMessages([media]);

        expect(mockAckDelivery).not.toHaveBeenCalledWith(expect.objectContaining({
            message_id: 'msg-sender-sync-media',
            acknowledged_by: 'sender',
        }));

        // Now simulate the local_uri being added after download
        (media as any).local_uri = 'idb://image.jpg';
        await ackIncomingMessages([media]);

        expect(mockAckDelivery).toHaveBeenCalledWith({
            message_id: 'msg-sender-sync-media',
            acknowledged_by: 'sender',
            success: true,
        });
    });
});
