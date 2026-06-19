/** Tests for E2EE keys_stale error parsing. */

import {
    isKeysStaleError,
    extractKeysStaleError,
} from '@/lib/personalLib/chatApi/outbox.errors';

const RECIPIENT_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq=';
const SENDER_KEY = 'zyxwvutsrqponmlkjihgfedcbaZYXWVUTSRQPONMLKj=';

function makeKeysStaleError() {
    const err: any = new Error('keys stale');
    err.response = {
        data: {
            type: 'keys_stale',
            message: 'keys stale',
            details: {
                stale_side: 'both',
                sender_keys_revision: 7,
                recipient_keys_revision: 9,
                sender_active_keys: [SENDER_KEY],
                recipient_active_keys: [RECIPIENT_KEY],
            },
        },
    };
    return err;
}

describe('isKeysStaleError', () => {
    it('detects REST keys_stale error', () => {
        expect(isKeysStaleError(makeKeysStaleError())).toBe(true);
    });

    it('detects WS/direct keys_stale error', () => {
        expect(isKeysStaleError({ type: 'keys_stale', details: { stale_side: 'recipient' } })).toBe(true);
    });

    it('rejects non-stale errors', () => {
        expect(isKeysStaleError(new Error('oops'))).toBe(false);
        expect(isKeysStaleError(null)).toBe(false);
    });
});

describe('extractKeysStaleError', () => {
    it('extracts revisions and active keys', () => {
        expect(extractKeysStaleError(makeKeysStaleError())).toEqual({
            staleSide: 'both',
            senderKeysRevision: 7,
            recipientKeysRevision: 9,
            senderKeys: [SENDER_KEY],
            recipientKeys: [RECIPIENT_KEY],
        });
    });

    it('returns null for invalid stale_side', () => {
        expect(extractKeysStaleError({ type: 'keys_stale', details: { stale_side: 'bad' } })).toBeNull();
    });

    it('returns null for non-stale errors', () => {
        expect(extractKeysStaleError({ type: 'bad_request' })).toBeNull();
    });
});
