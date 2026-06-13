/**
 * E2EE web cold-start regression test — from a real two-user web test.
 *
 * Incident: user B sent an encrypted text; user A's console showed
 *   [E2EE] Ingress: batch processed {total: 1, decrypted: 0, plaintext: 1, ...}
 * and the raw 56-char Base64 ciphertext was persisted and rendered.
 *
 * Root cause: on web, react-native-libsodium serves ALL exports through a
 * Proxy that returns `undefined` until the WASM `ready` promise resolves.
 * e2ee.crypto derived MIN_ENCRYPTED_BYTES from crypto_box_NONCEBYTES at
 * module-eval time → `undefined + 16 = NaN` → isEncryptedContent() returned
 * false for every ciphertext, forever (every `x >= NaN` is false).
 *
 * This suite mocks the binding with the same late-binding semantics
 * (EVERYTHING undefined until explicitly flipped ready) and pins:
 * 1. Detection works BEFORE sodium is ready — pure JS, no sodium dependency.
 * 2. Short messages (1–3 chars / emoji → the minimal 56-char wire) encrypt,
 *    are detected, and decrypt through the real ingress processor and the
 *    real send hook after ready.
 */

// ── Mocks ───────────────────────────────────────────────────────────────────

// Mirrors react-native-libsodium's web Proxy: every export reads as
// `undefined` until __setSodiumReady(true) is called (deterministic cold
// start, independent of how fast the real WASM compiles). The readiness flag
// lives INSIDE the factory: jest hoists the factory above module-body
// variables, and the getters already fire while e2ee.crypto is being
// imported — before any file-level constant would exist.
jest.mock('react-native-libsodium', () => {
    const sodium = require('libsodium-wrappers-sumo');
    const state = { ready: false };
    const late = (prop: string): any => (state.ready ? (sodium as any)[prop] : undefined);
    return {
        __esModule: true,
        __setSodiumReady: (value: boolean) => { state.ready = value; },
        __isSodiumReady: () => state.ready,
        get ready() { return sodium.ready; },
        get base64_variants() { return late('base64_variants'); },
        get crypto_box_NONCEBYTES() { return late('crypto_box_NONCEBYTES'); },
        get crypto_secretbox_NONCEBYTES() { return late('crypto_secretbox_NONCEBYTES'); },
        get crypto_box_keypair() { return late('crypto_box_keypair'); },
        get crypto_box_easy() { return late('crypto_box_easy'); },
        get crypto_box_open_easy() { return late('crypto_box_open_easy'); },
        get crypto_secretbox_keygen() { return late('crypto_secretbox_keygen'); },
        get crypto_secretbox_easy() { return late('crypto_secretbox_easy'); },
        get crypto_secretbox_open_easy() { return late('crypto_secretbox_open_easy'); },
        get randombytes_buf() { return late('randombytes_buf'); },
        get from_base64() { return late('from_base64'); },
        get from_string() { return late('from_string'); },
        get to_base64() { return late('to_base64'); },
        get to_string() { return late('to_string'); },
    };
});

jest.mock('react-native', () => ({
    Platform: { OS: 'web' },
}));

// In-memory persistent key registry (user_keys store stand-in)
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

// Local identity — controllable per test
const mockIdentity: { privateKey: string | null } = { privateKey: null };
jest.mock('@/lib/personalLib/e2ee/e2ee.keys', () => ({
    __esModule: true,
    isE2EEReady: jest.fn(() => mockIdentity.privateKey != null),
    getMyPrivateKey: jest.fn(() => mockIdentity.privateKey),
    whenKeyInitSettled: jest.fn(() => Promise.resolve()),
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import {
    decryptText,
    encryptText,
    generateIdentityKeypair,
    isEncryptedContent,
    sodiumReady,
    type E2EEKeypairB64,
} from '@/lib/personalLib/e2ee/e2ee.crypto';
import {
    encryptOutgoingText,
    processIncomingMessages,
} from '@/lib/personalLib/e2ee/e2ee.service';
import * as sodiumBinding from 'react-native-libsodium';
import type { MessageEntry } from '@/lib/personalLib/models/personal.model.chat';

// Control handle exported by the mock factory above.
const sodiumMockControl = sodiumBinding as unknown as {
    __setSodiumReady: (value: boolean) => void;
    __isSodiumReady: () => boolean;
};

// ── Incident data ───────────────────────────────────────────────────────────

// The EXACT content user A received in the incident log: a 2-char plaintext →
// 24-byte nonce + 16-byte MAC + 2 bytes = 42 bytes = 56 Base64 chars (the
// minimum realistic wire size that the old check failed to detect on web).
const INCIDENT_WIRE = 'HV6RlQc4KD+KcmLYrEWQ04wLnnjgJ656PVJFZjdNiG+RemEOYSU68yem';
// The sender (user B) public key attached to that message.
const INCIDENT_SENDER_KEY = '712rBdmVlBx8KEUCPlIO5VJ0jekKTTZfLkFYsOkqgV4=';

const ALICE_ID = 'alice-uuid-0001'; // recipient (user A); sender side = Bob

function makeMessage(overrides: Partial<MessageEntry> = {}): MessageEntry {
    return {
        message_id: `msg_${Math.random().toString(36).slice(2, 10)}`,
        chat_id: 'chat-1',
        content: 'Hello',
        message_type: 'text',
        is_from_me: false,
        status: 'delivered',
        created_at: new Date().toISOString(),
        ...overrides,
    } as MessageEntry;
}

// ── 1. Cold start: BEFORE the WASM is ready ─────────────────────────────────

describe('isEncryptedContent before sodium is ready (web cold start)', () => {
    it('classifies the incident ciphertext as encrypted with sodium still unavailable', () => {
        // Guard: this block must run pre-flip to reproduce the incident state.
        expect(sodiumMockControl.__isSodiumReady()).toBe(false);
        expect(INCIDENT_WIRE.length).toBe(56);
        expect(isEncryptedContent(INCIDENT_WIRE)).toBe(true);
    });

    it('still rejects plaintext and key-sized Base64 with sodium unavailable', () => {
        expect(sodiumMockControl.__isSodiumReady()).toBe(false);
        expect(isEncryptedContent('hi')).toBe(false);
        expect(isEncryptedContent('Hello, how are you?')).toBe(false);
        expect(isEncryptedContent('')).toBe(false);
        expect(isEncryptedContent(null)).toBe(false);
        // A 44-char public key is valid Base64 but shorter than any wire payload.
        expect(isEncryptedContent(INCIDENT_SENDER_KEY)).toBe(false);
    });
});

// ── 2. AFTER ready: minimal-wire round trips through the real pipeline ──────

describe('short-message round trips after sodium is ready', () => {
    let alice: E2EEKeypairB64;
    let bob: E2EEKeypairB64;

    beforeAll(async () => {
        await sodiumReady();
        sodiumMockControl.__setSodiumReady(true);
        alice = generateIdentityKeypair();
        bob = generateIdentityKeypair();
    });

    beforeEach(() => {
        mockRegistry.clear();
        mockGetE2EEKey.mockReset();
        mockIdentity.privateKey = null;
    });

    it.each(['k', 'hi', 'ok!', '👍'])(
        'plaintext %j produces a detectable wire and decrypts back',
        (text) => {
            const wire = encryptText(text, alice.publicKey, bob.privateKey);
            expect(wire.length).toBeGreaterThanOrEqual(56);
            expect(isEncryptedContent(wire)).toBe(true);
            expect(decryptText(wire, bob.publicKey, alice.privateKey)).toBe(text);
        },
    );

    it('ingress decrypts a 56-char (incident-shaped) wire instead of passing it as plaintext', async () => {
        // Recipient device = Alice
        mockIdentity.privateKey = alice.privateKey;

        const wire = encryptText('hi', alice.publicKey, bob.privateKey);
        expect(wire.length).toBe(INCIDENT_WIRE.length); // same 56-char shape

        const msg = makeMessage({
            content: wire,
            sender_e2ee_public_key: bob.publicKey,
        });
        const [processed] = await processIncomingMessages([msg]);

        expect(processed.content).toBe('hi'); // decrypted — not ciphertext, not ""
    });

    it('send hook encrypts short messages too (mirror of the sender side)', async () => {
        // Sender device = Bob; Alice's key already in the registry.
        mockIdentity.privateKey = bob.privateKey;
        mockRegistry.set(ALICE_ID, alice.publicKey);
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: alice.publicKey });

        const wire = await encryptOutgoingText(ALICE_ID, 'hi');

        expect(wire).not.toBe('hi');
        expect(isEncryptedContent(wire)).toBe(true);
        expect(mockGetE2EEKey).not.toHaveBeenCalled(); // registry-first: cached key used, no backend call
        expect(decryptText(wire, bob.publicKey, alice.privateKey)).toBe('hi');
    });
});
