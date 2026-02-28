import { MessageEntry } from '@/lib/personalLib';

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

    // If it's a file-based message, prioritize file_name
    if (msg.file_name) {
        return msg.file_name;
    }

    // Otherwise show content
    return msg.content || '';
}
