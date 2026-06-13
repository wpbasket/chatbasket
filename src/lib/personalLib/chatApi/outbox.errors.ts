/**
 * Error detection helpers for the outbox queue.
 * Extracted to a separate module so they can be unit-tested
 * without pulling in native dependencies (expo-crypto, expo-file-system, etc.)
 */

const TAG = '[OutboxErrors]';

/** Detects a 409 "recipient_key_changed" error from the backend. */
export function isRecipientKeyChangedError(err: unknown): boolean {
    const e = err as any;
    const isKeyChanged = e?.type === 'recipient_key_changed' ||
        e?.response?.data?.type === 'recipient_key_changed' ||
        e?.status === 409;
    if (isKeyChanged) {
        console.log(`${TAG} Detected recipient_key_changed error`, {
            type: e?.type ?? e?.response?.data?.type,
            status: e?.status ?? e?.code ?? e?.response?.status,
            message: e?.response?.data?.message ?? e?.message,
        });
    }
    return isKeyChanged;
}

/** Extracts the fresh recipient public key from a "recipient_key_changed" error response.
 *  The backend puts the fresh key directly in the message field. */
export function extractFreshKeyFromError(err: unknown): string | null {
    const e = err as any;
    const msg = e?.response?.data?.message ?? e?.message ?? null;
    // The message IS the key (44-char base64) when type is recipient_key_changed
    const key = msg && msg.length === 44 ? msg : null;
    if (key) {
        console.log(`${TAG} Extracted fresh key from error response`, {
            keyPrefix: key.substring(0, 8) + '...',
            keyLength: key.length,
            source: e?.response?.data?.message ? 'REST (response.data.message)' : 'WS (err.message)',
        });
    } else {
        console.warn(`${TAG} Failed to extract fresh key from error`, {
            messageLength: msg?.length ?? 0,
            messagePreview: msg?.substring(0, 20) ?? 'null',
        });
    }
    return key;
}
