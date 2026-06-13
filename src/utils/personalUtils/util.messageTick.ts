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
    if (status === 'preparing' || status === 'pending' || status === 'sending' || status === 'error' || status === 'failed') {
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

// --- Bulk Unsend eligibility ---

type UnsendableMsg = Pick<MessageEntry, 'is_from_me' | 'status' | 'is_unsent' | 'message_type'>;

const UNSENDABLE_TERMINAL = new Set<MessageEntry['status']>(['preparing', 'pending', 'sending', 'error', 'failed']);

/**
 * A message is unsendable via bulk-unsend when:
 *   - it exists (not undefined/missing)
 *   - it is from the current user
 *   - it is not already unsent (flag or message_type)
 *   - it has not been read by the recipient (double green tick)
 *   - it is not in a terminal send-failure state
 */
export function isMessageUnsendable(msg: UnsendableMsg | undefined | null): boolean {
    if (!msg) return false;
    if (!msg.is_from_me) return false;
    if (msg.is_unsent || msg.message_type === 'unsent') return false;
    if (msg.status === 'read') return false;
    if (msg.status && UNSENDABLE_TERMINAL.has(msg.status)) return false;
    return true;
}

export function canBulkUnsend(
    selectedIds: string[],
    messagesById: Record<string, UnsendableMsg | undefined>,
): boolean {
    if (selectedIds.length === 0) return false;
    return selectedIds.every(id => isMessageUnsendable(messagesById[id]));
}
