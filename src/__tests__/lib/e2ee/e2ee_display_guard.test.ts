/**
 * E2EE display-guard regression test — "never show raw cipher" safety net.
 *
 * After the web cold-start incident (raw 56-char Base64 ciphertext rendered
 * as a message), the rule is: even if EVERY upstream pipeline stage fails,
 * cipher-looking content must never reach the user's eyes.
 *
 * `toDisplaySafeText(content, messageType)` is the last line of defense,
 * applied at the only two render choke points:
 * - the MessageBubble `text` prop ([chat_id].tsx) — bubbles + media captions
 * - `getPreviewText()` (util.chatPreview.ts) — every chat-list/screen preview
 *
 * Policy pinned here:
 * - cipher-looking TEXT (or unknown type) → "Failed to load" (never Base64)
 * - cipher-looking MEDIA content (the wrapped media key travels in `content`
 *   by design) → "" (it is transport metadata, not a caption)
 * - plaintext, file names, unsent markers → untouched
 * - detection is pure JS → works BEFORE the web WASM is ready (cold start)
 */

// ── Mocks ───────────────────────────────────────────────────────────────────

// Mirrors react-native-libsodium's web Proxy: every export reads as
// `undefined` until __setSodiumReady(true) is called (deterministic cold
// start, independent of how fast the real WASM compiles).
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

// ── Imports (after mocks) ───────────────────────────────────────────────────

import {
    E2EE_FAILED_TO_LOAD_TEXT,
    encryptText,
    generateIdentityKeypair,
    isEncryptedContent,
    sodiumReady,
    toDisplaySafeText,
    wrapMediaEnvelope,
    generateMediaKey,
} from '@/lib/personalLib/e2ee/e2ee.crypto';
import { getPreviewText } from '@/utils/personalUtils/util.chatPreview';
import * as sodiumBinding from 'react-native-libsodium';
import type { MessageEntry } from '@/lib/personalLib/models/personal.model.chat';

const sodiumMockControl = sodiumBinding as unknown as {
    __setSodiumReady: (value: boolean) => void;
    __isSodiumReady: () => boolean;
};

// The EXACT ciphertext from the real two-user incident (user A's console).
const INCIDENT_CIPHERTEXT = 'HV6RlQc4KD+KcmLYrEWQ04wLnnjgJ656PVJFZjdNiG+RemEOYSU68yem';

// A structurally valid wrapped-media-key wire: base64(24-byte nonce + 16-byte
// MAC + 32-byte key) = base64(72 bytes) = 96 chars (no padding).
const FAKE_WRAPPED_KEY = 'A'.repeat(96);

const msg = (overrides: Partial<MessageEntry>): MessageEntry =>
    ({
        message_id: 'm1',
        chat_id: 'c1',
        recipient_id: 'u2',
        content: '',
        message_type: 'text',
        is_from_me: false,
        created_at: '2026-06-11T00:00:00Z',
        ...overrides,
    }) as MessageEntry;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('toDisplaySafeText — cold start (sodium NOT ready)', () => {
    it('replaces the incident ciphertext with the failure marker BEFORE sodium is ready', () => {
        expect(sodiumMockControl.__isSodiumReady()).toBe(false);
        expect(toDisplaySafeText(INCIDENT_CIPHERTEXT, 'text')).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('treats unknown message type as text (marker, never cipher)', () => {
        expect(toDisplaySafeText(INCIDENT_CIPHERTEXT)).toBe(E2EE_FAILED_TO_LOAD_TEXT);
        expect(toDisplaySafeText(INCIDENT_CIPHERTEXT, null)).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('hides the wrapped media key from media captions (empty string, no marker)', () => {
        expect(isEncryptedContent(FAKE_WRAPPED_KEY)).toBe(true);
        for (const type of ['image', 'video', 'audio', 'file']) {
            expect(toDisplaySafeText(FAKE_WRAPPED_KEY, type)).toBe('');
        }
    });

    it('passes plaintext through untouched', () => {
        expect(toDisplaySafeText('hello world', 'text')).toBe('hello world');
        expect(toDisplaySafeText('🎉🎉🎉', 'text')).toBe('🎉🎉🎉');
        // Short Base64 (< 56 chars) cannot be our wire format
        expect(toDisplaySafeText('aGVsbG8=', 'text')).toBe('aGVsbG8=');
        // Real media captions (plaintext) survive
        expect(toDisplaySafeText('our holiday pic', 'image')).toBe('our holiday pic');
    });

    it('maps empty/null/undefined to empty string', () => {
        expect(toDisplaySafeText('', 'text')).toBe('');
        expect(toDisplaySafeText(null, 'text')).toBe('');
        expect(toDisplaySafeText(undefined, 'image')).toBe('');
    });
});

describe('getPreviewText — sanitized previews (sodium NOT ready)', () => {
    it('shows the failure marker for a text preview that is still ciphertext', () => {
        expect(getPreviewText(msg({ content: INCIDENT_CIPHERTEXT }))).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('never leaks a wrapped key through the ChatListItem file_name reuse', () => {
        // ChatListItem builds: { content: last_message_content, file_name: last_message_content }
        const dummy = msg({
            content: FAKE_WRAPPED_KEY,
            file_name: FAKE_WRAPPED_KEY,
            message_type: 'image',
        } as Partial<MessageEntry>);
        expect(getPreviewText(dummy)).toBe('');
    });

    it('keeps legit file names and plaintext previews untouched', () => {
        expect(
            getPreviewText(msg({ file_name: 'photo.jpg', message_type: 'image' } as Partial<MessageEntry>)),
        ).toBe('photo.jpg');
        expect(getPreviewText(msg({ content: 'see you at 5' }))).toBe('see you at 5');
    });

    it('keeps the unsent marker and empty fallbacks', () => {
        expect(getPreviewText(msg({ message_type: 'unsent' } as Partial<MessageEntry>))).toBe('Message unsent');
        expect(getPreviewText(null)).toBe('');
        expect(getPreviewText(undefined)).toBe('');
    });
});

describe('toDisplaySafeText — real ciphertext (sodium ready)', () => {
    beforeAll(async () => {
        sodiumMockControl.__setSodiumReady(true);
        await sodiumReady();
    });

    it('masks a REAL crypto_box wire produced by the send path', () => {
        const alice = generateIdentityKeypair();
        const bob = generateIdentityKeypair();
        const wire = encryptText('attack at dawn', bob.publicKey, alice.privateKey);
        expect(toDisplaySafeText(wire, 'text')).toBe(E2EE_FAILED_TO_LOAD_TEXT);
        expect(getPreviewText(msg({ content: wire }))).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('masks a REAL media metadata envelope in a caption position', () => {
        const alice = generateIdentityKeypair();
        const bob = generateIdentityKeypair();
        const wrapped = wrapMediaEnvelope(
            generateMediaKey(),
            { fileName: 'secret.jpg', mimeType: 'image/jpeg', size: 1234 },
            bob.publicKey,
            alice.privateKey,
        );
        expect(toDisplaySafeText(wrapped, 'image')).toBe('');
    });
});
