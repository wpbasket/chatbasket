/**
 * Tests for server-side recipient key validation on send.
 *
 * Validates:
 * 1. isRecipientKeyChangedError — detects 409/recipient_key_changed errors (REST + WS)
 * 2. extractFreshKeyFromError — extracts key from REST and WS error formats
 * 3. Non-matching errors are not detected
 * 4. Key extraction rejects non-44-char messages
 */

import {
    isRecipientKeyChangedError,
    extractFreshKeyFromError,
} from '@/lib/personalLib/chatApi/outbox.errors';

// ── Dummy keys (44-char standard Base64) ────────────────────────────────────

const FRESH_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq=';  // 44 chars
const STALE_KEY = 'zyxwvutsrqponmlkjihgfedcbaZYXWVUTSRQPONMLKj=';  // 44 chars

// ── Error factories ─────────────────────────────────────────────────────────

function makeRESTKeyChangedError(freshKey: string) {
    const err: any = new Error('Conflict');
    err.code = 409;
    err.type = 'recipient_key_changed';
    err.response = { data: { status: 409, type: 'recipient_key_changed', message: freshKey } };
    return err;
}

function makeWSKeyChangedError(freshKey: string) {
    const err: any = new Error(freshKey);
    err.type = 'recipient_key_changed';
    err.status = 409;
    return err;
}

function makeGeneric400Error() {
    const err: any = new Error('Bad Request');
    err.code = 400;
    err.type = 'bad_request';
    err.response = { data: { status: 400, type: 'bad_request', message: 'Bad Request' } };
    return err;
}

function makeGeneric500Error() {
    const err: any = new Error('Internal Server Error');
    err.code = 500;
    err.type = 'internal_server_error';
    err.response = { data: { status: 500, type: 'internal_server_error', message: 'Internal Server Error' } };
    return err;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('isRecipientKeyChangedError', () => {
    it('detects REST 409 recipient_key_changed error', () => {
        expect(isRecipientKeyChangedError(makeRESTKeyChangedError(FRESH_KEY))).toBe(true);
    });

    it('detects WS recipient_key_changed error (type field)', () => {
        expect(isRecipientKeyChangedError(makeWSKeyChangedError(FRESH_KEY))).toBe(true);
    });

    it('detects error with status 409 even without type field', () => {
        const err: any = new Error('conflict');
        err.status = 409;
        expect(isRecipientKeyChangedError(err)).toBe(true);
    });

    it('rejects generic 400 error', () => {
        expect(isRecipientKeyChangedError(makeGeneric400Error())).toBe(false);
    });

    it('rejects generic 500 error', () => {
        expect(isRecipientKeyChangedError(makeGeneric500Error())).toBe(false);
    });

    it('rejects null/undefined', () => {
        expect(isRecipientKeyChangedError(null)).toBe(false);
        expect(isRecipientKeyChangedError(undefined)).toBe(false);
    });

    it('rejects plain Error', () => {
        expect(isRecipientKeyChangedError(new Error('oops'))).toBe(false);
    });
});

describe('extractFreshKeyFromError', () => {
    it('extracts key from REST error (response.data.message)', () => {
        const err = makeRESTKeyChangedError(FRESH_KEY);
        expect(extractFreshKeyFromError(err)).toBe(FRESH_KEY);
    });

    it('extracts key from WS error (err.message)', () => {
        const err = makeWSKeyChangedError(FRESH_KEY);
        expect(extractFreshKeyFromError(err)).toBe(FRESH_KEY);
    });

    it('returns null when message is not 44 chars (human-readable text)', () => {
        const err = makeWSKeyChangedError('Recipient key has changed');
        expect(extractFreshKeyFromError(err)).toBeNull();
    });

    it('returns null for error without message', () => {
        const err: any = { type: 'recipient_key_changed', status: 409 };
        expect(extractFreshKeyFromError(err)).toBeNull();
    });

    it('returns null for null/undefined', () => {
        expect(extractFreshKeyFromError(null)).toBeNull();
        expect(extractFreshKeyFromError(undefined)).toBeNull();
    });

    it('prefers response.data.message over err.message (REST shape)', () => {
        const err: any = new Error('human readable');
        err.response = { data: { message: FRESH_KEY } };
        expect(extractFreshKeyFromError(err)).toBe(FRESH_KEY);
    });
});
