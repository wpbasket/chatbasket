import { PersonalChatApi } from "@/lib/personalLib/chatApi/personal.api.chat";
import type { MessageEntry } from "@/lib/personalLib";

/**
 * Resolves signed URLs for any messages in the list that have a file_id but no file_url.
 * Updates the message objects in-place.
 */
export async function resolveMediaUrls(messages: MessageEntry[]) {
    const fetchUrls = messages
        .filter(m =>
            (m.message_type === 'image' || m.message_type === 'file' || m.message_type === 'video' || m.message_type === 'audio') &&
            m.file_id &&
            (!m.file_url || m.file_url.includes('/download'))
        )
        .map(async (m) => {
            try {
                const res = await PersonalChatApi.getFileURL({ message_id: m.message_id });
                m.file_url = res.view_url;
            } catch (err) {
                console.warn(`[ChatMedia] Failed to fetch URL for message ${m.message_id}:`, err);
            }
        });
    await Promise.all(fetchUrls);
}
