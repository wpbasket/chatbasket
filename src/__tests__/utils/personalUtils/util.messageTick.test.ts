import { applyOutgoingReceiptStatus, deriveMessageTickState } from '@/utils/personalUtils/util.messageTick';

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
