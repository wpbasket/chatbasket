import type { MessageEntry } from '@/lib/personalLib';

type MessageStatus = MessageEntry['status'];

export function deriveMessageTickState(message: Pick<MessageEntry, 'is_from_me' | 'status' | 'delivered_to_recipient'>): {
    status: MessageStatus;
    delivered: boolean;
} {
    const delivered = message.delivered_to_recipient === true;
    let status = message.status;

    // Per-message tick safety: chat-level read/delivery metadata must never
    // make an undelivered/pending outgoing message appear double-green.
    if (message.is_from_me && !delivered && (status === 'read' || status === 'delivered')) {
        status = 'sent';
    }

    return { status, delivered };
}

type ReceiptStatusInput = Pick<MessageEntry, 'is_from_me' | 'status' | 'delivered_to_recipient' | 'created_at'>;

type ReceiptTimestamps = {
    deliveredAt?: string | null;
    readAt?: string | null;
};

function parseReceiptTime(value?: string | null): number {
    if (!value) return NaN;
    const time = new Date(String(value).replace(' ', 'T')).getTime();
    return Number.isFinite(time) ? time : NaN;
}

export function applyOutgoingReceiptStatus<T extends ReceiptStatusInput>(message: T, receipts: ReceiptTimestamps): T {
    if (!message.is_from_me) return message;

    const status = message.status ?? 'sent';
    if (status === 'pending' || status === 'sending' || status === 'error' || status === 'failed') {
        return message;
    }

    const messageTime = parseReceiptTime(message.created_at);
    const deliveredTime = parseReceiptTime(receipts.deliveredAt);
    const readTime = parseReceiptTime(receipts.readAt);
    const readByReceipt = Number.isFinite(messageTime) && Number.isFinite(readTime) && messageTime <= readTime;
    const deliveredByReceipt = Number.isFinite(messageTime) && Number.isFinite(deliveredTime) && messageTime <= deliveredTime;
    const delivered = message.delivered_to_recipient === true || deliveredByReceipt || readByReceipt;

    return {
        ...message,
        delivered_to_recipient: delivered,
        status: readByReceipt && delivered ? 'read' : status,
    } as T;
}
