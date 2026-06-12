import { MessageEntry } from '@/lib/personalLib';
import { toDisplaySafeText } from '@/lib/personalLib/e2ee/e2ee.crypto';

/**
 * Returns a user-friendly preview string for a message.
 * - Shows file_name for any file-based message types (image, file, audio, video).
 * - Shows content for normal text messages.
 * - Returns empty string for no messages.
 */
export function getPreviewText(msg: MessageEntry | null | undefined): string {
    if (!msg) return '';

    // Explicit unsent state
    // @ts-ignore - dynamic extension
    if (msg.message_type === 'unsent' || msg.is_unsent) {
        return 'Message unsent';
    }

    // If it's a file-based message, prioritize file_name.
    // Display-safety net: ChatListItem reuses last_message_content as file_name,
    // so a wrapped media key / ciphertext could land here — never render it.
    if (msg.file_name) {
        return toDisplaySafeText(msg.file_name, msg.message_type);
    }

    // Otherwise show content (sanitized — cipher-looking text → "Failed to load")
    return toDisplaySafeText(msg.content || '', msg.message_type);
}
