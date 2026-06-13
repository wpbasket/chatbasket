/**
 * Dummy-data E2EE tests — drives the REAL e2ee.crypto / e2ee.service code with
 * fake identities (Alice = this device, Bob = remote user) and fake payloads.
 *
 * The native `react-native-libsodium` JSI binding cannot load under Jest, so it
 * is mocked with the API-compatible `libsodium-wrappers-sumo` (same upstream
 * libsodium compiled to WASM/asm.js) — the cryptography itself is genuine.
 *
 * Validates:
 * 1. Identity keypair format (44-char standard Base64 with padding — backend contract)
 * 2. Text wire format round trip: base64(nonce24 || crypto_box ciphertext), incl. unicode/emoji
 * 3. encryptOutgoingText: registry hit, get-e2ee-key fallback, plaintext degradation
 * 4. processIncomingMessages: decrypt, "" sentinel on tamper/wrong-key/missing-key,
 *    is_from_me blanking, plaintext pass-through (idempotency), registry sync,
 *    .enc media metadata normalization
 * 5. processIncomingChats: preview decrypt, own-preview blank, registry sync
 * 6. Media envelope: secretbox bytes + wrapped key round trip; tamper → throw (no ACK)
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

// In-memory persistent key registry (user_keys table stand-in)
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

// ── Imports (after mocks) ───────────────────────────────────────────────────

import {
    E2EE_FAILED_TO_LOAD_TEXT,
    decryptText,
    encryptMediaBytes,
    encryptText,
    generateIdentityKeypair,
    generateMediaKey,
    isEncryptedContent,
    isValidPublicKeyB64,
    sodiumReady,
    wrapMediaEnvelope,
    type E2EEKeypairB64,
} from '@/lib/personalLib/e2ee/e2ee.crypto';
import {
    decryptIncomingMediaBytes,
    encryptOutgoingText,
    isEncryptedMediaMessage,
    processIncomingChats,
    processIncomingMessages,
    resolveMediaUnwrapKey,
    resolveRecipientPublicKey,
    resolveRecipientPublicKeyStrict,
} from '@/lib/personalLib/e2ee/e2ee.service';
import type { ChatEntry, MessageEntry } from '@/lib/personalLib/models/personal.model.chat';

// ── Dummy data helpers ──────────────────────────────────────────────────────

const ALICE_ID = 'alice-uuid-0001';
const BOB_ID = 'bob-uuid-0002';
const STANDARD_B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

let alice: E2EEKeypairB64; // this device
let bob: E2EEKeypairB64;   // remote user

function makeMessage(overrides: Partial<MessageEntry> = {}): MessageEntry {
    return {
        message_id: `msg_${Math.random().toString(36).slice(2, 10)}`,
        chat_id: 'chat-1',
        content: 'Hello',
        message_type: 'text',
        is_from_me: false,
        status: 'delivered',
        created_at: new Date().toISOString(),
        sender_e2ee_public_key: bob.publicKey,
        ...overrides,
    } as MessageEntry;
}

function makeChat(overrides: Partial<ChatEntry> = {}): ChatEntry {
    return {
        chat_id: 'chat-1',
        other_user_id: BOB_ID,
        other_user_name: 'Bob',
        last_message_type: 'text',
        last_message_content: 'Hello',
        last_message_is_from_me: false,
        other_user_e2ee_public_key: bob.publicKey,
        ...overrides,
    } as ChatEntry;
}

function wrapIncomingMediaForAlice(
    mediaKey: Uint8Array,
    meta = { fileName: 'vacation-photo.jpg', mimeType: 'image/jpeg', size: 64 * 1024 },
): string {
    return wrapMediaEnvelope(mediaKey, meta, alice.publicKey, bob.privateKey);
}

function wrapOwnMediaForBob(
    mediaKey: Uint8Array,
    meta = { fileName: 'vacation-photo.jpg', mimeType: 'image/jpeg', size: 64 * 1024 },
): string {
    return wrapMediaEnvelope(mediaKey, meta, bob.publicKey, alice.privateKey);
}

/** Flips one ciphertext byte inside a base64(nonce||ciphertext) payload. */
function tamper(encoded: string): string {
    const sodium = require('libsodium-wrappers-sumo');
    const bytes = sodium.from_base64(encoded, 1);
    bytes[bytes.length - 1] ^= 0xff; // corrupt the MAC region
    return sodium.to_base64(bytes, 1);
}

beforeAll(async () => {
    await sodiumReady();
    alice = generateIdentityKeypair();
    bob = generateIdentityKeypair();
});

beforeEach(() => {
    mockRegistry.clear();
    mockGetE2EEKey.mockReset();
    mockIdentity.privateKey = alice.privateKey;
});

// ── 1. Identity keypair format (backend contract) ───────────────────────────

describe('identity keypair (dummy identities)', () => {
    it('generates 44-char standard-Base64 public keys with padding', () => {
        expect(alice.publicKey).toHaveLength(44);
        expect(alice.publicKey.endsWith('=')).toBe(true); // 32 bytes → 43 chars + '='
        expect(STANDARD_B64_RE.test(alice.publicKey)).toBe(true);
        expect(alice.publicKey).not.toContain('-'); // no URL-safe alphabet
        expect(alice.publicKey).not.toContain('_');
        expect(isValidPublicKeyB64(alice.publicKey)).toBe(true);
        expect(isValidPublicKeyB64(bob.publicKey)).toBe(true);
    });

    it('rejects malformed keys', () => {
        expect(isValidPublicKeyB64(null)).toBe(false);
        expect(isValidPublicKeyB64('')).toBe(false);
        expect(isValidPublicKeyB64('too-short')).toBe(false);
        expect(isValidPublicKeyB64(alice.publicKey.replace('=', '!'))).toBe(false);
        expect(isValidPublicKeyB64(alice.publicKey.slice(0, 43))).toBe(false);
    });
});

// ── 2. Text wire format round trip ──────────────────────────────────────────

describe('text encryption round trip (Alice ⇄ Bob)', () => {
    const SAMPLES = [
        'Hello Bob! This is a dummy test message.',
        'Unicode: привет, नमस्ते, 你好, مرحبا',
        'Emoji: 👋🔐🎉 multi-byte chars',
        'a', // 1-char message
        'newlines\nand\ttabs and  spaces',
    ];

    it.each(SAMPLES)('round-trips %j', (plaintext) => {
        const wire = encryptText(plaintext, bob.publicKey, alice.privateKey);

        // Wire format: standard Base64, structurally "encrypted"
        expect(STANDARD_B64_RE.test(wire)).toBe(true);
        expect(isEncryptedContent(wire)).toBe(true);
        // Leakage check only meaningful for non-trivial plaintexts — a single
        // char can legitimately appear inside random Base64 output.
        if (plaintext.length >= 4) {
            expect(wire).not.toContain(plaintext);
        }

        // Bob decrypts with his private key + Alice's public key
        const decrypted = decryptText(wire, alice.publicKey, bob.privateKey);
        expect(decrypted).toBe(plaintext);
    });

    it('produces a fresh nonce per encryption (no ciphertext reuse)', () => {
        const a = encryptText('same message', bob.publicKey, alice.privateKey);
        const b = encryptText('same message', bob.publicKey, alice.privateKey);
        expect(a).not.toBe(b);
    });

    it('fails decryption with the wrong key (Eve cannot read)', () => {
        const eve = generateIdentityKeypair();
        const wire = encryptText('secret for Bob', bob.publicKey, alice.privateKey);
        expect(() => decryptText(wire, alice.publicKey, eve.privateKey)).toThrow();
    });

    it('treats normal plaintext as not encrypted', () => {
        expect(isEncryptedContent('Hello, how are you?')).toBe(false);
        expect(isEncryptedContent('')).toBe(false);
        expect(isEncryptedContent(null)).toBe(false);
    });
});

// ── 3. Outgoing send path ───────────────────────────────────────────────────

describe('encryptOutgoingText (send-time hook)', () => {
    it('encrypts using the registry key; Bob can decrypt', async () => {
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: bob.publicKey });

        const wire = await encryptOutgoingText(BOB_ID, 'queued plaintext message');

        expect(wire).not.toBe('queued plaintext message');
        expect(isEncryptedContent(wire)).toBe(true);
        expect(mockGetE2EEKey).not.toHaveBeenCalled(); // registry-first: cached key used, no backend call

        expect(decryptText(wire, alice.publicKey, bob.privateKey)).toBe('queued plaintext message');
    });

    it('falls back to get-e2ee-key endpoint and persists the result', async () => {
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: bob.publicKey });

        const wire = await encryptOutgoingText(BOB_ID, 'fallback path message');

        expect(mockGetE2EEKey).toHaveBeenCalledWith(BOB_ID);
        expect(mockRegistry.get(BOB_ID)).toBe(bob.publicKey); // persisted to registry
        expect(decryptText(wire, alice.publicKey, bob.privateKey)).toBe('fallback path message');
    });

    it('blocks when the recipient has no key', async () => {
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: null });

        await expect(encryptOutgoingText(BOB_ID, 'plain message')).rejects.toThrow(/strict text encryption blocked/);
        expect(mockRegistry.get(BOB_ID)).toBeNull(); // "no E2EE" recorded
    });

    it('blocks when this device has no keypair', async () => {
        mockIdentity.privateKey = null;
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: bob.publicKey });

        await expect(encryptOutgoingText(BOB_ID, 'no local key')).rejects.toThrow(/strict text encryption blocked/);
    });

    it('resolveRecipientPublicKey survives endpoint failure (returns null)', async () => {
        mockGetE2EEKey.mockRejectedValue(new Error('network down'));
        await expect(resolveRecipientPublicKey(BOB_ID)).resolves.toBeNull();
    });
});

// ── 3b. resolveRecipientPublicKeyStrict — registry-first, backend-fallback ──

describe('resolveRecipientPublicKeyStrict (registry-first key resolution)', () => {
    it('registry HIT: returns cached key without calling the backend', async () => {
        mockRegistry.set(BOB_ID, bob.publicKey);

        const result = await resolveRecipientPublicKeyStrict(BOB_ID);

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.publicKey).toBe(bob.publicKey);
        expect(mockGetE2EEKey).not.toHaveBeenCalled(); // no network call
    });

    it('registry NULL: user explicitly has no E2EE — returns recipient_key_unavailable', async () => {
        mockRegistry.set(BOB_ID, null); // server previously confirmed "no E2EE"

        const result = await resolveRecipientPublicKeyStrict(BOB_ID);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('recipient_key_unavailable');
        expect(mockGetE2EEKey).not.toHaveBeenCalled(); // no network call
    });

    it('registry MISS: falls back to backend and persists the result', async () => {
        // Registry has no entry for BOB_ID (undefined) — triggers backend fetch
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: bob.publicKey });

        const result = await resolveRecipientPublicKeyStrict(BOB_ID);

        expect(result.ok).toBe(true);
        if (result.ok) expect(result.publicKey).toBe(bob.publicKey);
        expect(mockGetE2EEKey).toHaveBeenCalledWith(BOB_ID); // backend called
        expect(mockRegistry.get(BOB_ID)).toBe(bob.publicKey); // persisted to registry
    });

    it('registry MISS + backend returns null — returns recipient_key_unavailable', async () => {
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: null });

        const result = await resolveRecipientPublicKeyStrict(BOB_ID);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('recipient_key_unavailable');
        expect(mockRegistry.get(BOB_ID)).toBeNull(); // "no E2EE" persisted
    });

    it('registry MISS + backend failure — returns recipient_key_fetch_failed', async () => {
        mockGetE2EEKey.mockRejectedValue(new Error('offline'));

        const result = await resolveRecipientPublicKeyStrict(BOB_ID);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('recipient_key_fetch_failed');
    });

    it('empty recipientId — returns invalid_recipient', async () => {
        const result = await resolveRecipientPublicKeyStrict('');

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('invalid_recipient');
        expect(mockGetE2EEKey).not.toHaveBeenCalled();
    });
});

// ── 4. Incoming ingress processor ───────────────────────────────────────────

describe('processIncomingMessages (shared ingress processor)', () => {
    const resolveSenderId = () => BOB_ID;

    it('decrypts an incoming encrypted message and syncs the registry', async () => {
        const wire = encryptText('incoming dummy text 🎯', alice.publicKey, bob.privateKey);
        const msg = makeMessage({ content: wire });

        await processIncomingMessages([msg], { resolveSenderId });

        expect(msg.content).toBe('incoming dummy text 🎯');
        expect(mockRegistry.get(BOB_ID)).toBe(bob.publicKey); // sender key persisted
    });

    it('processes a mixed dummy batch like a real history load', async () => {
        const enc1 = encryptText('first encrypted', alice.publicKey, bob.privateKey);
        const enc2 = encryptText('second encrypted', alice.publicKey, bob.privateKey);
        const batch = [
            makeMessage({ content: enc1 }),
            makeMessage({ content: 'legacy plaintext stays intact', created_at: '2026-06-11T23:59:59.000Z' }),
            makeMessage({ content: enc2 }),
            makeMessage({ content: 'Hi!', sender_e2ee_public_key: null }),
        ];

        await processIncomingMessages(batch, { resolveSenderId });

        expect(batch[0].content).toBe('first encrypted');
        expect(batch[1].content).toBe('legacy plaintext stays intact');
        expect(batch[2].content).toBe('second encrypted');
        expect(batch[3].content).toBe('Hi!');
    });

    it('tampered ciphertext → "" sentinel, never ciphertext', async () => {
        const wire = encryptText('will be corrupted', alice.publicKey, bob.privateKey);
        const msg = makeMessage({ content: tamper(wire) });

        await processIncomingMessages([msg], { resolveSenderId });

        expect(msg.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('missing sender key → "" sentinel', async () => {
        const wire = encryptText('no sender key carried', alice.publicKey, bob.privateKey);
        const msg = makeMessage({ content: wire, sender_e2ee_public_key: null });

        await processIncomingMessages([msg], { resolveSenderId });

        expect(msg.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('no local private key → "" sentinel', async () => {
        const wire = encryptText('device lost its key', alice.publicKey, bob.privateKey);
        mockIdentity.privateKey = null;
        const msg = makeMessage({ content: wire });

        await processIncomingMessages([msg]);

        expect(msg.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('own encrypted echo (is_from_me) → "" (Phase 1 multi-device limitation)', async () => {
        const wire = encryptText('own message echo', bob.publicKey, alice.privateKey);
        const msg = makeMessage({ content: wire, is_from_me: true });

        await processIncomingMessages([msg]);

        expect(msg.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('is idempotent — re-processing already-decrypted content is a no-op', async () => {
        const wire = encryptText('process me twice', alice.publicKey, bob.privateKey);
        const msg = makeMessage({ content: wire });

        await processIncomingMessages([msg], { resolveSenderId });
        const firstPass = msg.content;
        await processIncomingMessages([msg], { resolveSenderId, allowPersistedPlaintext: true });

        expect(msg.content).toBe(firstPass);
        expect(msg.content).toBe('process me twice');
    });

    it('fails post-cutoff plaintext from an E2EE-capable sender on server/WS paths', async () => {
        const msg = makeMessage({
            content: 'server plaintext must not render',
            created_at: '2026-06-12T00:00:01.000Z',
            sender_e2ee_public_key: bob.publicKey,
        });

        await processIncomingMessages([msg], { resolveSenderId });

        expect(msg.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('allows local-storage replay of already-decrypted plaintext with persisted sender key metadata', async () => {
        const msg = makeMessage({
            content: 'already decrypted local plaintext',
            created_at: '2026-06-12T00:00:01.000Z',
            sender_e2ee_public_key: bob.publicKey,
        });

        await processIncomingMessages([msg], { resolveSenderId, allowPersistedPlaintext: true });

        expect(msg.content).toBe('already decrypted local plaintext');
    });

    it('keeps local-storage replay fail-closed when sender key metadata is missing', async () => {
        mockRegistry.set(BOB_ID, bob.publicKey);
        const msg = makeMessage({
            content: 'local plaintext without decrypt proof',
            created_at: '2026-06-12T00:00:01.000Z',
            sender_e2ee_public_key: undefined,
        });

        await processIncomingMessages([msg], { resolveSenderId, allowPersistedPlaintext: true });

        expect(msg.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('hydrates media metadata from encrypted content and keeps content encrypted', async () => {
        const mediaKey = generateMediaKey();
        const wrappedKey = wrapIncomingMediaForAlice(mediaKey, {
            fileName: 'vacation-photo.jpg',
            mimeType: 'image/jpeg',
            size: 12345,
        });
        const msg = makeMessage({
            message_type: 'image',
            content: wrappedKey,
            file_name: 'opaque.enc',
            file_mime_type: 'application/octet-stream',
            file_size: 99999,
        });

        await processIncomingMessages([msg], { resolveSenderId });

        expect(msg.file_name).toBe('vacation-photo.jpg');
        expect(msg.file_mime_type).toBe('image/jpeg');
        expect(msg.file_size).toBe(12345);
        expect(msg.content).toBe(wrappedKey); // untouched — needed at download time
    });
});

// ── 5. Chat list previews ───────────────────────────────────────────────────

describe('processIncomingChats (chat list previews)', () => {
    it('decrypts an incoming encrypted preview and syncs the registry', async () => {
        const wire = encryptText('preview text 📬', alice.publicKey, bob.privateKey);
        const chat = makeChat({ last_message_content: wire });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe('preview text 📬');
        expect(mockRegistry.get(BOB_ID)).toBe(bob.publicKey);
    });

    it('blanks own encrypted preview (sender cannot decrypt own crypto_box)', async () => {
        const wire = encryptText('my own preview', bob.publicKey, alice.privateKey);
        const chat = makeChat({ last_message_content: wire, last_message_is_from_me: true });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('leaves plaintext previews untouched and records "no key" users', async () => {
        const chat = makeChat({
            last_message_content: 'plain preview',
            other_user_e2ee_public_key: null,
        });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe('plain preview');
        expect(mockRegistry.get(BOB_ID)).toBeNull();
    });

    it('tampered preview → "" sentinel', async () => {
        const wire = encryptText('corrupt me', alice.publicKey, bob.privateKey);
        const chat = makeChat({ last_message_content: tamper(wire) });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });
});

// ── 6. Media envelope encryption ────────────────────────────────────────────

describe('media envelope (secretbox bytes + crypto_box key wrap)', () => {
    /** Dummy "file": deterministic pseudo-binary bytes (fake JPEG-ish payload). */
    function makeDummyFileBytes(size: number): Uint8Array {
        const bytes = new Uint8Array(size);
        bytes.set([0xff, 0xd8, 0xff, 0xe0]); // JPEG SOI/APP0 magic
        for (let i = 4; i < size; i++) bytes[i] = (i * 31 + 7) % 256;
        return bytes;
    }

    it('round-trips dummy media bytes end to end (Bob sends → Alice downloads)', () => {
        const original = makeDummyFileBytes(64 * 1024); // 64 KB dummy image

        // Sender side (Bob): fresh symmetric key, encrypt bytes, wrap key for Alice
        const mediaKey = generateMediaKey();
        const encryptedBlob = encryptMediaBytes(original, mediaKey);
        const wrappedKey = wrapIncomingMediaForAlice(mediaKey);

        expect(encryptedBlob.length).toBe(original.length + 24 + 16); // nonce + MAC overhead
        expect(isEncryptedContent(wrappedKey)).toBe(true);

        // Receiver side (Alice): message carries the wrapped key in content
        const msg = makeMessage({
            message_type: 'image',
            content: wrappedKey,
            file_name: 'vacation-photo.jpg',
            file_mime_type: 'image/jpeg',
        });
        expect(isEncryptedMediaMessage(msg)).toBe(true);

        const decrypted = decryptIncomingMediaBytes(msg, encryptedBlob);
        expect(decrypted).toEqual(original);
        expect(Array.from(decrypted.slice(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    });

    it('tampered media bytes → throws (counts as download failure, no ACK)', () => {
        const original = makeDummyFileBytes(1024);
        const mediaKey = generateMediaKey();
        const encryptedBlob = encryptMediaBytes(original, mediaKey);
        const wrappedKey = wrapIncomingMediaForAlice(mediaKey);

        encryptedBlob[encryptedBlob.length - 1] ^= 0xff; // corrupt ciphertext

        const msg = makeMessage({ message_type: 'image', content: wrappedKey });
        expect(() => decryptIncomingMediaBytes(msg, encryptedBlob)).toThrow();
    });

    it('missing local private key → throws (never silently writes garbage)', () => {
        const mediaKey = generateMediaKey();
        const encryptedBlob = encryptMediaBytes(makeDummyFileBytes(256), mediaKey);
        const wrappedKey = wrapIncomingMediaForAlice(mediaKey);

        mockIdentity.privateKey = null;
        const msg = makeMessage({ message_type: 'file', content: wrappedKey });
        expect(() => decryptIncomingMediaBytes(msg, encryptedBlob)).toThrow();
    });

    it('own media message IS encrypted-for-me too — unwraps with the recipient key', async () => {
        // crypto_box is bidirectional: Alice's own upload (wrapped for Bob with
        // her private key) unwraps on her device with Bob's PUBLIC key.
        const original = makeDummyFileBytes(2048);
        const mediaKey = generateMediaKey();
        const encryptedBlob = encryptMediaBytes(original, mediaKey);
        const wrappedKey = wrapOwnMediaForBob(mediaKey);
        mockRegistry.set(BOB_ID, bob.publicKey);

        const msg = makeMessage({
            message_type: 'image',
            is_from_me: true,
            recipient_id: BOB_ID,
            content: wrappedKey,
            sender_e2ee_public_key: alice.publicKey, // own key — NOT the unwrap key
        });

        expect(isEncryptedMediaMessage(msg)).toBe(true);
        const unwrapKey = await resolveMediaUnwrapKey(msg);
        expect(unwrapKey).toBe(bob.publicKey);
        expect(decryptIncomingMediaBytes(msg, encryptedBlob, unwrapKey)).toEqual(original);
    });

    it('plaintext media caption is never treated as encrypted', () => {
        const msg = makeMessage({
            message_type: 'image',
            is_from_me: true,
            content: 'nice sunset!',
        });
        expect(isEncryptedMediaMessage(msg)).toBe(false);
    });
});
