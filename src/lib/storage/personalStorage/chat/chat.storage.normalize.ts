import type { ChatEntry } from '@/lib/personalLib';

const CHAT_STATUS_VALUES = new Set([
    'pending',
    'sending',
    'sent',
    'delivered',
    'read',
    'error',
]);

function asString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    return String(value);
}

function asNonEmptyString(value: unknown): string | null {
    const str = asString(value).trim();
    return str.length > 0 ? str : null;
}

function asNullableString(value: unknown): string | null {
    const str = asString(value).trim();
    return str.length > 0 ? str : null;
}

function asTimestamp(value: unknown): string | null {
    const raw = asNonEmptyString(value);
    if (!raw) return null;
    const normalized = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
    const ms = Date.parse(normalized);
    return Number.isNaN(ms) ? null : raw;
}

function asBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
    return false;
}

function asUnreadCount(value: unknown): number {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return 0;
    const intNum = Math.trunc(num);
    return intNum < 0 ? 0 : intNum;
}

function asMessageStatus(value: unknown): string {
    const status = asString(value).trim().toLowerCase();
    return CHAT_STATUS_VALUES.has(status) ? status : 'sent';
}

export function normalizeChatEntry(input: Partial<ChatEntry> | null | undefined): ChatEntry | null {
    if (!input) return null;

    const chatId = asNonEmptyString(input.chat_id);
    const otherUserId = asNonEmptyString(input.other_user_id);
    if (!chatId || !otherUserId) return null;

    const now = new Date().toISOString();
    const createdAt =
        asTimestamp(input.created_at) ??
        asTimestamp(input.last_message_created_at) ??
        now;
    const updatedAt = asTimestamp(input.updated_at) ?? createdAt;

    let lastMessageId = asNullableString(input.last_message_id);
    let lastMessageContent = asNullableString(input.last_message_content);
    let lastMessageType = asNullableString(input.last_message_type);
    let lastMessageCreatedAt =
        asTimestamp(input.last_message_created_at) ??
        (lastMessageId ? updatedAt : null);
    let lastMessageIsFromMe = asBoolean(input.last_message_is_from_me);
    let lastMessageStatus = asMessageStatus(input.last_message_status);
    let lastMessageSenderId = asNullableString((input as any).last_message_sender_id);
    let lastMessageIsUnsent = asBoolean((input as any).last_message_is_unsent);

    if (!lastMessageId) {
        lastMessageContent = null;
        lastMessageType = null;
        lastMessageCreatedAt = null;
        lastMessageIsFromMe = false;
        lastMessageStatus = 'sent';
        lastMessageSenderId = null;
        lastMessageIsUnsent = false;
    }

    const normalized: ChatEntry = {
        chat_id: chatId,
        other_user_id: otherUserId,
        other_user_name: asString(input.other_user_name),
        other_user_username: asString(input.other_user_username),
        avatar_url: asNullableString(input.avatar_url),
        created_at: createdAt,
        updated_at: updatedAt,
        other_user_last_read_at: asString(input.other_user_last_read_at),
        other_user_last_delivered_at: asString(input.other_user_last_delivered_at),
        last_message_content: lastMessageContent,
        last_message_created_at: lastMessageCreatedAt,
        last_message_type: lastMessageType,
        last_message_is_from_me: lastMessageIsFromMe,
        last_message_status: lastMessageStatus,
        last_message_sender_id: lastMessageSenderId ?? null,
        last_message_id: lastMessageId,
        last_message_is_unsent: lastMessageIsUnsent,
        unread_count: asUnreadCount(input.unread_count),
        is_contactable: input.is_contactable !== false, // default true; only false when explicitly set
    };

    return normalized;
}

export function normalizeChatEntries(inputs: Array<Partial<ChatEntry> | null | undefined>): ChatEntry[] {
    if (!Array.isArray(inputs) || inputs.length === 0) return [];
    const normalized: ChatEntry[] = [];
    for (const input of inputs) {
        const row = normalizeChatEntry(input);
        if (row) normalized.push(row);
    }
    return normalized;
}
