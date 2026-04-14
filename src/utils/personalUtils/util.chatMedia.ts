import { ChatTransport } from "@/lib/personalLib/chatApi/chat.transport";
import type { MessageEntry } from "@/lib/personalLib";
import { MEDIA_REFRESH_BUFFER_MS } from "@/lib/personalLib/constant/constant.chat";
import { updateMessageStatus } from "@/lib/storage/personalStorage/chat/chat.storage";
import { ApiError } from "@/lib/constantLib";

/**
 * Checks if a file token is expired or nearly expired (within the buffer).
 */
export function isTokenNearlyExpired(expiry: string | null | undefined): boolean {
    if (!expiry) return true; // Treat missing as expired
    const expiryTime = new Date(expiry).getTime();
    const now = Date.now();
    return (expiryTime - now) <= MEDIA_REFRESH_BUFFER_MS;
}

/**
 * Returns the best available URI for a message (local path first, then download/view URLs).
 */
export function getMessageUri(m: Partial<MessageEntry>): string | undefined {
    return m.local_uri || m.download_url || m.view_url;
}

/**
 * Resolves signed URLs for any messages in the list that have a file_id but no valid remote URI,
 * or have an expiring token.
 * Updates the message objects in-place and persists error status to DB if retrieval fails.
 */
export async function resolveMediaUrls(messages: MessageEntry[]) {
    const fetchUrls = messages
        .filter(m => {
            const isMedia = (m.message_type === 'image' || m.message_type === 'file' || m.message_type === 'video' || m.message_type === 'audio');
            
            const remoteUrl = m.download_url || m.view_url;
            const hasUrl = !!(remoteUrl || m.local_uri);
            const needsRefresh = isMedia && m.file_id && !m.local_uri && 
                (!hasUrl || isTokenNearlyExpired(m.file_token_expiry));
            
            return needsRefresh;
        })
        .map(async (m) => {
            try {
                const res = await ChatTransport.getFileURL({ message_id: m.message_id });
                m.view_url = res.view_url;
                m.download_url = res.download_url;
                m.file_token_expiry = res.file_token_expiry;
                
                // If the message was previously in error state but we just got an URL, 
                // we could potentially clear it, but let's stick to error reporting for now.
            } catch (err) {
                console.warn(`[ChatMedia] Failed to fetch URL for message ${m.message_id}:`, err);
                
                // ONLY mark as error if the server explicitly says it's gone (404).
                // Network errors or 500s should be retried later.
                if (err instanceof ApiError && err.code === 404) {
                    m.status = 'error';
                    await updateMessageStatus(m.message_id, { status: 'error' } as any);
                }
            }
        });

    await Promise.all(fetchUrls);
}
