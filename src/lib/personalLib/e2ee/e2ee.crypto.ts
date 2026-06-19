// lib/personalLib/e2ee/e2ee.crypto.ts
//
// Low-level E2EE crypto wrapper around `react-native-libsodium`.
//
// Verified binding constraints (v1.7.0, native JSI + web WASM):
// - Keys MUST be passed to crypto_box_easy / crypto_box_open_easy as Uint8Array.
// - The library's default Base64 variant is URLSAFE_NO_PADDING; the backend
//   requires standard Base64 with padding (exactly 44 chars for a 32-byte key),
//   so every conversion here uses base64_variants.ORIGINAL.
// - Decrypt output must be converted with to_string(); the 'text' outputFormat
//   throws in the native implementation.
// - WEB: every export (functions AND numeric constants) is Proxy-backed and
//   `undefined` until the WASM `ready` promise resolves — NEVER capture
//   libsodium constants at module-eval time; use the hardcoded protocol
//   constants below instead.
//
// Wire formats:
// - Message content V3:  JSON cb.envelope (secretbox payload + per-device sealed keys)
// - Media file blob:      nonce_24 || crypto_secretbox ciphertext (raw bytes)

import {
    base64_variants,
    crypto_box_easy,
    crypto_box_keypair,
    crypto_box_open_easy,
    crypto_box_seal,
    crypto_box_seal_open,
    crypto_secretbox_easy,
    crypto_secretbox_keygen,
    crypto_secretbox_open_easy,
    from_base64,
    randombytes_buf,
    ready,
    to_base64,
    to_string,
} from 'react-native-libsodium';

/**
 * Standard Base64 with padding — the only variant the backend accepts.
 * Defensive access: in bare Jest (no native module) `base64_variants` is
 * undefined at module-eval time; 1 is libsodium's stable ORIGINAL enum value.
 */
const B64 = base64_variants?.ORIGINAL ?? 1;

/** Base64 length of a 32-byte X25519 public key (backend enforces exactly 44). */
export const E2EE_PUBLIC_KEY_B64_LENGTH = 44;

/**
 * Fixed libsodium protocol constants, hardcoded ON PURPOSE.
 *
 * On web, react-native-libsodium's exports (including numeric constants) are
 * `undefined` until the WASM `ready` promise resolves, and this module is
 * evaluated long before that. Deriving these values from the imported
 * constants at module-eval time froze MIN_ENCRYPTED_BYTES as NaN on web,
 * which made isEncryptedContent() reject every real ciphertext — incoming
 * encrypted messages were classified as plaintext and rendered as raw Base64.
 * XSalsa20 nonces (24) and Poly1305 MACs (16) are protocol-frozen in every
 * libsodium build, so hardcoding is safe.
 */
const BOX_NONCEBYTES = 24;       // == crypto_box_NONCEBYTES
const SECRETBOX_NONCEBYTES = 24; // == crypto_secretbox_NONCEBYTES
const BOX_MACBYTES = 16;         // == crypto_box_MACBYTES / crypto_secretbox_MACBYTES

/** Minimum byte length of any valid encrypted text payload (nonce + MAC). */
const MIN_ENCRYPTED_BYTES = BOX_NONCEBYTES + BOX_MACBYTES;

const STANDARD_B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Resolves when the sodium implementation is ready (instant on native, async on web WASM). */
export async function sodiumReady(): Promise<void> {
    await ready;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}

// ————————————————————————————————————————————————————————————————————————————
// Identity keypair
// ————————————————————————————————————————————————————————————————————————————

export interface E2EEKeypairB64 {
    publicKey: string;  // standard Base64, 44 chars
    privateKey: string; // standard Base64, 44 chars
}

/** Generates a fresh X25519 identity keypair, encoded as standard Base64. */
export function generateIdentityKeypair(): E2EEKeypairB64 {
    const kp = crypto_box_keypair();
    return {
        publicKey: to_base64(kp.publicKey, B64),
        privateKey: to_base64(kp.privateKey, B64),
    };
}

/** True if `value` is a standard-Base64-encoded 32-byte key. */
export function isValid32ByteB64(value: string | null | undefined): value is string {
    if (!value || value.length !== E2EE_PUBLIC_KEY_B64_LENGTH || !STANDARD_B64_RE.test(value)) {
        return false;
    }
    try {
        return from_base64(value, B64).length === 32;
    } catch {
        return false;
    }
}

/** True if `key` is a standard-Base64-encoded 32-byte public key (backend format). */
export function isValidPublicKeyB64(key: string | null | undefined): key is string {
    return isValid32ByteB64(key);
}

/**
 * Native-safe X25519 keypair relation check.
 *
 * `react-native-libsodium` native does not expose `crypto_scalarmult_base`, so
 * verify by encrypting a probe with the candidate private key + fresh peer
 * public key, then decrypting with the candidate public key + peer private key.
 * This succeeds only when the candidate public/private keys match.
 */
export function isValidX25519Keypair(privateKeyB64: string | null | undefined, publicKeyB64: string | null | undefined): boolean {
    if (!isValid32ByteB64(privateKeyB64) || !isValid32ByteB64(publicKeyB64)) return false;
    try {
        const peer = crypto_box_keypair();
        const nonce = randombytes_buf(BOX_NONCEBYTES);
        const probe = 'e2ee-keypair-check';
        const ciphertext = crypto_box_easy(
            probe,
            nonce,
            peer.publicKey,
            from_base64(privateKeyB64, B64),
        );
        const opened = crypto_box_open_easy(
            ciphertext,
            nonce,
            from_base64(publicKeyB64, B64),
            peer.privateKey,
        );
        return to_string(opened) === probe;
    } catch {
        return false;
    }
}

// ————————————————————————————————————————————————————————————————————————————
// V3 payload envelopes
// ————————————————————————————————————————————————————————————————————————————

const V3_ENVELOPE_VERSION = 3;
const V3_ENVELOPE_KIND = 'cb.envelope';

export type E2EEV3Payload =
    | { type: 'text'; text: string }
    | {
        type: 'file';
        file_key: string;
        file_name: string;
        mime_type: string;
        size: number | null;
        caption?: string | null;
    };

export interface E2EEV3KeyEnvelope {
    public_key: string;
    encrypted_key: string;
}

export interface E2EEV3Envelope {
    v: 3;
    kind: 'cb.envelope';
    ciphertext: string;
    key_envelopes: E2EEV3KeyEnvelope[];
}

export function generateMessageKey(): Uint8Array {
    return crypto_secretbox_keygen();
}

export function encode32ByteKeyB64(key: Uint8Array): string {
    if (key.length !== 32) {
        throw new Error('[E2EE] invalid 32-byte key');
    }
    return to_base64(key, B64);
}

export function decode32ByteKeyB64(key: string): Uint8Array {
    const decoded = from_base64(key, B64);
    if (decoded.length !== 32) {
        throw new Error('[E2EE] invalid 32-byte key');
    }
    return decoded;
}

function normalizeV3PublicKeys(publicKeys: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const publicKey of publicKeys) {
        if (!isValidPublicKeyB64(publicKey) || seen.has(publicKey)) continue;
        seen.add(publicKey);
        out.push(publicKey);
    }
    return out;
}

export function isV3Envelope(content: string | null | undefined): boolean {
    if (!content || content[0] !== '{') return false;
    try {
        const parsed = JSON.parse(content);
        return parsed?.v === V3_ENVELOPE_VERSION && parsed?.kind === V3_ENVELOPE_KIND;
    } catch {
        return false;
    }
}

export function parseV3Envelope(content: string): E2EEV3Envelope {
    const parsed = JSON.parse(content);
    if (
        parsed?.v !== V3_ENVELOPE_VERSION ||
        parsed?.kind !== V3_ENVELOPE_KIND ||
        typeof parsed?.ciphertext !== 'string' ||
        !Array.isArray(parsed?.key_envelopes)
    ) {
        throw new Error('[E2EE] invalid v3 envelope');
    }
    const keyEnvelopes = parsed.key_envelopes.map((entry: unknown) => {
        const envelope = entry as Partial<E2EEV3KeyEnvelope>;
        if (!isValidPublicKeyB64(envelope.public_key) || typeof envelope.encrypted_key !== 'string') {
            throw new Error('[E2EE] invalid v3 key envelope');
        }
        return { public_key: envelope.public_key, encrypted_key: envelope.encrypted_key };
    });
    if (keyEnvelopes.length === 0) {
        throw new Error('[E2EE] v3 envelope has no keys');
    }
    return {
        v: V3_ENVELOPE_VERSION,
        kind: V3_ENVELOPE_KIND,
        ciphertext: parsed.ciphertext,
        key_envelopes: keyEnvelopes,
    };
}

function parseV3Payload(plaintext: Uint8Array): E2EEV3Payload {
    const parsed = JSON.parse(to_string(plaintext));
    if (parsed?.type === 'text' && typeof parsed?.text === 'string') {
        return { type: 'text', text: parsed.text };
    }
    if (
        parsed?.type === 'file' &&
        isValid32ByteB64(parsed?.file_key) &&
        typeof parsed?.file_name === 'string' &&
        typeof parsed?.mime_type === 'string' &&
        (parsed?.size == null || (Number.isFinite(Number(parsed.size)) && Number(parsed.size) >= 0))
    ) {
        return {
            type: 'file',
            file_key: parsed.file_key,
            file_name: parsed.file_name,
            mime_type: parsed.mime_type,
            size: parsed.size == null ? null : Math.trunc(Number(parsed.size)),
            caption: typeof parsed.caption === 'string' ? parsed.caption : parsed.caption == null ? null : String(parsed.caption),
        };
    }
    throw new Error('[E2EE] invalid v3 payload');
}

export function encryptPayloadEnvelope(payload: E2EEV3Payload, publicKeys: string[]): string {
    const recipients = normalizeV3PublicKeys(publicKeys);
    if (recipients.length === 0) {
        throw new Error('[E2EE] v3 envelope requires at least one public key');
    }
    const messageKey = generateMessageKey();
    const nonce = randombytes_buf(SECRETBOX_NONCEBYTES);
    const ciphertext = crypto_secretbox_easy(JSON.stringify(payload), nonce, messageKey);
    const keyEnvelopes = recipients.map((publicKey) => ({
        public_key: publicKey,
        encrypted_key: to_base64(crypto_box_seal(messageKey, from_base64(publicKey, B64)), B64),
    }));
    return JSON.stringify({
        v: V3_ENVELOPE_VERSION,
        kind: V3_ENVELOPE_KIND,
        ciphertext: to_base64(concatBytes(nonce, ciphertext), B64),
        key_envelopes: keyEnvelopes,
    } satisfies E2EEV3Envelope);
}

export function decryptPayloadEnvelope(
    content: string,
    myPublicKeyB64: string,
    myPrivateKeyB64: string,
): E2EEV3Payload {
    if (!isValidPublicKeyB64(myPublicKeyB64) || !isValid32ByteB64(myPrivateKeyB64)) {
        throw new Error('[E2EE] invalid v3 identity key');
    }
    const envelope = parseV3Envelope(content);
    const keyEnvelope = envelope.key_envelopes.find((entry) => entry.public_key === myPublicKeyB64);
    if (!keyEnvelope) {
        throw new Error('[E2EE] v3 envelope missing device key');
    }
    const messageKey = crypto_box_seal_open(
        from_base64(keyEnvelope.encrypted_key, B64),
        from_base64(myPublicKeyB64, B64),
        from_base64(myPrivateKeyB64, B64),
    );
    const payload = from_base64(envelope.ciphertext, B64);
    if (payload.length < SECRETBOX_NONCEBYTES + BOX_MACBYTES) {
        throw new Error('[E2EE] v3 payload too short');
    }
    const nonce = payload.slice(0, SECRETBOX_NONCEBYTES);
    const ciphertext = payload.slice(SECRETBOX_NONCEBYTES);
    return parseV3Payload(crypto_secretbox_open_easy(ciphertext, nonce, messageKey));
}

/**
 * Structural heuristic: does `content` look like our encrypted wire format?
 * Used to keep legacy/degraded plaintext messages readable. A plaintext that
 * happens to be valid Base64 of >= 40 bytes will be treated as encrypted and
 * fail decryption (rendered as "" per spec) — accepted edge case.
 */
export function isEncryptedContent(content: string | null | undefined): content is string {
    return isV3Envelope(content);
}

/** Neutral marker rendered instead of any cipher-looking text that reaches the UI. */
export const E2EE_FAILED_TO_LOAD_TEXT = 'Failed to load message';

/**
 * Display-time sanitizer — the LAST line of defense before content reaches
 * the screen (message bubbles, media captions, chat-list previews).
 *
 * The ingress pipeline decrypts or blanks encrypted content before persisting,
 * but a real incident (web cold-start NaN detection bug) proved one upstream
 * bug is enough to let raw ciphertext reach a render path. Policy: NEVER show
 * cipher to the user.
 * - text (or unknown-type) content that still looks encrypted → "Failed to load"
 * - media content that looks encrypted (carries the wrapped media key by
 *   design — it is transport metadata, not a caption) → ""
 * Plaintext passes through untouched. Pure JS — works before WASM is ready.
 */
export function toDisplaySafeText(
    content: string | null | undefined,
    messageType?: string | null,
): string {
    if (!content) return '';
    if (!isEncryptedContent(content)) return content;
    return messageType == null || messageType === 'text' ? E2EE_FAILED_TO_LOAD_TEXT : '';
}

// ————————————————————————————————————————————————————————————————————————————
// Media files — secretbox bytes
// ————————————————————————————————————————————————————————————————————————————

/** Generates a fresh 256-bit symmetric key for a single media file. */
export function generateMediaKey(): Uint8Array {
    return crypto_secretbox_keygen();
}

/** Encrypts media bytes with a symmetric key. Returns `nonce || ciphertext` raw bytes. */
export function encryptMediaBytes(fileBytes: Uint8Array, mediaKey: Uint8Array): Uint8Array {
    const nonce = randombytes_buf(SECRETBOX_NONCEBYTES);
    const ciphertext = crypto_secretbox_easy(fileBytes, nonce, mediaKey);
    return concatBytes(nonce, ciphertext);
}

/** Decrypts `nonce || ciphertext` media bytes with a symmetric key. Throws on MAC failure. */
export function decryptMediaBytes(encryptedBytes: Uint8Array, mediaKey: Uint8Array): Uint8Array {
    if (encryptedBytes.length < SECRETBOX_NONCEBYTES + BOX_MACBYTES) {
        throw new Error('[E2EE] media payload too short to be encrypted');
    }
    const nonce = encryptedBytes.slice(0, SECRETBOX_NONCEBYTES);
    const ciphertext = encryptedBytes.slice(SECRETBOX_NONCEBYTES);
    return crypto_secretbox_open_easy(ciphertext, nonce, mediaKey);
}

export interface E2EEMediaMetadata {
    fileName: string;
    mimeType: string;
    size: number | null;
}

