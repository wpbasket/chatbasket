// lib/personalLib/e2ee/e2ee.log.ts
//
// Verbose E2EE trace logging for real-device testing.
//
// - Every step of the E2EE pipeline (key lifecycle, send-time encryption,
//   ingress decryption, previews, media envelope) emits a trace line so the
//   full flow can be followed in `adb logcat` / Metro / browser console.
// - PRIVACY: NEVER logs private keys, plaintext message content, or full
//   ciphertext — only metadata (ids, byte/char lengths, outcomes) and public
//   key FINGERPRINTS (first 8 Base64 chars).
// - Automatically silenced under Jest; flip E2EE_VERBOSE to false to silence
//   everywhere (e.g., before a production release).

/** Master switch for E2EE trace logging (auto-off under Jest). */
export const E2EE_VERBOSE: boolean =
    typeof process === 'undefined' || !process.env?.JEST_WORKER_ID;

/**
 * Short, log-safe fingerprint of a PUBLIC key (first 8 Base64 chars).
 * Enough to tell keys apart across devices during testing without ever
 * printing full key material.
 */
export function keyFp(publicKeyB64: string | null | undefined): string {
    if (!publicKeyB64) return '(none)';
    return `${publicKeyB64.slice(0, 8)}…`;
}

/** Emits one E2EE trace line: `e2eeLog('[E2EE]', 'event', { detail: 1 })`. */
export function e2eeLog(tag: string, message: string, data?: Record<string, unknown>): void {
    if (!E2EE_VERBOSE) return;
    if (data !== undefined) {
        console.log(`${tag} ${message}`, data);
    } else {
        console.log(`${tag} ${message}`);
    }
}
