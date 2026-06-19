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

jest.mock('react-native', () => {
    const Platform = { OS: 'android' };
    (global as any).__mockPlatform = Platform;
    return { __esModule: true, Platform };
});

const mockFiles = new Map<string, Uint8Array>();
class MockDirectory {
    uri: string;
    exists = false;
    constructor(parent: any, name: string) {
        this.uri = `${parent.uri || parent}/${name}`;
    }
    create() {
        this.exists = true;
    }
}
class MockFile {
    uri: string;
    constructor(parent: any, name?: string) {
        this.uri = name ? `${parent.uri}/${name}` : String(parent);
    }
    get exists() {
        return mockFiles.has(this.uri);
    }
    write(bytes: Uint8Array) {
        mockFiles.set(this.uri, new Uint8Array(bytes));
    }
}
jest.mock('expo-file-system', () => ({
    __esModule: true,
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: 'file:///doc' } },
}));

const mockMediaBlobs = new Map<string, Blob>();
const mockStoreMediaBlob = jest.fn(async (id: string, blob: Blob) => {
    mockMediaBlobs.set(id, blob);
});
jest.mock('@/lib/storage/personalStorage/chat/chat.storage', () => ({
    __esModule: true,
    getMediaBlob: jest.fn(async (id: string) => mockMediaBlobs.get(id) ?? null),
    storeMediaBlob: (...args: any[]) => mockStoreMediaBlob.apply(null, args as any),
    getUserKeys: jest.fn(async () => []),
    getUserKeysRevision: jest.fn(async () => 0),
    setUserKeys: jest.fn(async () => undefined),
    getFirstUserKey: jest.fn(async () => null),
}));

const mockIdentity: { publicKey: string | null; privateKey: string | null } = { publicKey: null, privateKey: null };
jest.mock('@/lib/personalLib/e2ee/e2ee.keys', () => ({
    __esModule: true,
    getMyPublicKey: jest.fn(() => mockIdentity.publicKey),
    getMyPrivateKey: jest.fn(() => mockIdentity.privateKey),
    requireStrictE2EEReadyForSend: jest.fn(async () => ({ ok: true as const, publicKey: mockIdentity.publicKey, privateKey: mockIdentity.privateKey })),
    whenKeyInitSettled: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/state/auth/state.auth', () => ({
    authState: { userId: { peek: () => 'alice' }, keys_revision: { peek: () => 1, set: jest.fn() } },
}));

jest.mock('@/lib/personalLib/profileApi/personal.api.profile', () => ({
    __esModule: true,
    PersonalProfileApi: { getE2EEKey: jest.fn() },
}));

import { downloadIncomingFile } from '@/lib/personalLib/fileSystem/file.download';
import {
    encode32ByteKeyB64,
    encryptMediaBytes,
    encryptPayloadEnvelope,
    generateIdentityKeypair,
    generateMediaKey,
    sodiumReady,
} from '@/lib/personalLib/e2ee/e2ee.crypto';
import type { MessageEntry } from '@/lib/personalLib/models/personal.model.chat';

const plainBytes = new Uint8Array([10, 20, 30, 40, 50]);
let encryptedBytes: Uint8Array;

function makeEncryptedFileMessage(id: string): MessageEntry {
    const fileKey = generateMediaKey();
    encryptedBytes = encryptMediaBytes(plainBytes, fileKey);
    return {
        message_id: id,
        chat_id: 'chat-1',
        is_from_me: false,
        recipient_id: 'alice',
        content: encryptPayloadEnvelope({
            type: 'file',
            file_key: encode32ByteKeyB64(fileKey),
            file_name: 'proof.png',
            mime_type: 'image/png',
            size: plainBytes.length,
        }, [mockIdentity.publicKey!]),
        message_type: 'image',
        delivered_to_recipient: false,
        synced_to_sender_primary: false,
        created_at: '2026-01-01T00:00:00Z',
        expires_at: '2026-01-02T00:00:00Z',
        file_name: null,
        file_size: encryptedBytes.length,
        file_mime_type: null,
        file_id: 'file-1',
        download_url: 'https://files.local/proof.enc?project=p1',
    } as MessageEntry;
}

class MockXHR {
    status = 200;
    statusText = 'OK';
    responseType = '';
    timeout = 0;
    response: ArrayBuffer | null = null;
    onprogress?: (event: any) => void;
    onload?: () => void;
    onerror?: () => void;
    ontimeout?: () => void;
    open = jest.fn();
    send = jest.fn(() => {
        this.response = encryptedBytes.slice().buffer as ArrayBuffer;
        this.onprogress?.({ lengthComputable: true, loaded: encryptedBytes.length, total: encryptedBytes.length });
        this.onload?.();
    });
}

function mockFetchBytes(bytes: Uint8Array) {
    const chunks = [bytes.slice(0, 2), bytes.slice(2)];
    let index = 0;
    (global as any).fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: (name: string) => name.toLowerCase() === 'content-length' ? String(bytes.length) : null },
        body: { getReader: () => ({ read: jest.fn(async () => index < chunks.length ? { done: false, value: chunks[index++] } : { done: true, value: undefined }) }) },
    }));
}

describe('E2EE V3 file download pipeline', () => {
    beforeAll(async () => {
        await sodiumReady();
    });

    beforeEach(() => {
        const me = generateIdentityKeypair();
        mockIdentity.publicKey = me.publicKey;
        mockIdentity.privateKey = me.privateKey;
        mockFiles.clear();
        mockMediaBlobs.clear();
        mockStoreMediaBlob.mockClear();
        (global as any).XMLHttpRequest = MockXHR as any;
    });

    it('native path stores decrypted bytes from V3 file envelope', async () => {
        (global as any).__mockPlatform.OS = 'android';
        const msg = makeEncryptedFileMessage('m-native');

        const uri = await downloadIncomingFile(msg);

        expect(uri).toBe('file:///doc/chatFiles/m-native.png');
        expect(mockFiles.get(uri!)).toEqual(plainBytes);
        expect(msg.file_name).toBe('proof.png');
        expect(msg.file_mime_type).toBe('image/png');
        expect(msg.file_size).toBe(plainBytes.length);
    });

    it('web path stores decrypted blob from V3 file envelope', async () => {
        (global as any).__mockPlatform.OS = 'web';
        const msg = makeEncryptedFileMessage('m-web');
        mockFetchBytes(encryptedBytes);

        const uri = await downloadIncomingFile(msg);

        expect(uri).toBe('idb://m-web');
        expect(mockStoreMediaBlob).toHaveBeenCalledWith('m-web', expect.any(Blob), 'image/png', 'proof.png');
        const stored = mockMediaBlobs.get('m-web');
        expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(plainBytes);
        expect(msg.file_name).toBe('proof.png');
        expect(msg.file_mime_type).toBe('image/png');
        expect(msg.file_size).toBe(plainBytes.length);
    });
});
