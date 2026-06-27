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

const ALICE_ID = 'alice';
const BOB_ID = 'bob';
const mockRegistry = new Map<string, { keys: string[]; revision: number }>();

jest.mock('@/state/auth/state.auth', () => ({
    authState: {
        userId: { peek: () => ALICE_ID },
        keys_revision: { peek: () => 11, set: jest.fn() },
    },
}));

jest.mock('@/lib/storage/personalStorage/chat/chat.storage', () => ({
    __esModule: true,
    getUserKeys: jest.fn(async (userId: string) => (mockRegistry.get(userId)?.keys || []).map(device_key => ({
        user_id: userId,
        device_key,
        keys_revision: mockRegistry.get(userId)?.revision || 0,
        updated_at: 'now',
    }))),
    getUserKeysRevision: jest.fn(async (userId: string) => mockRegistry.get(userId)?.revision || 0),
    setUserKeys: jest.fn(async (userId: string, keys: Array<{ device_key: string; keys_revision: number }>, revision: number) => {
        mockRegistry.set(userId, { keys: keys.map(k => k.device_key), revision });
    }),
    getFirstUserKey: jest.fn(async (userId: string) => mockRegistry.get(userId)?.keys[0] || null),
}));

const mockGetE2EEKey = jest.fn();
jest.mock('@/lib/personalLib/profileApi/personal.api.profile', () => ({
    __esModule: true,
    PersonalProfileApi: { getE2EEKey: (...args: any[]) => mockGetE2EEKey(...args) },
}));

const mockIdentity: { publicKey: string | null; privateKey: string | null } = { publicKey: null, privateKey: null };
jest.mock('@/lib/personalLib/e2ee/e2ee.keys', () => ({
    __esModule: true,
    getMyPublicKey: jest.fn(() => mockIdentity.publicKey),
    getMyPrivateKey: jest.fn(() => mockIdentity.privateKey),
    requireStrictE2EEReadyForSend: jest.fn(async () => (mockIdentity.publicKey && mockIdentity.privateKey)
        ? { ok: true as const, publicKey: mockIdentity.publicKey, privateKey: mockIdentity.privateKey }
        : { ok: false as const, reason: 'local_key_unavailable' as const }),
    whenKeyInitSettled: jest.fn(() => Promise.resolve()),
}));

import {
    E2EE_FAILED_TO_LOAD_TEXT,
    decode32ByteKeyB64,
    decryptMediaBytes,
    decryptPayloadEnvelope,
    encryptPayloadEnvelope,
    generateIdentityKeypair,
    sodiumReady,
} from '@/lib/personalLib/e2ee/e2ee.crypto';
import { encryptOutgoingTextStrict, prepareOutgoingMediaStrict, processIncomingChats, processIncomingMessages, resolveUserPublicKeys } from '@/lib/personalLib/e2ee/e2ee.service';
import type { ChatEntry, MessageEntry } from '@/lib/personalLib/models/personal.model.chat';

describe('E2EE V3 service multi-device envelopes', () => {
    let aliceCurrent: ReturnType<typeof generateIdentityKeypair>;
    let aliceSibling: ReturnType<typeof generateIdentityKeypair>;
    let bobOne: ReturnType<typeof generateIdentityKeypair>;
    let bobTwo: ReturnType<typeof generateIdentityKeypair>;
    let outsider: ReturnType<typeof generateIdentityKeypair>;

    beforeAll(async () => {
        await sodiumReady();
    });

    beforeEach(() => {
        aliceCurrent = generateIdentityKeypair();
        aliceSibling = generateIdentityKeypair();
        bobOne = generateIdentityKeypair();
        bobTwo = generateIdentityKeypair();
        outsider = generateIdentityKeypair();
        mockIdentity.publicKey = aliceCurrent.publicKey;
        mockIdentity.privateKey = aliceCurrent.privateKey;
        mockRegistry.clear();
        mockRegistry.set(ALICE_ID, { keys: [aliceCurrent.publicKey, aliceSibling.publicKey], revision: 11 });
        mockRegistry.set(BOB_ID, { keys: [bobOne.publicKey, bobTwo.publicKey], revision: 7 });
        mockGetE2EEKey.mockReset();
    });

    it('text envelope decrypts for sender current, sender sibling, and all recipient sessions', async () => {
        const result = await encryptOutgoingTextStrict(BOB_ID, 'hello all devices', { recipientKeysRevision: 7 });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.reason);

        expect(decryptPayloadEnvelope(result.wire, aliceCurrent.publicKey, aliceCurrent.privateKey)).toEqual({ type: 'text', text: 'hello all devices' });
        expect(decryptPayloadEnvelope(result.wire, aliceSibling.publicKey, aliceSibling.privateKey)).toEqual({ type: 'text', text: 'hello all devices' });
        expect(decryptPayloadEnvelope(result.wire, bobOne.publicKey, bobOne.privateKey)).toEqual({ type: 'text', text: 'hello all devices' });
        expect(decryptPayloadEnvelope(result.wire, bobTwo.publicKey, bobTwo.privateKey)).toEqual({ type: 'text', text: 'hello all devices' });
        expect(() => decryptPayloadEnvelope(result.wire, outsider.publicKey, outsider.privateKey)).toThrow();
        expect(mockGetE2EEKey).not.toHaveBeenCalled();
    });

    it('file envelope decrypts metadata and file bytes for every authorized device', async () => {
        const fileBytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
        const result = await prepareOutgoingMediaStrict({
            kind: 'blob',
            recipientId: BOB_ID,
            blob: new Blob([fileBytes], { type: 'image/png' }),
            originalFileName: 'photo.png',
            originalMimeType: 'image/png',
            originalSize: fileBytes.length,
            messageType: 'image',
        }, { recipientKeysRevision: 7 });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.reason);

        if (!('encryptedBlob' in result.media)) throw new Error('expected blob media');
        const encryptedBytes = new Uint8Array(await result.media.encryptedBlob.arrayBuffer());
        for (const kp of [aliceCurrent, aliceSibling, bobOne, bobTwo]) {
            const payload = decryptPayloadEnvelope(result.media.wrappedKey, kp.publicKey, kp.privateKey);
            expect(payload.type).toBe('file');
            if (payload.type !== 'file') throw new Error('expected file');
            expect(payload.file_name).toBe('photo.png');
            expect(payload.mime_type).toBe('image/png');
            expect(payload.size).toBe(fileBytes.length);
            expect(decryptMediaBytes(encryptedBytes, decode32ByteKeyB64(payload.file_key))).toEqual(fileBytes);
        }
        expect(() => decryptPayloadEnvelope(result.media.wrappedKey, outsider.publicKey, outsider.privateKey)).toThrow();
    });

    it('chat previews decrypt V3 text and file metadata; invalid preview fail-closes', async () => {
        const textChat = {
            chat_id: 'chat-text',
            other_user_id: BOB_ID,
            other_user_name: 'Bob',
            other_user_username: 'bob',
            avatar_url: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            other_user_last_delivered_at: '2026-01-01T00:00:00Z',
            last_message_content: encryptPayloadEnvelope({ type: 'text', text: 'preview text' }, [aliceCurrent.publicKey]),
            last_message_created_at: '2026-01-01T00:00:00Z',
            last_message_type: 'text',
            last_message_is_from_me: false,
            last_message_status: 'sent',
            last_message_sender_id: BOB_ID,
            last_message_id: 'msg-preview-text',
            last_message_is_unsent: false,
            unread_count: 0,
        } as ChatEntry;
        const fileChat = {
            ...textChat,
            chat_id: 'chat-file',
            last_message_type: 'image',
            last_message_id: 'msg-preview-file',
            last_message_content: encryptPayloadEnvelope({
                type: 'file',
                file_key: resultFileKeyForTest(),
                file_name: 'receipt.pdf',
                mime_type: 'application/pdf',
                size: 321,
            }, [aliceCurrent.publicKey]),
        } as ChatEntry;
        const badChat = {
            ...textChat,
            chat_id: 'chat-bad',
            last_message_id: 'msg-preview-bad',
            last_message_content: encryptPayloadEnvelope({ type: 'text', text: 'not for me' }, [outsider.publicKey]),
        } as ChatEntry;

        await processIncomingChats([textChat, fileChat, badChat]);

        expect(textChat.last_message_content).toBe('preview text');
        expect(fileChat.last_message_content).toBe('receipt.pdf');
        expect(badChat.last_message_content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('local replay permits explicit plaintext rows while V3 rows still decrypt', async () => {
        const plaintext = makeMessage({ message_id: 'local-plain', content: 'already decrypted local row' });
        const encrypted = makeMessage({
            message_id: 'local-v3',
            content: encryptPayloadEnvelope({ type: 'text', text: 'decrypted from local v3' }, [aliceCurrent.publicKey]),
        });
        const invalid = makeMessage({ message_id: 'bad-wire', content: 'server plaintext is invalid now' });

        await processIncomingMessages([plaintext, encrypted], { allowLocalPlaintext: true });
        await processIncomingMessages([invalid]);

        expect(plaintext.content).toBe('already decrypted local row');
        expect(encrypted.content).toBe('decrypted from local v3');
        expect(invalid.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('resolveUserPublicKeys syncs and fetches fresh keys when local cached revision is stale', async () => {
        // Setup: Cached keys have revision 10, but authState says revision 12
        mockRegistry.set(ALICE_ID, { keys: [aliceCurrent.publicKey], revision: 10 });
        
        // Mock profile API returning fresh keys for revision 12
        mockGetE2EEKey.mockResolvedValue({
            keys_revision: 12,
            e2ee_public_keys: [aliceCurrent.publicKey, aliceSibling.publicKey],
        });

        // Set authState revision to 12
        const { authState } = require('@/state/auth/state.auth');
        const oldPeek = authState.keys_revision.peek;
        authState.keys_revision.peek = () => 12;

        try {
            const keys = await resolveUserPublicKeys(ALICE_ID);
            expect(mockGetE2EEKey).toHaveBeenCalledWith(ALICE_ID);
            expect(keys).toEqual([aliceCurrent.publicKey, aliceSibling.publicKey]);
            
            // Verify registry updated in storage mock
            expect(mockRegistry.get(ALICE_ID)).toEqual({
                keys: [aliceCurrent.publicKey, aliceSibling.publicKey],
                revision: 12,
            });
        } finally {
            // Restore mock
            authState.keys_revision.peek = oldPeek;
        }
    });
});

function resultFileKeyForTest(): string {
    const sodium = require('libsodium-wrappers-sumo');
    return sodium.to_base64(sodium.crypto_secretbox_keygen(), sodium.base64_variants.ORIGINAL);
}

function makeMessage(overrides: Partial<MessageEntry> = {}): MessageEntry {
    return {
        message_id: 'msg',
        chat_id: 'chat',
        is_from_me: false,
        recipient_id: ALICE_ID,
        content: '',
        message_type: 'text',
        delivered_to_recipient: false,
        synced_to_sender_primary: false,
        created_at: '2026-01-01T00:00:00Z',
        expires_at: '2026-01-02T00:00:00Z',
        ...overrides,
    } as MessageEntry;
}
