import { applyOutgoingReceiptStatus, deriveMessageTickState, canBulkUnsend, isMessageUnsendable } from '@/utils/personalUtils/util.messageTick';

describe('deriveMessageTickState', () => {
    it('does not show read/delivered for outgoing messages without per-message delivery ACK', () => {
        expect(deriveMessageTickState({
            is_from_me: true,
            status: 'read',
            delivered_to_recipient: false,
        })).toEqual({ status: 'sent', delivered: false });

        expect(deriveMessageTickState({
            is_from_me: true,
            status: 'delivered',
            delivered_to_recipient: false,
        })).toEqual({ status: 'sent', delivered: false });
    });

    it('allows read only after exact message delivery ACK is present', () => {
        expect(deriveMessageTickState({
            is_from_me: true,
            status: 'read',
            delivered_to_recipient: true,
        })).toEqual({ status: 'read', delivered: true });
    });

    it('keeps pending uploads pending regardless of chat-level read state', () => {
        expect(deriveMessageTickState({
            is_from_me: true,
            status: 'pending',
            delivered_to_recipient: false,
        })).toEqual({ status: 'pending', delivered: false });
    });
});

describe('applyOutgoingReceiptStatus', () => {
    const base = {
        is_from_me: true,
        status: 'sent' as const,
        delivered_to_recipient: false,
        created_at: '2026-06-12T10:00:00.000Z',
    };

    it('hydrates double tick from REST delivered timestamp', () => {
        expect(applyOutgoingReceiptStatus(base, {
            deliveredAt: '2026-06-12T10:00:00.000Z',
        })).toEqual({
            ...base,
            delivered_to_recipient: true,
            status: 'sent',
        });
    });

    it('hydrates green tick from REST read timestamp and treats read as delivered', () => {
        expect(applyOutgoingReceiptStatus(base, {
            readAt: '2026-06-12T10:00:00.000Z',
        })).toEqual({
            ...base,
            delivered_to_recipient: true,
            status: 'read',
        });
    });

    it('does not hydrate pending/error local messages from chat-level receipts', () => {
        expect(applyOutgoingReceiptStatus({
            ...base,
            status: 'pending' as const,
        }, {
            deliveredAt: '2026-06-12T10:01:00.000Z',
            readAt: '2026-06-12T10:01:00.000Z',
        })).toEqual({
            ...base,
            status: 'pending',
        });
    });

    it('ignores incoming messages', () => {
        expect(applyOutgoingReceiptStatus({
            ...base,
            is_from_me: false,
        }, {
            deliveredAt: '2026-06-12T10:01:00.000Z',
            readAt: '2026-06-12T10:01:00.000Z',
        })).toEqual({
            ...base,
            is_from_me: false,
        });
    });
});

describe('isMessageUnsendable', () => {
    it('returns false for undefined/null messages', () => {
        expect(isMessageUnsendable(undefined)).toBe(false);
        expect(isMessageUnsendable(null)).toBe(false);
    });

    it('returns false for incoming messages', () => {
        expect(isMessageUnsendable({
            is_from_me: false,
            status: 'sent',
            is_unsent: false,
            message_type: 'text',
        })).toBe(false);
    });

    it('returns true for a normal sent outgoing message', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'sent',
            is_unsent: false,
            message_type: 'text',
        })).toBe(true);
    });

    it('returns true for a delivered but unread outgoing message', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'delivered',
            is_unsent: false,
            message_type: 'text',
        })).toBe(true);
    });

    it('returns false when recipient has read the message (double green tick)', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'read',
            is_unsent: false,
            message_type: 'text',
        })).toBe(false);
    });

    it('returns false when message is already unsent via flag', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'sent',
            is_unsent: true,
            message_type: 'text',
        })).toBe(false);
    });

    it('returns false when message_type is unsent', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'sent',
            is_unsent: false,
            message_type: 'unsent',
        })).toBe(false);
    });

    it('returns false for pending messages', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'pending',
            is_unsent: false,
            message_type: 'text',
        })).toBe(false);
    });

    it('returns false for sending messages', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'sending',
            is_unsent: false,
            message_type: 'text',
        })).toBe(false);
    });

    it('returns false for error messages', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'error',
            is_unsent: false,
            message_type: 'text',
        })).toBe(false);
    });

    it('returns false for failed messages', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'failed',
            is_unsent: false,
            message_type: 'text',
        })).toBe(false);
    });
});

describe('canBulkUnsend', () => {
    const outgoing = { is_from_me: true, status: 'sent' as const, is_unsent: false, message_type: 'text' };
    const incoming = { is_from_me: false, status: 'sent' as const, is_unsent: false, message_type: 'text' };
    const read = { is_from_me: true, status: 'read' as const, is_unsent: false, message_type: 'text' };
    const unsent = { is_from_me: true, status: 'sent' as const, is_unsent: true, message_type: 'text' };
    const pending = { is_from_me: true, status: 'pending' as const, is_unsent: false, message_type: 'text' };

    it('returns false for empty selection', () => {
        expect(canBulkUnsend([], { msg1: outgoing })).toBe(false);
    });

    it('returns true when all selected messages are unsentable outgoing messages', () => {
        const msgs = { msg1: outgoing, msg2: outgoing };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(true);
    });

    it('returns false when any selected message is from the other user', () => {
        const msgs = { msg1: outgoing, msg2: incoming };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(false);
    });

    it('returns false when any selected message has been read by recipient', () => {
        const msgs = { msg1: outgoing, msg2: read };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(false);
    });

    it('returns false when any selected message is already unsent', () => {
        const msgs = { msg1: outgoing, msg2: unsent };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(false);
    });

    it('returns false when any selected message is in a terminal state', () => {
        const msgs = { msg1: outgoing, msg2: pending };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(false);
    });

    it('returns false when a selected message is missing from the map', () => {
        const msgs = { msg1: outgoing };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(false);
    });

    it('returns true for a single outgoing unread message', () => {
        const msgs = { msg1: outgoing };
        expect(canBulkUnsend(['msg1'], msgs)).toBe(true);
    });
});
