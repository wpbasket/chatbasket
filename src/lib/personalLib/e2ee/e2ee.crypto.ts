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
// - Text message content:  base64(nonce_24 || crypto_box ciphertext)
// - Media content v2:      base64(nonce_24 || crypto_box(JSON{key,meta}))
// - Media file blob:       nonce_24 || crypto_secretbox ciphertext (raw bytes)

import {
    base64_variants,
    crypto_box_easy,
    crypto_box_keypair,
    crypto_box_open_easy,
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
// Text messages — crypto_box_easy
// ————————————————————————————————————————————————————————————————————————————

/**
 * Encrypts a text message for `recipientPublicKeyB64`.
 * Returns `base64(nonce || ciphertext)` ready for the message `content` field.
 */
export function encryptText(
    plaintext: string,
    recipientPublicKeyB64: string,
    myPrivateKeyB64: string,
): string {
    const nonce = randombytes_buf(BOX_NONCEBYTES);
    const ciphertext = crypto_box_easy(
        plaintext,
        nonce,
        from_base64(recipientPublicKeyB64, B64),
        from_base64(myPrivateKeyB64, B64),
    );
    return to_base64(concatBytes(nonce, ciphertext), B64);
}

/**
 * Decrypts `base64(nonce || ciphertext)` text content from `senderPublicKeyB64`.
 * Throws when authentication fails (wrong/rotated keys, corrupted payload).
 */
export function decryptText(
    encodedContent: string,
    senderPublicKeyB64: string,
    myPrivateKeyB64: string,
): string {
    const payload = from_base64(encodedContent, B64);
    if (payload.length < MIN_ENCRYPTED_BYTES) {
        throw new Error('[E2EE] payload too short to be encrypted content');
    }
    const nonce = payload.slice(0, BOX_NONCEBYTES);
    const ciphertext = payload.slice(BOX_NONCEBYTES);
    const plaintextBytes = crypto_box_open_easy(
        ciphertext,
        nonce,
        from_base64(senderPublicKeyB64, B64),
        from_base64(myPrivateKeyB64, B64),
    );
    return to_string(plaintextBytes);
}

/**
 * Structural heuristic: does `content` look like our encrypted wire format?
 * Used to keep legacy/degraded plaintext messages readable. A plaintext that
 * happens to be valid Base64 of >= 40 bytes will be treated as encrypted and
 * fail decryption (rendered as "" per spec) — accepted edge case.
 */
export function isEncryptedContent(content: string | null | undefined): content is string {
    if (!content) return false;
    // base64(40 bytes) = 56 chars; anything shorter cannot hold nonce + MAC
    if (content.length < 56 || content.length % 4 !== 0) return false;
    if (!STANDARD_B64_RE.test(content)) return false;
    // Pure JS on purpose — NO sodium call. Detection must keep working even
    // before the web WASM is ready (cold start); otherwise incoming ciphertext
    // would be classified as plaintext and rendered raw. Standard Base64
    // decodes 3 bytes per 4 chars, minus trailing padding.
    const padding = content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0;
    return (content.length / 4) * 3 - padding >= MIN_ENCRYPTED_BYTES;
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
// Media files — envelope encryption (crypto_secretbox bulk + crypto_box key wrap)
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

const MEDIA_CONTENT_ENVELOPE_VERSION = 2;
const MEDIA_CONTENT_ENVELOPE_KIND = 'cb.media';

export interface E2EEMediaMetadata {
    fileName: string;
    mimeType: string;
    size: number | null;
}

export interface E2EEMediaEnvelope {
    key: Uint8Array;
    meta: E2EEMediaMetadata;
}

function normalizeMediaMetadata(meta: E2EEMediaMetadata): E2EEMediaMetadata {
    const fileName = typeof meta.fileName === 'string' && meta.fileName.trim()
        ? meta.fileName.trim()
        : 'file';
    const mimeType = typeof meta.mimeType === 'string' && meta.mimeType.trim()
        ? meta.mimeType.trim()
        : 'application/octet-stream';
    const rawSize = Number(meta.size);
    const size = Number.isFinite(rawSize) && rawSize >= 0 ? Math.trunc(rawSize) : null;
    return { fileName, mimeType, size };
}

/**
 * Wraps the media key AND original media metadata for the recipient.
 * Server/Appwrite only see opaque encrypted JSON in message `content`.
 */
export function wrapMediaEnvelope(
    mediaKey: Uint8Array,
    metadata: E2EEMediaMetadata,
    recipientPublicKeyB64: string,
    myPrivateKeyB64: string,
): string {
    const meta = normalizeMediaMetadata(metadata);
    const plaintext = JSON.stringify({
        v: MEDIA_CONTENT_ENVELOPE_VERSION,
        kind: MEDIA_CONTENT_ENVELOPE_KIND,
        key: to_base64(mediaKey, B64),
        meta,
    });
    const nonce = randombytes_buf(BOX_NONCEBYTES);
    const sealed = crypto_box_easy(
        plaintext,
        nonce,
        from_base64(recipientPublicKeyB64, B64),
        from_base64(myPrivateKeyB64, B64),
    );
    return to_base64(concatBytes(nonce, sealed), B64);
}

/**
 * Opens a v2 media content envelope: media key + original file metadata.
 * Throws when auth/shape validation fails.
 */
export function unwrapMediaEnvelope(
    encodedEnvelope: string,
    senderPublicKeyB64: string,
    myPrivateKeyB64: string,
): E2EEMediaEnvelope {
    const payload = from_base64(encodedEnvelope, B64);
    if (payload.length < MIN_ENCRYPTED_BYTES) {
        throw new Error('[E2EE] media envelope payload too short');
    }
    const nonce = payload.slice(0, BOX_NONCEBYTES);
    const sealed = payload.slice(BOX_NONCEBYTES);
    const plaintext = crypto_box_open_easy(
        sealed,
        nonce,
        from_base64(senderPublicKeyB64, B64),
        from_base64(myPrivateKeyB64, B64),
    );
    const parsed = JSON.parse(to_string(plaintext));
    if (
        parsed?.v !== MEDIA_CONTENT_ENVELOPE_VERSION ||
        parsed?.kind !== MEDIA_CONTENT_ENVELOPE_KIND ||
        typeof parsed?.key !== 'string' ||
        !parsed?.meta
    ) {
        throw new Error('[E2EE] invalid media envelope');
    }
    const key = from_base64(parsed.key, B64);
    if (key.length !== 32) {
        throw new Error('[E2EE] invalid media envelope key');
    }
    return {
        key,
        meta: normalizeMediaMetadata({
            fileName: String(parsed.meta.fileName ?? ''),
            mimeType: String(parsed.meta.mimeType ?? ''),
            size: parsed.meta.size ?? null,
        }),
    };
}
