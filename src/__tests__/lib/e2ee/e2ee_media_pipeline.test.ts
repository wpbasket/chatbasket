/**
 * Media pipeline E2EE tests — drives the REAL upload-prep and download-decrypt
 * code paths with dummy files and fake identities (Alice = this device,
 * Bob = remote user).
 *
 * Unlike e2ee_dummy_data.test.ts (crypto/service primitives), this suite tests
 * the surrounding pipeline:
 *
 *  OUTGOING — encryptOutgoingMediaFile():
 *    staged plaintext file → encrypted `.enc` temp copy under Paths.cache,
 *    wrapped key for the recipient, cleanup contract, graceful degradation.
 *
 *  INCOMING — downloadIncomingFile() (native):
 *    XHR arraybuffer → in-memory decrypt → plaintext written to
 *    Paths.document/chatFiles. Tamper → reject (no ACK), retry possible,
 *    plaintext/own-echo pass-through, dedupe + idempotency intact.
 *
 * expo-file-system is replaced with an in-memory file system and
 * XMLHttpRequest with a scriptable transport, so the real control flow
 * (including the dynamic `import('expo-file-system')`) executes end to end.
 */

// ── Mocks ───────────────────────────────────────────────────────────────────

// Real libsodium (WASM build) behind the react-native-libsodium API surface.
// Like the real web build (Proxy-backed exports that are `undefined` until
// `ready` resolves), constants are exposed via lazy getters — a module-eval
// capture sees `undefined`, faithfully reproducing the web cold start.
jest.mock('react-native-libsodium', () => {
    const sodium = require('libsodium-wrappers-sumo');
    return {
        __esModule: true,
        get ready() { return sodium.ready; },
        get base64_variants() { return sodium.base64_variants; },
        get crypto_box_NONCEBYTES() { return sodium.crypto_box_NONCEBYTES; },
        get crypto_secretbox_NONCEBYTES() { return sodium.crypto_secretbox_NONCEBYTES; },
        crypto_box_keypair: () => sodium.crypto_box_keypair(),
        crypto_box_easy: (m: any, n: any, pk: any, sk: any) => sodium.crypto_box_easy(m, n, pk, sk),
        crypto_box_open_easy: (c: any, n: any, pk: any, sk: any) => sodium.crypto_box_open_easy(c, n, pk, sk),
        crypto_secretbox_keygen: () => sodium.crypto_secretbox_keygen(),
        crypto_secretbox_easy: (m: any, n: any, k: any) => sodium.crypto_secretbox_easy(m, n, k),
        crypto_secretbox_open_easy: (c: any, n: any, k: any) => sodium.crypto_secretbox_open_easy(c, n, k),
        randombytes_buf: (len: number) => sodium.randombytes_buf(len),
        from_base64: (s: string, v?: number) => sodium.from_base64(s, v),
        from_string: (s: string) => sodium.from_string(s),
        to_base64: (b: any, v?: number) => sodium.to_base64(b, v),
        to_string: (b: any) => sodium.to_string(b),
    };
});

jest.mock('react-native', () => ({
    Platform: { OS: 'android' },
}));

// In-memory file system backing the expo-file-system mock
const mockFs = {
    files: new Map<string, Uint8Array>(),
    dirs: new Set<string>(),
    reset() {
        this.files.clear();
        this.dirs.clear();
    },
};

jest.mock('expo-file-system', () => {
    class MockFile {
        uri: string;
        constructor(parent: any, name?: string) {
            const base = typeof parent === 'string' ? parent : parent.uri;
            this.uri = name != null ? `${base}/${name}` : base;
        }
        get exists(): boolean {
            return mockFs.files.has(this.uri);
        }
        async arrayBuffer(): Promise<ArrayBuffer> {
            const bytes = mockFs.files.get(this.uri);
            if (!bytes) throw new Error(`ENOENT: ${this.uri}`);
            return bytes.slice().buffer;
        }
        write(bytes: Uint8Array): void {
            mockFs.files.set(this.uri, bytes.slice());
        }
        delete(): void {
            if (!mockFs.files.delete(this.uri)) throw new Error(`ENOENT: ${this.uri}`);
        }
    }
    class MockDirectory {
        uri: string;
        constructor(parent: any, name?: string) {
            const base = typeof parent === 'string' ? parent : parent.uri;
            this.uri = name != null ? `${base}/${name}` : base;
        }
        get exists(): boolean {
            return mockFs.dirs.has(this.uri);
        }
        create(): void {
            mockFs.dirs.add(this.uri);
        }
    }
    return {
        __esModule: true,
        File: MockFile,
        Directory: MockDirectory,
        Paths: { cache: 'file:///cache', document: 'file:///document' },
    };
});

// In-memory persistent key registry (user_keys table stand-in) + media blob API
const mockRegistry = new Map<string, string | null>();
jest.mock('@/lib/storage/personalStorage/chat/chat.storage', () => ({
    __esModule: true,
    getUserE2eePublicKey: jest.fn(async (userId: string) =>
        mockRegistry.has(userId) ? mockRegistry.get(userId) : undefined,
    ),
    setUserE2eePublicKey: jest.fn(async (userId: string, key: string | null) => {
        mockRegistry.set(userId, key);
    }),
    clearAllUserE2eeKeys: jest.fn(async () => {
        mockRegistry.clear();
    }),
    storeMediaBlob: jest.fn(async () => {}),
    getMediaBlob: jest.fn(async () => null),
}));

// get-e2ee-key fallback endpoint
const mockGetE2EEKey = jest.fn();
jest.mock('@/lib/personalLib/profileApi/personal.api.profile', () => ({
    __esModule: true,
    PersonalProfileApi: {
        getE2EEKey: (...args: any[]) => mockGetE2EEKey(...args),
    },
}));

// Local identity (Alice's device) — controllable per test
const mockIdentity: { privateKey: string | null } = { privateKey: null };
jest.mock('@/lib/personalLib/e2ee/e2ee.keys', () => ({
    __esModule: true,
    isE2EEReady: jest.fn(() => mockIdentity.privateKey != null),
    getMyPrivateKey: jest.fn(() => mockIdentity.privateKey),
    whenKeyInitSettled: jest.fn(() => Promise.resolve()),
}));

// ── Scriptable XMLHttpRequest (download transport) ──────────────────────────

type XhrScript = { status: number; body: Uint8Array } | { networkError: true };

const xhrState: { script: XhrScript | null; sendCount: number } = {
    script: null,
    sendCount: 0,
};

class MockXMLHttpRequest {
    url = '';
    status = 0;
    statusText = '';
    timeout = 0;
    responseType = '';
    response: ArrayBuffer | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onprogress: ((event: any) => void) | null = null;

    open(_method: string, url: string): void {
        this.url = url;
    }

    send(): void {
        xhrState.sendCount += 1;
        const script = xhrState.script;
        setTimeout(() => {
            if (!script || 'networkError' in script) {
                this.onerror?.();
                return;
            }
            this.onprogress?.({ lengthComputable: true, loaded: script.body.length, total: script.body.length });
            this.status = script.status;
            this.statusText = script.status === 200 ? 'OK' : 'Error';
            this.response = script.body.slice().buffer;
            this.onload?.();
        }, 0);
    }
}

(globalThis as any).XMLHttpRequest = MockXMLHttpRequest;

// ── Imports (after mocks) ───────────────────────────────────────────────────

import {
    decryptMediaBytes,
    encryptMediaBytes,
    generateIdentityKeypair,
    generateMediaKey,
    isEncryptedContent,
    sodiumReady,
    unwrapMediaEnvelope,
    wrapMediaEnvelope,
    type E2EEKeypairB64,
} from '@/lib/personalLib/e2ee/e2ee.crypto';
import { encryptOutgoingMediaFile } from '@/lib/personalLib/e2ee/e2ee.service';
import { downloadIncomingFile } from '@/lib/personalLib/fileSystem/file.download';
import type { MessageEntry } from '@/lib/personalLib/models/personal.model.chat';

// ── Dummy data helpers ──────────────────────────────────────────────────────

const BOB_ID = 'bob-uuid-0002';
const STAGED_URI = 'file:///staged/photo.jpg';
const TEMP_DIR_PREFIX = 'file:///cache/e2eeUploads/';

let alice: E2EEKeypairB64; // this device
let bob: E2EEKeypairB64;   // remote user

/** Dummy "file": deterministic pseudo-binary bytes (fake JPEG-ish payload). */
function makeDummyFileBytes(size: number): Uint8Array {
    const bytes = new Uint8Array(size);
    bytes.set([0xff, 0xd8, 0xff, 0xe0]); // JPEG SOI/APP0 magic
    for (let i = 4; i < size; i++) bytes[i] = (i * 31 + 7) % 256;
    return bytes;
}

function makeIncomingMediaMessage(overrides: Partial<MessageEntry> = {}): MessageEntry {
    return {
        message_id: `msg_${Math.random().toString(36).slice(2, 10)}`,
        chat_id: 'chat-1',
        content: '',
        message_type: 'image',
        is_from_me: false,
        status: 'delivered',
        created_at: new Date().toISOString(),
        sender_e2ee_public_key: bob.publicKey,
        download_url: 'https://relay.example/files/blob.bin?token=t1',
        file_name: 'photo.jpg',
        file_mime_type: 'image/jpeg',
        ...overrides,
    } as MessageEntry;
}

/** Finds the single `.enc` temp file written under the cache upload dir. */
function findTempUploadUris(): string[] {
    return [...mockFs.files.keys()].filter((uri) => uri.startsWith(TEMP_DIR_PREFIX));
}

beforeAll(async () => {
    await sodiumReady();
    alice = generateIdentityKeypair();
    bob = generateIdentityKeypair();
});

beforeEach(() => {
    mockFs.reset();
    mockRegistry.clear();
    mockGetE2EEKey.mockReset();
    mockIdentity.privateKey = alice.privateKey;
    xhrState.script = null;
    xhrState.sendCount = 0;
});

// ── 1. Outgoing pipeline: encryptOutgoingMediaFile ──────────────────────────

describe('encryptOutgoingMediaFile (upload prep, dummy staged file)', () => {
    const ORIGINAL = makeDummyFileBytes(48 * 1024); // 48 KB dummy image

    beforeEach(() => {
        mockFs.files.set(STAGED_URI, ORIGINAL.slice());
    });

    it('builds an encrypted .enc temp copy the recipient can fully decrypt', async () => {
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: bob.publicKey });

        const e2ee = await encryptOutgoingMediaFile(BOB_ID, STAGED_URI, 'photo.jpg');

        expect(e2ee).not.toBeNull();
        expect(e2ee!.uploadFileName).toMatch(/^cb-media-.+\.enc$/); // server-visible opaque name
        expect(e2ee!.encryptedUri.startsWith(TEMP_DIR_PREFIX)).toBe(true);
        expect(e2ee!.encryptedUri.endsWith('.enc')).toBe(true);
        expect(isEncryptedContent(e2ee!.wrappedKey)).toBe(true); // caption payload
        expect(mockGetE2EEKey).not.toHaveBeenCalled(); // registry-first: cached key used, no backend call

        // The encrypted copy exists, is ciphertext, and carries nonce+MAC overhead
        const encryptedBytes = mockFs.files.get(e2ee!.encryptedUri)!;
        expect(encryptedBytes).toBeDefined();
        expect(encryptedBytes.length).toBe(ORIGINAL.length + 24 + 16);
        expect(encryptedBytes.slice(0, 4)).not.toEqual(ORIGINAL.slice(0, 4));

        // RECIPIENT SIMULATION (Bob): unwrap key + exact metadata from the
        // encrypted caption, then open the downloaded blob.
        const envelope = unwrapMediaEnvelope(e2ee!.wrappedKey, alice.publicKey, bob.privateKey);
        expect(envelope.meta).toEqual({ fileName: 'photo.jpg', mimeType: 'image/jpeg', size: ORIGINAL.length });
        expect(decryptMediaBytes(encryptedBytes, envelope.key)).toEqual(ORIGINAL);
    });

    it('never touches the staged plaintext file', async () => {
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: bob.publicKey });

        await encryptOutgoingMediaFile(BOB_ID, STAGED_URI, 'photo.jpg');

        expect(mockFs.files.get(STAGED_URI)).toEqual(ORIGINAL); // byte-identical
    });

    it('cleanup() deletes the temp copy and is safe to call twice (finally contract)', async () => {
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: bob.publicKey });

        const e2ee = await encryptOutgoingMediaFile(BOB_ID, STAGED_URI, 'photo.jpg');
        expect(findTempUploadUris()).toHaveLength(1);

        e2ee!.cleanup();
        expect(findTempUploadUris()).toHaveLength(0);
        expect(mockFs.files.has(STAGED_URI)).toBe(true); // staged file survives

        expect(() => e2ee!.cleanup()).not.toThrow(); // idempotent — sendFile finally
    });

    it('uses fresh keys per upload — same file twice yields different ciphertext', async () => {
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: bob.publicKey });

        const first = await encryptOutgoingMediaFile(BOB_ID, STAGED_URI, 'photo.jpg');
        const second = await encryptOutgoingMediaFile(BOB_ID, STAGED_URI, 'photo.jpg');

        expect(first!.wrappedKey).not.toBe(second!.wrappedKey);
        expect(mockFs.files.get(first!.encryptedUri)).not.toEqual(
            mockFs.files.get(second!.encryptedUri),
        );
    });

    it('blocks when the recipient has no key', async () => {
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: null });

        await expect(encryptOutgoingMediaFile(BOB_ID, STAGED_URI, 'photo.jpg'))
            .rejects.toThrow(/strict media encryption blocked/);
        expect(findTempUploadUris()).toHaveLength(0); // no orphan temp file
    });

    it('blocks when this device has no keypair', async () => {
        mockIdentity.privateKey = null;
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: bob.publicKey });

        await expect(encryptOutgoingMediaFile(BOB_ID, STAGED_URI, 'photo.jpg'))
            .rejects.toThrow(/strict media encryption blocked/);
    });

    it('blocks when the staged file cannot be read (no plaintext upload)', async () => {
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: bob.publicKey });
        mockFs.files.delete(STAGED_URI); // simulate missing/unreadable staged file

        await expect(encryptOutgoingMediaFile(BOB_ID, STAGED_URI, 'photo.jpg'))
            .rejects.toThrow(/strict media encryption blocked/);
        expect(findTempUploadUris()).toHaveLength(0);
    });
});

// ── 2. Incoming pipeline: downloadIncomingFile (native) ─────────────────────

describe('downloadIncomingFile (native download + in-memory decrypt)', () => {
    const ORIGINAL = makeDummyFileBytes(32 * 1024); // 32 KB dummy image

    /** Bob's sender side: encrypted blob on the relay + wrapped key for Alice. */
    function makeEncryptedUpload() {
        const mediaKey = generateMediaKey();
        const encryptedBlob = encryptMediaBytes(ORIGINAL, mediaKey);
        const wrappedKey = wrapMediaEnvelope(
            mediaKey,
            { fileName: 'photo.jpg', mimeType: 'image/jpeg', size: ORIGINAL.length },
            alice.publicKey,
            bob.privateKey,
        );
        return { encryptedBlob, wrappedKey };
    }

    it('decrypts the downloaded blob in memory and writes PLAINTEXT to disk', async () => {
        const { encryptedBlob, wrappedKey } = makeEncryptedUpload();
        const msg = makeIncomingMediaMessage({
            message_id: 'msg_dl_1',
            content: wrappedKey,
            file_name: 'opaque.enc',
            file_mime_type: 'application/octet-stream',
        });
        xhrState.script = { status: 200, body: encryptedBlob };

        const localUri = await downloadIncomingFile(msg);

        expect(localUri).toBe('file:///document/chatFiles/msg_dl_1.jpg');
        expect(msg.file_name).toBe('photo.jpg');
        expect(msg.file_mime_type).toBe('image/jpeg');
        expect(mockFs.files.get(localUri!)).toEqual(ORIGINAL); // decrypted bytes
        // The encrypted form never reaches disk
        expect([...mockFs.files.values()].some((b) => b.length === encryptedBlob.length)).toBe(false);
    });

    it('tampered blob → rejects (download failure, NO ACK) and writes nothing', async () => {
        const { encryptedBlob, wrappedKey } = makeEncryptedUpload();
        const tampered = encryptedBlob.slice();
        tampered[tampered.length - 1] ^= 0xff; // corrupt the MAC region
        const msg = makeIncomingMediaMessage({ message_id: 'msg_dl_2', content: wrappedKey });
        xhrState.script = { status: 200, body: tampered };

        await expect(downloadIncomingFile(msg)).rejects.toThrow();
        expect(mockFs.files.has('file:///document/chatFiles/msg_dl_2.jpg')).toBe(false);
    });

    it('failed decrypt does not poison retries — a later good download succeeds', async () => {
        const { encryptedBlob, wrappedKey } = makeEncryptedUpload();
        const tampered = encryptedBlob.slice();
        tampered[20] ^= 0xff;
        const msg = makeIncomingMediaMessage({ message_id: 'msg_dl_3', content: wrappedKey });

        xhrState.script = { status: 200, body: tampered };
        await expect(downloadIncomingFile(msg)).rejects.toThrow();

        xhrState.script = { status: 200, body: encryptedBlob }; // relay retained the file
        const localUri = await downloadIncomingFile(msg);

        expect(localUri).toBe('file:///document/chatFiles/msg_dl_3.jpg');
        expect(mockFs.files.get(localUri!)).toEqual(ORIGINAL);
        expect(xhrState.sendCount).toBe(2);
    });

    it('missing local private key → rejects (never writes garbage)', async () => {
        const { encryptedBlob, wrappedKey } = makeEncryptedUpload();
        mockIdentity.privateKey = null;
        const msg = makeIncomingMediaMessage({ message_id: 'msg_dl_4', content: wrappedKey });
        xhrState.script = { status: 200, body: encryptedBlob };

        await expect(downloadIncomingFile(msg)).rejects.toThrow();
        expect(mockFs.files.has('file:///document/chatFiles/msg_dl_4.jpg')).toBe(false);
    });

    it('legacy plaintext media (no E2EE) is written through unchanged', async () => {
        const msg = makeIncomingMediaMessage({
            message_id: 'msg_dl_5',
            content: '', // no caption / no wrapped key
            sender_e2ee_public_key: null,
        });
        xhrState.script = { status: 200, body: ORIGINAL };

        const localUri = await downloadIncomingFile(msg);

        expect(localUri).toBe('file:///document/chatFiles/msg_dl_5.jpg');
        expect(mockFs.files.get(localUri!)).toEqual(ORIGINAL);
    });

    it('own media echo (is_from_me) IS decrypted via the recipient registry key', async () => {
        // Sender-side refresh: Alice re-downloads her OWN `.enc` upload. The
        // wrapped key was sealed with (bobPub, alicePriv) — the recipient key
        // from the registry + her own private key unwrap it (crypto_box is
        // bidirectional). Ciphertext must never be written as the local copy.
        const original = makeDummyFileBytes(8 * 1024);
        const mediaKey = generateMediaKey();
        const encryptedBlob = encryptMediaBytes(original, mediaKey);
        const wrappedKey = wrapMediaEnvelope(
            mediaKey,
            { fileName: 'photo.jpg', mimeType: 'image/jpeg', size: original.length },
            bob.publicKey,
            alice.privateKey,
        );
        mockRegistry.set(BOB_ID, bob.publicKey);
        const msg = makeIncomingMediaMessage({
            message_id: 'msg_dl_6',
            content: wrappedKey,
            is_from_me: true,
            recipient_id: BOB_ID,
            sender_e2ee_public_key: alice.publicKey, // own key — NOT the unwrap key
        });
        xhrState.script = { status: 200, body: encryptedBlob };

        const localUri = await downloadIncomingFile(msg);

        expect(mockFs.files.get(localUri!)).toEqual(original);
    });

    it('own media echo with no resolvable recipient key → rejects (never writes ciphertext)', async () => {
        const original = makeDummyFileBytes(4 * 1024);
        const mediaKey = generateMediaKey();
        const encryptedBlob = encryptMediaBytes(original, mediaKey);
        const wrappedKey = wrapMediaEnvelope(
            mediaKey,
            { fileName: 'photo.jpg', mimeType: 'image/jpeg', size: original.length },
            bob.publicKey,
            alice.privateKey,
        );
        mockGetE2EEKey.mockRejectedValue(new Error('offline')); // registry miss + endpoint down
        const msg = makeIncomingMediaMessage({
            message_id: 'msg_dl_6b',
            content: wrappedKey,
            is_from_me: true,
            recipient_id: BOB_ID,
        });
        xhrState.script = { status: 200, body: encryptedBlob };

        await expect(downloadIncomingFile(msg)).rejects.toThrow();
        expect(mockFs.files.has('file:///document/chatFiles/msg_dl_6b.jpg')).toBe(false);
    });

    it('HTTP error → rejects without writing; decrypt never runs', async () => {
        const { wrappedKey } = makeEncryptedUpload();
        const msg = makeIncomingMediaMessage({ message_id: 'msg_dl_7', content: wrappedKey });
        xhrState.script = { status: 401, body: new Uint8Array(0) };

        await expect(downloadIncomingFile(msg)).rejects.toThrow('HTTP 401');
        expect(mockFs.files.has('file:///document/chatFiles/msg_dl_7.jpg')).toBe(false);
    });

    it('skips non-media messages and messages without download_url', async () => {
        const text = makeIncomingMediaMessage({ message_type: 'text' });
        const noUrl = makeIncomingMediaMessage({ download_url: undefined });

        await expect(downloadIncomingFile(text)).resolves.toBeNull();
        await expect(downloadIncomingFile(noUrl)).resolves.toBeNull();
        expect(xhrState.sendCount).toBe(0);
    });

    it('deduplicates concurrent downloads for the same message (single XHR)', async () => {
        const { encryptedBlob, wrappedKey } = makeEncryptedUpload();
        const msg = makeIncomingMediaMessage({ message_id: 'msg_dl_8', content: wrappedKey });
        xhrState.script = { status: 200, body: encryptedBlob };

        const [a, b] = await Promise.all([downloadIncomingFile(msg), downloadIncomingFile(msg)]);

        expect(a).toBe(b);
        expect(xhrState.sendCount).toBe(1);
    });

    it('is idempotent — already-downloaded file short-circuits without network', async () => {
        const { encryptedBlob, wrappedKey } = makeEncryptedUpload();
        const msg = makeIncomingMediaMessage({ message_id: 'msg_dl_9', content: wrappedKey });
        xhrState.script = { status: 200, body: encryptedBlob };

        const first = await downloadIncomingFile(msg);
        const second = await downloadIncomingFile(msg);

        expect(second).toBe(first);
        expect(xhrState.sendCount).toBe(1); // second call never hit the network
    });
});

// ── 3. Full sender → relay → recipient round trip (pipeline composition) ────

describe('full media round trip (Alice uploads → relay → Alice-as-recipient downloads)', () => {
    it('upload prep output is directly consumable by the download pipeline', async () => {
        // Alice prepares an encrypted upload FOR BOB
        const original = makeDummyFileBytes(8 * 1024);
        mockFs.files.set(STAGED_URI, original.slice());
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: bob.publicKey });

        const e2ee = await encryptOutgoingMediaFile(BOB_ID, STAGED_URI, 'photo.jpg');
        const relayBlob = mockFs.files.get(e2ee!.encryptedUri)!.slice(); // what the server stores
        e2ee!.cleanup();

        // Relay delivers to BOB's device: simulate by flipping the local identity
        // to Bob (his Secure Store) — the message carries Alice's public key and
        // the wrapped key as content (caption → content server-side).
        mockIdentity.privateKey = bob.privateKey;
        const msg = makeIncomingMediaMessage({
            message_id: 'msg_rt_1',
            content: e2ee!.wrappedKey,
            sender_e2ee_public_key: alice.publicKey,
        });
        xhrState.script = { status: 200, body: relayBlob };

        const localUri = await downloadIncomingFile(msg);

        expect(mockFs.files.get(localUri!)).toEqual(original); // byte-exact across the pipeline
    });
});
