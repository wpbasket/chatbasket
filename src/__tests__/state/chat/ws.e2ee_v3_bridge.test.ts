jest.mock('react-native-libsodium', () => {
    const sodium = require('libsodium-wrappers-sumo');
    return {
        __esModule: true,
        get ready() { return sodium.ready; },
        get base64_variants() { return sodium.base64_variants; },
        crypto_box_keypair: () => sodium.crypto_box_keypair(),
        crypto_box_easy: (m: any, n: any, pk: any, sk: any) => sodium.crypto_box_easy(m, n, pk, sk),
        crypto_box_open_easy: (c: any, n: any, pk: any, sk: any) => sodium.crypto_box_open_easy(c, n, pk, sk),
        crypto_box_seal: (m: any, pk: any) => sodium.crypto_box_seal(m, pk),
        crypto_box_seal_open: (c: any, pk: any, sk: any) => sodium.crypto_box_seal_open(c, pk, sk),
        crypto_secretbox_keygen: () => sodium.crypto_secretbox_keygen(),
        crypto_secretbox_easy: (m: any, n: any, k: any) => sodium.crypto_secretbox_easy(m, n, k),
        crypto_secretbox_open_easy: (c: any, n: any, k: any) => sodium.crypto_secretbox_open_easy(c, n, k),
        randombytes_buf: (len: number) => sodium.randombytes_buf(len),
        from_base64: (s: string, v?: number) => sodium.from_base64(s, v),
        to_base64: (b: any, v?: number) => sodium.to_base64(b, v),
        to_string: (b: any) => sodium.to_string(b),
    };
});

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

const mockInsertMessage = jest.fn(async () => undefined);
const mockMessageExists = jest.fn(async () => false);
const mockUpdateMessageStatus = jest.fn(async () => undefined);
jest.mock('@/lib/storage/personalStorage/chat/chat.storage', () => ({
    __esModule: true,
    insertMessage: (...args: any[]) => mockInsertMessage.apply(null, args as any),
    messageExists: (...args: any[]) => mockMessageExists.apply(null, args as any),
    updateMessageStatus: (...args: any[]) => mockUpdateMessageStatus.apply(null, args as any),
    deleteMessage: jest.fn(async () => undefined),
    recordFailedInsert: jest.fn(),
    cleanupMessageMedia: jest.fn(async () => undefined),
    getUserKeys: jest.fn(async () => []),
    getUserKeysRevision: jest.fn(async () => 0),
    setUserKeys: jest.fn(async () => undefined),
    getFirstUserKey: jest.fn(async () => null),
}));

const mockAddMessage = jest.fn(async () => undefined);
const mockAckIncomingMessages = jest.fn(async () => undefined);
const mockUpsertChat = jest.fn();
jest.mock('@/state/personalState/chat/personal.state.chat', () => ({
    __esModule: true,
    $chatMessagesState: {
        activeChatId: { peek: () => 'chat-1' },
        addMessage: (...args: any[]) => mockAddMessage.apply(null, args as any),
        updateMessageProgress: jest.fn(),
        updateMessageStatus: jest.fn(),
        debouncedMarkRead: jest.fn(),
    },
    $chatListState: {
        chatsById: {
            'chat-1': { peek: () => ({
                chat_id: 'chat-1',
                other_user_id: 'bob',
                other_user_name: 'Bob',
                other_user_username: 'bob',
                avatar_url: null,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
                other_user_last_delivered_at: '2026-01-01T00:00:00Z',
                last_message_content: null,
                last_message_created_at: null,
                last_message_type: null,
                last_message_is_from_me: false,
                last_message_status: 'sent',
                last_message_sender_id: null,
                last_message_id: null,
                last_message_is_unsent: false,
                unread_count: 0,
            }) },
        },
        upsertChat: (...args: any[]) => mockUpsertChat.apply(null, args as any),
        setChats: jest.fn(async () => undefined),
    },
    ackIncomingMessages: (...args: any[]) => mockAckIncomingMessages.apply(null, args as any),
}));

jest.mock('@/lib/personalLib/chatApi/ws.client', () => ({
    __esModule: true,
    wsClient: { subscribe: jest.fn() },
}));
jest.mock('@/lib/personalLib/chatApi/chat.transport', () => ({
    __esModule: true,
    ChatTransport: { getUserChats: jest.fn(async () => ({ chats: [] })) },
}));
jest.mock('@/state/personalState/chat/personal.state.sync', () => ({
    __esModule: true,
    $syncEngine: { triggerSync: jest.fn() },
}));
jest.mock('@/state/personalState/contacts/personal.state.contacts', () => ({
    __esModule: true,
    $contactsState: { upsertContact: jest.fn() },
}));
jest.mock('@/utils/personalUtils/util.chatMedia', () => ({
    __esModule: true,
    resolveMediaUrls: jest.fn(async () => undefined),
}));
jest.mock('@/lib/personalLib/fileSystem/file.download', () => ({
    __esModule: true,
    downloadIncomingFile: jest.fn(async () => null),
}));

jest.mock('@/state/auth/state.auth', () => ({
    authState: {
        userId: { peek: () => 'alice' },
        isPrimary: { peek: () => true },
        keys_revision: { peek: () => 1, set: jest.fn() },
    },
}));

const mockIdentity: { publicKey: string | null; privateKey: string | null } = { publicKey: null, privateKey: null };
jest.mock('@/lib/personalLib/e2ee/e2ee.keys', () => ({
    __esModule: true,
    getMyPublicKey: jest.fn(() => mockIdentity.publicKey),
    getMyPrivateKey: jest.fn(() => mockIdentity.privateKey),
    requireStrictE2EEReadyForSend: jest.fn(async () => ({ ok: true as const, publicKey: mockIdentity.publicKey, privateKey: mockIdentity.privateKey })),
    whenKeyInitSettled: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/personalLib/profileApi/personal.api.profile', () => ({
    __esModule: true,
    PersonalProfileApi: { getE2EEKey: jest.fn() },
}));

import { routeWSEvent } from '@/state/personalState/chat/ws.event.bridge';
import { encryptPayloadEnvelope, generateIdentityKeypair, sodiumReady } from '@/lib/personalLib/e2ee/e2ee.crypto';
import type { MessageEntry } from '@/lib/personalLib/models/personal.model.chat';

function flush() {
    return new Promise(resolve => setImmediate(resolve));
}

describe('WS bridge E2EE V3 ingress', () => {
    beforeAll(async () => {
        await sodiumReady();
    });

    beforeEach(() => {
        const me = generateIdentityKeypair();
        mockIdentity.publicKey = me.publicKey;
        mockIdentity.privateKey = me.privateKey;
        jest.clearAllMocks();
    });

    it('decrypts V3 text before storage, state, ACK, and preview update', async () => {
        const payload: MessageEntry = {
            message_id: 'm-ws-1',
            chat_id: 'chat-1',
            is_from_me: false,
            recipient_id: 'alice',
            content: encryptPayloadEnvelope({ type: 'text', text: 'hello from ws' }, [mockIdentity.publicKey!]),
            message_type: 'text',
            delivered_to_recipient: false,
            synced_to_sender_primary: false,
            created_at: '2026-01-01T00:00:00Z',
            expires_at: '2026-01-02T00:00:00Z',
        } as MessageEntry;

        routeWSEvent({ type: 'new_message', payload } as any);
        await flush();
        await flush();

        expect(mockInsertMessage).toHaveBeenCalledWith(expect.objectContaining({ message_id: 'm-ws-1', content: 'hello from ws' }));
        expect(mockAddMessage).toHaveBeenCalledWith('chat-1', expect.objectContaining({ content: 'hello from ws' }), { skipAck: true });
        expect(mockAckIncomingMessages).toHaveBeenCalledWith([expect.objectContaining({ content: 'hello from ws' })]);
        expect(mockUpsertChat).toHaveBeenCalledWith(expect.objectContaining({ last_message_content: 'hello from ws' }));
    });
});
