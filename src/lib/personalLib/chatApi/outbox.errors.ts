/** Error detection helpers for outbox E2EE revision conflicts. */

import type { StaleSide } from '@/lib/personalLib/models/personal.model.profile';

type ParsedKeysStaleError = {
    staleSide: StaleSide;
    senderKeysRevision?: number;
    recipientKeysRevision?: number;
    senderKeys?: string[];
    recipientKeys?: string[];
};

function payload(err: unknown): any {
    const e = err as any;
    return e?.response?.data ?? e?.data ?? e?.details ?? e;
}

export function isKeysStaleError(err: unknown): boolean {
    const e = err as any;
    const p = payload(err);
    return p?.type === 'keys_stale' || e?.type === 'keys_stale';
}

export function extractKeysStaleError(err: unknown): ParsedKeysStaleError | null {
    if (!isKeysStaleError(err)) return null;
    const p = payload(err);
    const details = p?.details ?? p;
    const staleSide = details?.stale_side;
    if (staleSide !== 'sender' && staleSide !== 'recipient' && staleSide !== 'both') return null;
    return {
        staleSide,
        senderKeysRevision: typeof details.sender_keys_revision === 'number' ? details.sender_keys_revision : undefined,
        recipientKeysRevision: typeof details.recipient_keys_revision === 'number' ? details.recipient_keys_revision : undefined,
        senderKeys: Array.isArray(details.sender_active_keys) ? details.sender_active_keys : undefined,
        recipientKeys: Array.isArray(details.recipient_active_keys) ? details.recipient_active_keys : undefined,
    };
}
