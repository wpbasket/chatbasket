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

const mockGetHistorySyncHaveIds = jest.fn();
const mockGetHistorySyncPayload = jest.fn();
jest.mock('@/lib/storage/personalStorage/chat/chat.storage', () => ({
    __esModule: true,
    getHistorySyncHaveIds: (...args: any[]) => mockGetHistorySyncHaveIds.apply(null, args as any),
    getHistorySyncPayload: (...args: any[]) => mockGetHistorySyncPayload.apply(null, args as any),
}));

const mockSetMessages = jest.fn();
jest.mock('@/state/personalState/chat/personal.state.chat', () => ({
    __esModule: true,
    $chatMessagesState: {
        setMessages: (...args: any[]) => mockSetMessages.apply(null, args as any),
    },
    $chatListState: {
        chatsById: {
            peek: () => ({}),
        },
    },
}));

const mockRequestHistorySync = jest.fn();
const mockUploadHistorySync = jest.fn();
const mockDownloadHistorySync = jest.fn();
jest.mock('@/lib/personalLib/chatApi/chat.transport', () => ({
    __esModule: true,
    ChatTransport: {
        requestHistorySync: (...args: any[]) => mockRequestHistorySync.apply(null, args as any),
        uploadHistorySync: (...args: any[]) => mockUploadHistorySync.apply(null, args as any),
        downloadHistorySync: (...args: any[]) => mockDownloadHistorySync.apply(null, args as any),
    },
}));

const mockIsPrimaryVal: { value: boolean | null } = { value: false };
const mockPrimaryKeyVal: { value: string | null } = { value: 'primary-key-b64' };
const mockUserIdVal: { value: string | null } = { value: 'alice' };
jest.mock('@/state/auth/state.auth', () => ({
    authState: {
        isPrimary: { peek: () => mockIsPrimaryVal.value },
        primaryKey: { peek: () => mockPrimaryKeyVal.value },
        userId: { peek: () => mockUserIdVal.value },
    },
}));

const mockIdentity: { publicKey: string | null; privateKey: string | null } = { publicKey: null, privateKey: null };
jest.mock('@/lib/personalLib/e2ee/e2ee.keys', () => ({
    __esModule: true,
    getMyPublicKey: jest.fn(() => mockIdentity.publicKey),
    getMyPrivateKey: jest.fn(() => mockIdentity.privateKey),
    whenKeyInitSettled: jest.fn(() => Promise.resolve()),
}));

import { initiateHistorySync, processHistorySyncReady, handlePrimaryUploadRequest } from '@/lib/personalLib/chatApi/history.sync';
import { encryptPayloadEnvelope, decryptPayloadEnvelope, generateIdentityKeypair, sodiumReady } from '@/lib/personalLib/e2ee/e2ee.crypto';

function flush() {
    return new Promise(resolve => setImmediate(resolve));
}

describe('History Sync Client Flow', () => {
    beforeAll(async () => {
        await sodiumReady();
    });

    beforeEach(() => {
        const me = generateIdentityKeypair();
        mockIdentity.publicKey = me.publicKey;
        mockIdentity.privateKey = me.privateKey;
        mockIsPrimaryVal.value = false;
        mockPrimaryKeyVal.value = 'primary-key-b64';
        mockUserIdVal.value = 'alice';
        jest.clearAllMocks();
    });

    it('Secondary: initiateHistorySync correctly constructs E2EE envelope and sends request', async () => {
        mockIsPrimaryVal.value = false;
        mockGetHistorySyncHaveIds.mockResolvedValue({
            'chat-1': ['m-1', 'm-2'],
        });
        mockRequestHistorySync.mockResolvedValue({ request_id: 'req-id-123' });

        await initiateHistorySync();

        expect(mockGetHistorySyncHaveIds).toHaveBeenCalled();
        expect(mockRequestHistorySync).toHaveBeenCalledWith(expect.objectContaining({
            chats_cipher: expect.any(String),
        }));

        // verify encrypted request contents
        const sentPayload = mockRequestHistorySync.mock.calls[0][0].chats_cipher;
        const decrypted = decryptPayloadEnvelope(sentPayload, mockIdentity.publicKey!, mockIdentity.privateKey!) as { type: 'text'; text: string };
        expect(decrypted.type).toBe('text');
        const parsed = JSON.parse(decrypted.text);
        expect(parsed.chats).toEqual([
            { chat_id: 'chat-1', have_ids: ['m-1', 'm-2'] },
        ]);
    });

    it('Secondary: initiateHistorySync does nothing if primary', async () => {
        mockIsPrimaryVal.value = true;
        await initiateHistorySync();
        expect(mockGetHistorySyncHaveIds).not.toHaveBeenCalled();
        expect(mockRequestHistorySync).not.toHaveBeenCalled();
    });

    it('Secondary: initiateHistorySync does nothing if E2EE keys are missing', async () => {
        mockIsPrimaryVal.value = false;
        mockIdentity.publicKey = null; // simulate uninitialized keys
        await initiateHistorySync();
        expect(mockGetHistorySyncHaveIds).not.toHaveBeenCalled();
        expect(mockRequestHistorySync).not.toHaveBeenCalled();
    });

    it('Secondary: initiateHistorySync does nothing if primaryKey is missing', async () => {
        mockIsPrimaryVal.value = false;
        mockPrimaryKeyVal.value = null; // simulate missing primary key
        await initiateHistorySync();
        expect(mockGetHistorySyncHaveIds).not.toHaveBeenCalled();
        expect(mockRequestHistorySync).not.toHaveBeenCalled();
    });

    it('Secondary: processHistorySyncReady downloads, decrypts and ingests messages', async () => {
        mockIsPrimaryVal.value = false;

        const serverPayloadObj = {
            chats: [
                {
                    chat_id: 'chat-1',
                    messages: [
                        {
                            id: 'm-3',
                            sender_id: 'bob',
                            recipient_id: 'alice',
                            message_type: 'text',
                            content: 'hello secondary',
                            created_at: '2026-01-01T00:00:10Z',
                            delivered_to_recipient: true,
                        },
                        {
                            id: 'm-4',
                            sender_id: 'alice', // sent by me from primary
                            recipient_id: 'chat-1',
                            message_type: 'text',
                            content: 'hello bob from me',
                            created_at: '2026-01-01T00:00:12Z',
                            delivered_to_recipient: true,
                        }
                    ],
                },
            ],
        };

        const serverPayloadCipher = encryptPayloadEnvelope(
            { type: 'text', text: JSON.stringify(serverPayloadObj) },
            [mockIdentity.publicKey!]
        );

        mockDownloadHistorySync.mockResolvedValue({
            payload_cipher: serverPayloadCipher,
        });

        await processHistorySyncReady('req-id-123');

        expect(mockDownloadHistorySync).toHaveBeenCalledWith('req-id-123');
        expect(mockSetMessages).toHaveBeenCalledWith(
            'chat-1',
            [
                expect.objectContaining({
                    message_id: 'm-3',
                    chat_id: 'chat-1',
                    is_from_me: false,
                    recipient_id: 'alice',
                    content: 'hello secondary',
                    status: 'sent',
                }),
                expect.objectContaining({
                    message_id: 'm-4',
                    chat_id: 'chat-1',
                    is_from_me: true,
                    recipient_id: 'chat-1',
                    content: 'hello bob from me',
                    status: 'sent',
                }),
            ],
            { allowLocalPlaintext: true }
        );
    });

    it('Secondary: processHistorySyncReady aborts if keys are missing or device is primary', async () => {
        mockIsPrimaryVal.value = true; // should abort
        await processHistorySyncReady('req-id-123');
        expect(mockDownloadHistorySync).not.toHaveBeenCalled();

        mockIsPrimaryVal.value = false;
        mockIdentity.publicKey = null; // missing keys, should abort
        await processHistorySyncReady('req-id-123');
        expect(mockDownloadHistorySync).not.toHaveBeenCalled();
    });

    it('Secondary: processHistorySyncReady aborts on invalid/empty response', async () => {
        mockIsPrimaryVal.value = false;
        mockDownloadHistorySync.mockResolvedValue({ payload_cipher: '' }); // empty cipher
        await processHistorySyncReady('req-id-123');
        expect(mockSetMessages).not.toHaveBeenCalled();
    });

    it('Secondary: processHistorySyncReady aborts on invalid envelope type', async () => {
        mockIsPrimaryVal.value = false;
        const invalidEnvelope = encryptPayloadEnvelope(
            { type: 'file', file_key: 'foo', file_name: 'bar', mime_type: 'image/png', size: 100 },
            [mockIdentity.publicKey!]
        );
        mockDownloadHistorySync.mockResolvedValue({ payload_cipher: invalidEnvelope });
        await processHistorySyncReady('req-id-123');
        expect(mockSetMessages).not.toHaveBeenCalled();
    });

    it('Primary: handlePrimaryUploadRequest processes request and uploads diff', async () => {
        mockIsPrimaryVal.value = true;

        const secondaryKeys = generateIdentityKeypair();

        const clientRequestObj = {
            chats: [
                { chat_id: 'chat-1', have_ids: ['m-1', 'm-2'] },
            ],
        };

        const clientRequestCipher = encryptPayloadEnvelope(
            { type: 'text', text: JSON.stringify(clientRequestObj) },
            [mockIdentity.publicKey!]
        );

        mockGetHistorySyncPayload.mockResolvedValue([
            {
                message_id: 'm-3',
                chat_id: 'chat-1',
                is_from_me: true,
                recipient_id: 'bob',
                message_type: 'text',
                content: 'hello bob from primary',
                created_at: '2026-01-01T00:00:10Z',
                delivered_to_recipient: true,
                expires_at: '2026-01-02T00:00:10Z',
            },
        ]);

        await handlePrimaryUploadRequest('req-id-123', secondaryKeys.publicKey, clientRequestCipher);

        expect(mockGetHistorySyncPayload).toHaveBeenCalledWith('chat-1', ['m-1', 'm-2']);
        expect(mockUploadHistorySync).toHaveBeenCalledWith(expect.objectContaining({
            request_id: 'req-id-123',
            payload_cipher: expect.any(String),
        }));

        // verify uploaded payload
        const uploadedPayload = mockUploadHistorySync.mock.calls[0][0].payload_cipher;
        const decryptedResponse = decryptPayloadEnvelope(uploadedPayload, secondaryKeys.publicKey, secondaryKeys.privateKey) as { type: 'text'; text: string };
        expect(decryptedResponse.type).toBe('text');
        const parsedResponse = JSON.parse(decryptedResponse.text);
        expect(parsedResponse.chats).toEqual([
            {
                chat_id: 'chat-1',
                messages: [
                    {
                        id: 'm-3',
                        sender_id: 'alice',
                        recipient_id: 'chat-1',
                        message_type: 'text',
                        content: 'hello bob from primary',
                        created_at: '2026-01-01T00:00:10Z',
                        expires_at: '2026-01-02T00:00:10Z',
                        delivered_to_recipient: true,
                    },
                ],
            },
        ]);
    });

    it('Primary: handlePrimaryUploadRequest does nothing if device is secondary', async () => {
        mockIsPrimaryVal.value = false;
        await handlePrimaryUploadRequest('req-id-123', 'sec-key', 'cipher');
        expect(mockUploadHistorySync).not.toHaveBeenCalled();
    });

    it('Primary: handlePrimaryUploadRequest handles API 410 Gone status silently', async () => {
        mockIsPrimaryVal.value = true;
        const secondaryKeys = generateIdentityKeypair();

        const clientRequestObj = { chats: [] };
        const clientRequestCipher = encryptPayloadEnvelope(
            { type: 'text', text: JSON.stringify(clientRequestObj) },
            [mockIdentity.publicKey!]
        );

        mockGetHistorySyncPayload.mockResolvedValue([]);
        const err410: any = new Error('Request superseded');
        err410.status = 410;
        mockUploadHistorySync.mockRejectedValue(err410);

        // Should not throw or crash on 410
        await expect(handlePrimaryUploadRequest('req-id-123', secondaryKeys.publicKey, clientRequestCipher)).resolves.not.toThrow();
        expect(mockUploadHistorySync).toHaveBeenCalled();
    });

    it('Primary: handlePrimaryUploadRequest rethrows or logs generic upload errors', async () => {
        mockIsPrimaryVal.value = true;
        const secondaryKeys = generateIdentityKeypair();

        const clientRequestObj = { chats: [] };
        const clientRequestCipher = encryptPayloadEnvelope(
            { type: 'text', text: JSON.stringify(clientRequestObj) },
            [mockIdentity.publicKey!]
        );

        mockGetHistorySyncPayload.mockResolvedValue([]);
        const genericErr = new Error('Network error');
        mockUploadHistorySync.mockRejectedValue(genericErr);

        const spyConsole = jest.spyOn(console, 'error').mockImplementation(() => {});
        await handlePrimaryUploadRequest('req-id-123', secondaryKeys.publicKey, clientRequestCipher);
        expect(spyConsole).toHaveBeenCalledWith('[HistorySync] Failed to upload history sync:', genericErr);
        spyConsole.mockRestore();
    });
});
