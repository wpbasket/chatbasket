/**
 * Regression tests — home-screen preview heals after pending sync (INCIDENT).
 *
 * Reported: on first app open the pending messages sync fine (bubbles OK), but
 * the home-screen chat preview stays EMPTY until a manual page refresh.
 *
 * Root cause: `setChats` runs BEFORE `syncPendingMessages`, so the E2EE
 * chat-list pass has no local plaintext row to restore an encrypted preview
 * from and blanks it to "". The pending-sync preview-update block then
 * (a) skipped blank previews entirely (`continue` guard) and (b) used a strict
 * `isNewer` (`>`) check — the blanked server preview references the SAME
 * pending message (equal timestamps) — so the blank never healed in-session.
 *
 * Fix under test: `healsBlankedPreview` in `syncPendingMessages` lets the
 * freshly decrypted pending message fill a blank/absent preview, while
 * unreadable previews stay blank and non-blank previews keep the old rules.
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

const mockGetPreviewText = jest.fn();
jest.mock('@/utils/personalUtils/util.chatPreview', () => ({
    getPreviewText: (...args: any[]) => mockGetPreviewText(...args),
}));

jest.mock('@/lib/personalLib/fileSystem/file.download', () => ({
    downloadIncomingFile: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/personalLib/e2ee/e2ee.service', () => ({
    __esModule: true,
    processIncomingChats: jest.fn(async (chats: any[]) => chats),
    processIncomingMessagesWithE2EEReport: jest.fn(async (entries: any[]) => ({ entries, failures: [] })),
    shouldAckE2EEInboundFailure: jest.fn(() => true),
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

// ── Helpers ─────────────────────────────────────────────────────────────────

const CHAT_ID = 'chat-1';
const PENDING_AT = '2026-06-11T10:00:00Z';

function makePendingMessage(overrides: Record<string, any> = {}) {
    return {
        message_id: 'msg-pending-1',
        chat_id: CHAT_ID,
        content: 'hello there',
        message_type: 'text',
        created_at: PENDING_AT,
        is_from_me: false,
        status: 'sent',
        synced_to_sender_primary: false,
        delivered_to_recipient: false,
        delivered_to_recipient_primary: false,
        sender_id: 'user-2',
        recipient_id: 'user-1',
        ...overrides,
    };
}

function makeChatEntry(overrides: Record<string, any> = {}) {
    return {
        chat_id: CHAT_ID,
        other_user_id: 'user-2',
        other_user_name: 'Bob',
        unread_count: 1,
        local_message_count: 0,
        // The E2EE chat-list pass blanked the undecryptable server preview
        // (no local plaintext row yet — pending sync had not run).
        last_message_content: '',
        last_message_created_at: PENDING_AT, // SAME message as the pending one
        last_message_type: 'text',
        last_message_is_from_me: false,
        last_message_status: 'sent',
        last_message_id: 'msg-pending-1',
        updated_at: PENDING_AT,
        ...overrides,
    };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('syncPendingMessages — blank home-screen preview heals (first open)', () => {
    let $chatMessagesState: any;
    let $chatListState: any;

    beforeEach(() => {
        mockGetPendingMessages.mockReset();
        mockAckDelivery.mockReset().mockResolvedValue({ acknowledged: true });
        mockAckDeliveryBatch.mockReset().mockResolvedValue({ acknowledged: true });
        mockGetPreviewText.mockReset().mockImplementation((m: any) => m?.content ?? '');
        // isolateModules → fresh module copy per test (resets isSyncingPending
        // and the in-memory chat list).
        jest.isolateModules(() => {
            const mod = require('@/state/personalState/chat/personal.state.chat');
            $chatMessagesState = mod.$chatMessagesState;
            $chatListState = mod.$chatListState;
        });
    });

    it('INCIDENT: heals a blanked ("") preview from the decrypted pending message (same timestamp)', async () => {
        $chatListState.chatsById[CHAT_ID].set(makeChatEntry());
        mockGetPendingMessages.mockResolvedValueOnce({
            messages: [makePendingMessage()],
            count: 1,
        });

        await $chatMessagesState.syncPendingMessages();

        const entry = $chatListState.chatsById[CHAT_ID].peek();
        expect(entry.last_message_content).toBe('hello there');
        expect(entry.last_message_id).toBe('msg-pending-1');
        expect(entry.last_message_created_at).toBe(PENDING_AT);
    });

    it('heals a null/absent preview the same way', async () => {
        $chatListState.chatsById[CHAT_ID].set(
            makeChatEntry({ last_message_content: null, last_message_created_at: null, last_message_id: null }),
        );
        mockGetPendingMessages.mockResolvedValueOnce({
            messages: [makePendingMessage()],
            count: 1,
        });

        await $chatMessagesState.syncPendingMessages();

        const entry = $chatListState.chatsById[CHAT_ID].peek();
        expect(entry.last_message_content).toBe('hello there');
        expect(entry.last_message_id).toBe('msg-pending-1');
    });

    it('heals a blanked media preview with the display-safe file-name preview', async () => {
        $chatListState.chatsById[CHAT_ID].set(makeChatEntry({ last_message_type: 'image' }));
        mockGetPreviewText.mockReturnValue('photo.jpg');
        mockGetPendingMessages.mockResolvedValueOnce({
            messages: [makePendingMessage({ message_type: 'image', content: '', file_name: 'photo.jpg' })],
            count: 1,
        });

        await $chatMessagesState.syncPendingMessages();

        expect($chatListState.chatsById[CHAT_ID].peek().last_message_content).toBe('photo.jpg');
    });

    it('keeps a blanked preview blank when the message preview is unreadable (never ciphertext)', async () => {
        $chatListState.chatsById[CHAT_ID].set(makeChatEntry());
        mockGetPreviewText.mockReturnValue(''); // undecryptable → display-safe empty
        mockGetPendingMessages.mockResolvedValueOnce({
            messages: [makePendingMessage({ content: '' })],
            count: 1,
        });

        await $chatMessagesState.syncPendingMessages();

        const entry = $chatListState.chatsById[CHAT_ID].peek();
        expect(entry.last_message_content).toBe('');
    });

    it('does NOT touch a readable preview when the synced message is not newer (old behavior)', async () => {
        $chatListState.chatsById[CHAT_ID].set(makeChatEntry({ last_message_content: 'already readable' }));
        mockGetPendingMessages.mockResolvedValueOnce({
            messages: [makePendingMessage()],
            count: 1,
        });

        await $chatMessagesState.syncPendingMessages();

        expect($chatListState.chatsById[CHAT_ID].peek().last_message_content).toBe('already readable');
    });

    it('still updates a readable preview when the synced message IS newer (old behavior)', async () => {
        $chatListState.chatsById[CHAT_ID].set(
            makeChatEntry({
                last_message_content: 'older message',
                last_message_created_at: '2026-06-11T09:00:00Z',
                last_message_id: 'msg-old',
            }),
        );
        mockGetPendingMessages.mockResolvedValueOnce({
            messages: [makePendingMessage()],
            count: 1,
        });

        await $chatMessagesState.syncPendingMessages();

        const entry = $chatListState.chatsById[CHAT_ID].peek();
        expect(entry.last_message_content).toBe('hello there');
        expect(entry.last_message_id).toBe('msg-pending-1');
    });
});
