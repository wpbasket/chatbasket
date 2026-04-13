/**
 * file.download.ts — Phase 4b
 *
 * Downloads incoming media files to local storage before ACK.
 *
 * - Native: Uses `File.downloadFileAsync()` to save to `chatFiles/` dir.
 * - Web: Uses `fetch()` + `storeMediaBlob()` to save encrypted in IndexedDB.
 *
 * Both paths are idempotent — if the file/blob already exists, skip download.
 */

import { Platform } from 'react-native';
import type { MessageEntry } from '@/lib/personalLib';
import { storeMediaBlob, getMediaBlob } from '@/lib/storage/personalStorage/chat/chat.storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAT_FILES_DIR = 'chatFiles';
const TAG = '[FileDownload]';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Media types that require file download */
const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'file']);

/**
 * Extracts the file extension from a URL, file_name, or mime type.
 */
function inferExtension(msg: MessageEntry): string {
    // 1. Try from file_name
    if (msg.file_name) {
        const dotIdx = msg.file_name.lastIndexOf('.');
        if (dotIdx > 0) return msg.file_name.substring(dotIdx);
    }

    // 2. Try from download_url
    if (msg.download_url) {
        const urlPath = msg.download_url.split('?')[0];
        const lastDot = urlPath.lastIndexOf('.');
        if (lastDot > 0) {
            const ext = urlPath.substring(lastDot);
            if (ext.length <= 6) return ext; // reasonable extension length
        }
    }

    // 3. Fallback from mime type
    if (msg.file_mime_type) {
        const mimeMap: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/heic': '.heic',
            'video/mp4': '.mp4',
            'video/mov': '.mov',
            'video/webm': '.webm',
            'audio/mpeg': '.mp3',
            'audio/mp4': '.m4a',
            'audio/aac': '.aac',
            'audio/ogg': '.ogg',
            'audio/wav': '.wav',
            'application/pdf': '.pdf',
        };
        const ext = mimeMap[msg.file_mime_type.toLowerCase()];
        if (ext) return ext;
    }

    return '';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Downloads an incoming media file to local storage.
 *
 * Call this BEFORE sending the delivery ACK so the server doesn't
 * delete the file before we've saved it locally.
 *
 * - Returns `null` for text/unsent messages or messages without `download_url`.
 * - **Native:** Downloads to `Paths.document/chatFiles/<msgId><ext>` via
 *   `File.downloadFileAsync()`. Idempotent: skips if dest file exists.
 * - **Web:** `fetch()` → `storeMediaBlob()` into encrypted IndexedDB.
 *   Returns `idb://<messageId>` as the local URI marker.
 *   Idempotent: skips if blob already exists in IDB.
 *
 * @param msg - The incoming `MessageEntry` from the WebSocket event.
 * @returns The local URI string, or `null` if no download needed.
 */
export async function downloadIncomingFile(
    msg: MessageEntry,
): Promise<string | null> {
    // Skip non-media messages
    if (!MEDIA_TYPES.has(msg.message_type)) return null;
    if (msg.message_type === 'unsent') return null;
    if (!msg.download_url) return null;

    if (Platform.OS === 'web') {
        return downloadForWeb(msg);
    } else {
        return downloadForNative(msg);
    }
}

// ─── Native implementation ────────────────────────────────────────────────────

async function downloadForNative(msg: MessageEntry): Promise<string | null> {
    const { File, Directory, Paths } = await import('expo-file-system');

    // Ensure chatFiles/ directory exists
    const chatDir = new Directory(Paths.document, CHAT_FILES_DIR);
    if (!chatDir.exists) {
        chatDir.create({ intermediates: true });
    }

    // Build destination: chatFiles/<messageId><ext>
    const ext = inferExtension(msg);
    const destFile = new File(chatDir, `${msg.message_id}${ext}`);

    // Idempotent: skip if already downloaded
    if (destFile.exists) {
        return destFile.uri;
    }

    try {
        const downloaded = await File.downloadFileAsync(msg.download_url!, destFile);
        console.log(TAG, `Downloaded → ${downloaded.name}`);
        return downloaded.uri;
    } catch (err) {
        console.error(TAG, `Failed to download ${msg.message_id}:`, err);
        throw err; // let caller decide (Rule 7: primary blocks ACK, non-primary continues)
    }
}

// ─── Web implementation ───────────────────────────────────────────────────────

async function downloadForWeb(msg: MessageEntry): Promise<string | null> {
    const idbUri = `idb://${msg.message_id}`;

    // Idempotent: skip if already in IndexedDB
    const existing = await getMediaBlob(msg.message_id);
    if (existing) {
        return idbUri;
    }

    try {
        const projectId = new URL(msg.download_url!).searchParams.get('project');
        const response = await fetch(msg.download_url!, {
            headers: projectId ? { 'X-Appwrite-Project': projectId } : {},
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} downloading ${msg.download_url}`);
        }

        const blob = await response.blob();
        const mimeType = msg.file_mime_type || blob.type || 'application/octet-stream';
        const fileName = msg.file_name || `${msg.message_id}${inferExtension(msg)}`;

        await storeMediaBlob(msg.message_id, blob, mimeType, fileName);
        console.log(TAG, `Stored in IDB → ${msg.message_id}`);
        return idbUri;
    } catch (err) {
        console.error(TAG, `Failed to download ${msg.message_id}:`, err);
        throw err; // let caller decide (Rule 7: primary blocks ACK, non-primary continues)
    }
}
