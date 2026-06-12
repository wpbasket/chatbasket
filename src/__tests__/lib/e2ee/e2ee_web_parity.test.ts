/**
 * Web-parity E2EE tests — Platform.OS = 'web', driving the REAL e2ee.keys +
 * e2ee.service code. Web behaves exactly like native — INCLUDING the key
 * generation rule: the keypair is generated ONLY on the PRIMARY device
 * (`authState.isPrimary === true`); secondary/unknown devices hold keys but
 * never create them, until the Phase 2 WebRTC key sync delivers the shared
 * identity key (`importIdentityKeypair`).
 *
 * The native `react-native-libsodium` JSI binding cannot load under Jest, so it
 * is mocked with the API-compatible `libsodium-wrappers-sumo` (same upstream
 * libsodium compiled to WASM/asm.js) — the cryptography itself is genuine.
 *
 * Validates:
 * 1. Key lifecycle: initializeE2EEKeys generates + uploads ONLY when primary;
 *    secondary/unknown devices skip generation; in-session promotion triggers
 *    generation; no regeneration on later launches; vault load; upload flag
 *    retry (primary-gated — a demoted device never overwrites the primary's
 *    key); the Phase 2 import hook; logout deletes from the vault.
 * 2. Outgoing text: plaintext without keys; encrypted exactly like native with
 *    keys (registry hit + get-e2ee-key fallback).
 * 3. Incoming text: decrypt with keys; "" blanking without keys (no Base64
 *    garbage); is_from_me blanking; plaintext pass-through; registry sync.
 * 4. Chat previews: decrypt + blank parity.
 * 5. Media: blob envelope round trip (encrypt → unwrap → byte-exact decrypt),
 *    degradation to null, file-URI variant stays native-only, incoming
 *    media flagging + in-memory decrypt.
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
    Platform: { OS: 'web' },
}));

// In-memory persistent key registry (user_keys IndexedDB store stand-in)
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

// Profile API: get-e2ee-key fallback + update-e2ee-key upload
const mockGetE2EEKey = jest.fn();
const mockUpdateE2EEKey = jest.fn();
jest.mock('@/lib/personalLib/profileApi/personal.api.profile', () => ({
    __esModule: true,
    PersonalProfileApi: {
        getE2EEKey: (...args: any[]) => mockGetE2EEKey(...args),
        updateE2EEKey: (...args: any[]) => mockUpdateE2EEKey(...args),
    },
}));

// Encrypted AppStorage web vault (secure-e2ee-storage stand-in)
const mockVault = new Map<string, string>();
jest.mock('@/lib/storage/storage.wrapper', () => ({
    __esModule: true,
    AppStorage: {
        createSecure: jest.fn(async () => ({
            get: jest.fn(async (key: string) => (mockVault.has(key) ? mockVault.get(key) : null)),
            set: jest.fn(async (key: string, value: string) => {
                mockVault.set(key, value);
            }),
            remove: jest.fn(async (key: string) => {
                mockVault.delete(key);
            }),
        })),
    },
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import {
    E2EE_FAILED_TO_LOAD_TEXT,
    decryptMediaBytes,
    decryptText,
    encryptMediaBytes,
    encryptText,
    generateIdentityKeypair,
    generateMediaKey,
    isEncryptedContent,
    isValidPublicKeyB64,
    sodiumReady,
    unwrapMediaEnvelope,
    wrapMediaEnvelope,
    type E2EEKeypairB64,
} from '@/lib/personalLib/e2ee/e2ee.crypto';
import {
    deleteLocalE2EEKeys,
    getMyPrivateKey,
    getMyPublicKey,
    importIdentityKeypair,
    initializeE2EEKeys,
    isE2EEReady,
    uploadPublicKeyIfNeeded,
} from '@/lib/personalLib/e2ee/e2ee.keys';
import { authState } from '@/state/auth/state.auth';
import {
    decryptIncomingMediaBytes,
    encryptOutgoingMediaBlob,
    encryptOutgoingMediaFile,
    encryptOutgoingText,
    isEncryptedMediaMessage,
    processIncomingChats,
    processIncomingMessages,
    resolveMediaUnwrapKey,
} from '@/lib/personalLib/e2ee/e2ee.service';
import type { ChatEntry, MessageEntry } from '@/lib/personalLib/models/personal.model.chat';

// ── Dummy data helpers ──────────────────────────────────────────────────────

const ALICE_ID = 'alice-uuid-0001';
const BOB_ID = 'bob-uuid-0002';

let alice: E2EEKeypairB64; // this web device (keys arrive via key sync)
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

/**
 * Arms this web device with Alice's identity. Uses the Phase 2 key-sync entry
 * point for determinism (known keypair) — works regardless of primary status,
 * exactly like holding previously persisted keys.
 */
async function armDeviceWithKeySync(): Promise<void> {
    const ok = await importIdentityKeypair(alice.privateKey, alice.publicKey);
    expect(ok).toBe(true);
}

function mockBackendKeys(): void {
    mockGetE2EEKey.mockImplementation(async (userId: string) => ({
        e2ee_public_key: userId === BOB_ID ? bob.publicKey : alice.publicKey,
    }));
}

/** Waits for the promotion watcher's fire-and-forget init to settle. */
async function waitForE2EEReady(attempts = 50): Promise<void> {
    for (let i = 0; i < attempts && !isE2EEReady(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

beforeAll(async () => {
    await sodiumReady();
    alice = generateIdentityKeypair();
    bob = generateIdentityKeypair();
});

beforeEach(async () => {
    mockRegistry.clear();
    mockGetE2EEKey.mockReset();
    mockUpdateE2EEKey.mockReset();
    authState.userId.set(ALICE_ID);
    authState.isPrimary.set(null); // device status not fetched (true→null never triggers the watcher)
    await deleteLocalE2EEKeys(); // clears in-memory keys + the mock vault entries
    mockVault.clear();
});

// ── 1. Key lifecycle on web ─────────────────────────────────────────────────

describe('key lifecycle on web (primary-device-only generation)', () => {
    it('initializeE2EEKeys generates + persists + uploads ONLY on the primary device', async () => {
        mockUpdateE2EEKey.mockResolvedValue({ status: true });
        authState.isPrimary.set(true);

        await initializeE2EEKeys();
        await uploadPublicKeyIfNeeded();

        expect(isE2EEReady()).toBe(true);
        const pub = getMyPublicKey()!;
        expect(isValidPublicKeyB64(pub)).toBe(true); // 44-char standard Base64 (backend contract)
        expect(mockVault.get('e2ee_private_key')).toBe(getMyPrivateKey());
        expect(mockVault.get('e2ee_public_key')).toBe(pub);
        expect(mockUpdateE2EEKey).toHaveBeenCalledWith({ e2ee_public_key: pub });
        expect(mockVault.get('e2ee_public_key_uploaded')).toBe('true');
    });

    it('NEVER generates a keypair on a secondary device (isPrimary = false)', async () => {
        authState.isPrimary.set(false);

        await initializeE2EEKeys();

        expect(isE2EEReady()).toBe(false);
        expect(getMyPrivateKey()).toBeNull();
        expect(mockVault.get('e2ee_private_key')).toBeUndefined();
        expect(mockVault.get('e2ee_public_key')).toBeUndefined();
        expect(mockUpdateE2EEKey).not.toHaveBeenCalled();
    });

    it('NEVER generates a keypair while the device status is unknown (isPrimary = null)', async () => {
        await initializeE2EEKeys(); // isPrimary stays null from beforeEach

        expect(isE2EEReady()).toBe(false);
        expect(mockVault.get('e2ee_private_key')).toBeUndefined();
        expect(mockVault.get('e2ee_public_key')).toBeUndefined();
        expect(mockUpdateE2EEKey).not.toHaveBeenCalled();
    });

    it('generates the keypair the moment the device is promoted to primary', async () => {
        mockUpdateE2EEKey.mockResolvedValue({ status: true });
        authState.isPrimary.set(false);
        await initializeE2EEKeys(); // secondary → skips + arms the promotion watcher
        expect(isE2EEReady()).toBe(false);

        authState.isPrimary.set(true); // settings → setCentralDevice
        await waitForE2EEReady();

        expect(isE2EEReady()).toBe(true);
        expect(mockVault.get('e2ee_public_key')).toBe(getMyPublicKey());
        expect(mockUpdateE2EEKey).toHaveBeenCalledWith({ e2ee_public_key: getMyPublicKey() });
    });

    it('keeps the same keypair on later launches (no regeneration)', async () => {
        mockUpdateE2EEKey.mockResolvedValue({ status: true });
        authState.isPrimary.set(true);
        await initializeE2EEKeys();
        const firstPublicKey = getMyPublicKey();

        await initializeE2EEKeys();

        expect(getMyPublicKey()).toBe(firstPublicKey);
        expect(mockUpdateE2EEKey).toHaveBeenCalledTimes(1); // upload already confirmed
    });

    it('keeps the generated keys when the upload fails and retries on the next launch', async () => {
        mockUpdateE2EEKey.mockRejectedValueOnce(new Error('offline'));
        authState.isPrimary.set(true);
        await initializeE2EEKeys();
        expect(isE2EEReady()).toBe(true); // keys exist locally
        expect(mockVault.get('e2ee_public_key_uploaded')).toBe('false'); // retried later

        mockUpdateE2EEKey.mockResolvedValue({ status: true });
        await uploadPublicKeyIfNeeded();
        expect(mockVault.get('e2ee_public_key_uploaded')).toBe('true');
    });

    it('importIdentityKeypair (Phase 2 hook) replaces the keypair and records it as uploaded', async () => {
        await armDeviceWithKeySync();

        expect(isE2EEReady()).toBe(true);
        expect(getMyPrivateKey()).toBe(alice.privateKey);
        expect(getMyPublicKey()).toBe(alice.publicKey);
        expect(mockVault.get('e2ee_private_key')).toBe(alice.privateKey);
        expect(mockVault.get('e2ee_public_key')).toBe(alice.publicKey);
        // The originating native device already registered this public key
        expect(mockVault.get('e2ee_public_key_uploaded')).toBe('true');
    });

    it('rejects malformed imported keys', async () => {
        await expect(importIdentityKeypair('', bob.publicKey)).resolves.toBe(false);
        await expect(importIdentityKeypair(alice.privateKey, 'not-a-key')).resolves.toBe(false);
        expect(isE2EEReady()).toBe(false);
        expect(mockVault.size).toBe(0);
    });

    it('loads the persisted keypair from the encrypted vault on next launch (even if no longer primary)', async () => {
        // Simulate a fresh app start: vault populated, memory empty, status unknown
        mockVault.set('e2ee_private_key', alice.privateKey);
        mockVault.set('e2ee_public_key', alice.publicKey);
        mockVault.set('e2ee_public_key_uploaded', 'true');

        await initializeE2EEKeys();

        expect(isE2EEReady()).toBe(true);
        expect(getMyPrivateKey()).toBe(alice.privateKey);
        expect(mockUpdateE2EEKey).not.toHaveBeenCalled(); // already confirmed uploaded
    });

    it('retries the public key upload when the vault flag is not confirmed (still primary)', async () => {
        mockVault.set('e2ee_private_key', alice.privateKey);
        mockVault.set('e2ee_public_key', alice.publicKey);
        mockVault.set('e2ee_public_key_uploaded', 'false');
        mockUpdateE2EEKey.mockResolvedValue({ status: true });
        authState.isPrimary.set(true);

        await initializeE2EEKeys();
        await uploadPublicKeyIfNeeded();

        expect(mockUpdateE2EEKey).toHaveBeenCalledWith({ e2ee_public_key: alice.publicKey });
        expect(mockVault.get('e2ee_public_key_uploaded')).toBe('true');
    });

    it('does NOT upload a pending key after the device was demoted (never overwrites the primary)', async () => {
        mockVault.set('e2ee_private_key', alice.privateKey);
        mockVault.set('e2ee_public_key', alice.publicKey);
        mockVault.set('e2ee_public_key_uploaded', 'false');
        authState.isPrimary.set(false); // demoted before the upload was confirmed

        await initializeE2EEKeys();

        expect(isE2EEReady()).toBe(true); // still holds + uses its keys locally
        expect(mockUpdateE2EEKey).not.toHaveBeenCalled();
        expect(mockVault.get('e2ee_public_key_uploaded')).toBe('false');
    });

    it('logout deletes the keypair from the web vault', async () => {
        await armDeviceWithKeySync();

        await deleteLocalE2EEKeys();

        expect(isE2EEReady()).toBe(false);
        expect(getMyPrivateKey()).toBeNull();
        expect(mockVault.size).toBe(0);
    });
});

// ── 2. Outgoing text on web ─────────────────────────────────────────────────

describe('outgoing text on web', () => {
    it('blocks when this device has no keys', async () => {
        mockRegistry.set(BOB_ID, bob.publicKey); // recipient HAS a key — we don't
        mockBackendKeys();

        await expect(encryptOutgoingText(BOB_ID, 'pre-sync message')).rejects.toThrow(/strict text encryption blocked/);
    });

    it('encrypts exactly like native once keys are present; Bob can decrypt', async () => {
        await armDeviceWithKeySync();
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockBackendKeys();

        const wire = await encryptOutgoingText(BOB_ID, 'web parity message 🎯');

        expect(wire).not.toBe('web parity message 🎯');
        expect(isEncryptedContent(wire)).toBe(true);
        expect(decryptText(wire, alice.publicKey, bob.privateKey)).toBe('web parity message 🎯');
    });

    it('falls back to get-e2ee-key and persists the result in the registry', async () => {
        await armDeviceWithKeySync();
        mockBackendKeys();

        const wire = await encryptOutgoingText(BOB_ID, 'fallback path');

        expect(mockGetE2EEKey).toHaveBeenCalledWith(BOB_ID);
        expect(mockRegistry.get(BOB_ID)).toBe(bob.publicKey);
        expect(decryptText(wire, alice.publicKey, bob.privateKey)).toBe('fallback path');
    });
});

// ── 3. Incoming text on web ─────────────────────────────────────────────────

describe('incoming text on web', () => {
    const resolveSenderId = () => BOB_ID;

    it('decrypts incoming messages once keys are present', async () => {
        await armDeviceWithKeySync();
        const wire = encryptText('bob → alice on web', alice.publicKey, bob.privateKey);
        const msg = makeMessage({ content: wire });

        await processIncomingMessages([msg], { resolveSenderId });

        expect(msg.content).toBe('bob → alice on web');
    });

    it('blanks ciphertext to "" when this device has no keys (never Base64 garbage)', async () => {
        const wire = encryptText('cannot read this yet', alice.publicKey, bob.privateKey);
        const msg = makeMessage({ content: wire });

        await processIncomingMessages([msg], { resolveSenderId });

        expect(msg.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('blanks own encrypted echoes (is_from_me)', async () => {
        await armDeviceWithKeySync();
        const wire = encryptText('my own echo', bob.publicKey, alice.privateKey);
        const msg = makeMessage({ content: wire, is_from_me: true });

        await processIncomingMessages([msg], { resolveSenderId });

        expect(msg.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('passes plaintext through untouched (legacy / no-key senders)', async () => {
        await armDeviceWithKeySync();
        const msg = makeMessage({ content: 'plain old message', sender_e2ee_public_key: null });

        await processIncomingMessages([msg], { resolveSenderId });

        expect(msg.content).toBe('plain old message');
    });

    it('syncs sender keys into the registry even when this device has no keys', async () => {
        const msg = makeMessage({ content: 'plain', sender_e2ee_public_key: bob.publicKey });

        await processIncomingMessages([msg], { resolveSenderId });

        expect(mockRegistry.get(BOB_ID)).toBe(bob.publicKey);
    });
});

// ── 4. Chat list previews on web ────────────────────────────────────────────

describe('chat list previews on web', () => {
    it('decrypts previews and syncs the registry', async () => {
        await armDeviceWithKeySync();
        const wire = encryptText('preview text', alice.publicKey, bob.privateKey);
        const chat = makeChat({ last_message_content: wire });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe('preview text');
        expect(mockRegistry.get(BOB_ID)).toBe(bob.publicKey);
    });

    it('blanks undecryptable previews when this device has no keys', async () => {
        const wire = encryptText('locked preview', alice.publicKey, bob.privateKey);
        const chat = makeChat({ last_message_content: wire });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });
});

// ── 5. Media on web (blob envelope) ─────────────────────────────────────────

describe('media on web (blob envelope encryption)', () => {
    const makeFileBytes = (size = 2048): Uint8Array => {
        const bytes = new Uint8Array(size);
        for (let i = 0; i < size; i++) bytes[i] = (i * 31 + 7) % 256;
        return bytes;
    };

    it('encrypts an outgoing blob the recipient can unwrap and decrypt byte-exactly', async () => {
        await armDeviceWithKeySync();
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockBackendKeys();
        const fileBytes = makeFileBytes();
        const blob = new Blob([fileBytes as any]);

        const e2ee = await encryptOutgoingMediaBlob(BOB_ID, blob, 'photo.jpg');

        expect(e2ee).not.toBeNull();
        expect(e2ee!.uploadFileName).toMatch(/^cb-media-.+\.enc$/);
        expect(isEncryptedContent(e2ee!.wrappedKey)).toBe(true);

        const encryptedBytes = new Uint8Array(await e2ee!.encryptedBlob.arrayBuffer());
        expect(encryptedBytes).not.toEqual(fileBytes); // ciphertext, not plaintext

        // Recipient side: unwrap the media key + exact metadata with Bob's private key, open the box
        const envelope = unwrapMediaEnvelope(e2ee!.wrappedKey, alice.publicKey, bob.privateKey);
        expect(envelope.meta).toEqual({ fileName: 'photo.jpg', mimeType: 'image/jpeg', size: fileBytes.length });
        const decrypted = decryptMediaBytes(encryptedBytes, envelope.key);
        expect(decrypted).toEqual(fileBytes);

        expect(() => e2ee!.cleanup()).not.toThrow(); // no-op on web
    });

    it('blocks when this device has no keys', async () => {
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockBackendKeys();
        await expect(encryptOutgoingMediaBlob(BOB_ID, new Blob([makeFileBytes() as any]), 'a.jpg'))
            .rejects.toThrow(/strict media encryption blocked/);
    });

    it('blocks when the recipient has no key', async () => {
        await armDeviceWithKeySync();
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: null });

        await expect(encryptOutgoingMediaBlob(BOB_ID, new Blob([makeFileBytes() as any]), 'a.jpg'))
            .rejects.toThrow(/strict media encryption blocked/);
    });

    it('file-URI variant stays native-only (blocks on web)', async () => {
        await armDeviceWithKeySync();
        mockRegistry.set(BOB_ID, bob.publicKey);
        mockBackendKeys();

        await expect(encryptOutgoingMediaFile(BOB_ID, 'file:///staged/photo.jpg', 'photo.jpg'))
            .rejects.toThrow(/strict media encryption blocked/);
    });

    it('flags incoming encrypted media on web and decrypts the bytes in memory', async () => {
        await armDeviceWithKeySync();
        const fileBytes = makeFileBytes(4096);

        // Bob's side: envelope-encrypt a file for Alice
        const mediaKey = generateMediaKey();
        const encryptedBytes = encryptMediaBytes(fileBytes, mediaKey);
        const wrappedKey = wrapMediaEnvelope(
            mediaKey,
            { fileName: 'photo.jpg', mimeType: 'image/jpeg', size: fileBytes.length },
            alice.publicKey,
            bob.privateKey,
        );
        const msg = makeMessage({ message_type: 'image', content: wrappedKey });

        expect(isEncryptedMediaMessage(msg)).toBe(true);
        expect(decryptIncomingMediaBytes(msg, encryptedBytes)).toEqual(fileBytes);
    });

    it('flags own encrypted media too, but never plaintext captions', async () => {
        await armDeviceWithKeySync();
        const mediaKey = generateMediaKey();
        const wrappedKey = wrapMediaEnvelope(
            mediaKey,
            { fileName: 'photo.jpg', mimeType: 'image/jpeg', size: 0 },
            bob.publicKey,
            alice.privateKey,
        );

        // crypto_box is bidirectional — the sending device CAN unwrap its own
        // media key (recipient pub + own priv), so own media must be flagged.
        expect(isEncryptedMediaMessage(makeMessage({ message_type: 'image', content: wrappedKey, is_from_me: true }))).toBe(true);
        expect(isEncryptedMediaMessage(makeMessage({ message_type: 'image', content: 'a caption' }))).toBe(false);
        expect(isEncryptedMediaMessage(makeMessage({ message_type: 'image', content: 'a caption', is_from_me: true }))).toBe(false);
    });

    it('resolveMediaUnwrapKey: sender key for incoming, recipient registry key for own media', async () => {
        await armDeviceWithKeySync();
        mockRegistry.set(BOB_ID, bob.publicKey);

        const incoming = makeMessage({ message_type: 'image' });
        expect(await resolveMediaUnwrapKey(incoming)).toBe(bob.publicKey);

        const own = makeMessage({ message_type: 'image', is_from_me: true, recipient_id: BOB_ID } as any);
        expect(await resolveMediaUnwrapKey(own)).toBe(bob.publicKey);

        const ownNoRecipient = makeMessage({ message_type: 'image', is_from_me: true, recipient_id: undefined } as any);
        expect(await resolveMediaUnwrapKey(ownNoRecipient)).toBeNull();
    });

    it('SENDER decrypts its OWN uploaded media after a refresh (recipient-key unwrap)', async () => {
        // Replays the reported incident: the sender re-downloads its own `.enc`
        // file (staged copy lost) — it must decrypt with the recipient's key.
        await armDeviceWithKeySync();
        mockRegistry.set(BOB_ID, bob.publicKey);
        const fileBytes = makeFileBytes(4096);

        // Alice's own upload: fresh media key, wrapped FOR Bob with Alice's priv
        const mediaKey = generateMediaKey();
        const encryptedBytes = encryptMediaBytes(fileBytes, mediaKey);
        const wrappedKey = wrapMediaEnvelope(
            mediaKey,
            { fileName: 'photo.jpg', mimeType: 'image/jpeg', size: fileBytes.length },
            bob.publicKey,
            alice.privateKey,
        );
        const ownMsg = makeMessage({
            message_type: 'file',
            content: wrappedKey,
            is_from_me: true,
            recipient_id: BOB_ID,
            sender_e2ee_public_key: alice.publicKey, // own key — useless for unwrap
        } as any);

        expect(isEncryptedMediaMessage(ownMsg)).toBe(true);
        const unwrapKey = await resolveMediaUnwrapKey(ownMsg);
        expect(unwrapKey).toBe(bob.publicKey);
        expect(decryptIncomingMediaBytes(ownMsg, encryptedBytes, unwrapKey)).toEqual(fileBytes);

        // Sanity: unwrapping with the legacy default (sender key = own key) fails
        expect(() => decryptIncomingMediaBytes(ownMsg, encryptedBytes)).toThrow();
    });
});
