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
import mime from 'react-native-mime-types';
import type { MessageEntry } from '@/lib/personalLib';
import { storeMediaBlob, getMediaBlob } from '@/lib/storage/personalStorage/chat/chat.storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAT_FILES_DIR = 'chatFiles';
const TAG = '[FileDownload]';

/** Checks if a MIME type is supported by the system */
export function isSupportedMimeType(mimeType?: string | null): boolean {
    if (!mimeType) return false;
    // Known extensions or valid lookups mean it's supported
    return !!mime.extension(mimeType.toLowerCase());
}

/** Defaults for various media categories when the system doesn't provide a MIME type */
export const DEFAULT_MIME_TYPES = {
    image: 'image/jpeg',
    video: 'video/mp4',
    audio: 'audio/mpeg',
    file: 'application/octet-stream',
};

/** Global fallback for unknown binary streams */
export const FALLBACK_MIME_TYPE = 'application/octet-stream';

// ─── Tracker ──────────────────────────────────────────────────────────────────

/** Tracks active downloads to prevent multiple concurrent requests for the same file */
const activeDownloads = new Map<string, Promise<string | null>>();

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
        const ext = mime.extension(msg.file_mime_type.toLowerCase());
        if (ext) return `.${ext}`;
    }

    return '.bin';
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
    onProgress?: (p: number) => void
): Promise<string | null> {
    // Skip non-media messages
    if (!MEDIA_TYPES.has(msg.message_type)) return null;
    if (msg.message_type === 'unsent') return null;
    if (!msg.download_url) return null;

    // Phase 4b: Deduplicate concurrent downloads for the same message ID.
    // This prevents "other part trying to redownload" race conditions where
    // a second request fails with 401 because the first one already ACKed.
    const messageId = msg.message_id;
    const existing = activeDownloads.get(messageId);
    if (existing) {
        return existing;
    }

    const downloadPromise = (async () => {
        try {
            if (Platform.OS === 'web') {
                return await downloadForWeb(msg, onProgress);
            } else {
                return await downloadForNative(msg, onProgress);
            }
        } finally {
            // Always cleanup so future manual retries can re-attempt if it failed
            activeDownloads.delete(messageId);
        }
    })();

    activeDownloads.set(messageId, downloadPromise);
    return downloadPromise;
}

// ─── Native implementation ────────────────────────────────────────────────────

async function downloadForNative(
    msg: MessageEntry,
    onProgress?: (p: number) => void
): Promise<string | null> {
    // Phase 4b: Support SDK 55 Modern API (Zero Legacy)
    // Using standard XMLHttpRequest for progress (since Fetch streams are limited on Android)
    // and the Modern File class for localized storage.
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

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', msg.download_url!, true);
        xhr.responseType = 'arraybuffer'; // Modern & compatible way to handle binary in RN
        xhr.timeout = 15000; // 15-second timeout

        xhr.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
                const progress = (event.loaded / event.total) * 100;
                onProgress?.(progress);
            }
        };

        xhr.onload = async () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const buffer = xhr.response;
                    const uint8Array = new Uint8Array(buffer);
                    
                    // Write to Modern FileSystem
                    destFile.write(uint8Array);
                    
                    resolve(destFile.uri);
                } catch (writeErr) {
                    reject(writeErr);
                }
            } else {
                const error = new Error(`HTTP ${xhr.status}: ${xhr.statusText}`);
                (error as any).status = xhr.status;
                reject(error);
            }
        };

        xhr.onerror = () => reject(new Error('Network request failed'));
        xhr.ontimeout = () => reject(new Error('Request timed out'));

        xhr.send();
    });
}

// ─── Web implementation ───────────────────────────────────────────────────────

async function downloadForWeb(
    msg: MessageEntry,
    onProgress?: (p: number) => void
): Promise<string | null> {
    const idbUri = `idb://${msg.message_id}`;

    // Idempotent: skip if already in IndexedDB
    const existing = await getMediaBlob(msg.message_id);
    if (existing) {
        return idbUri;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15-second timeout

    try {
        const projectId = new URL(msg.download_url!).searchParams.get('project');
        const response = await fetch(msg.download_url!, {
            headers: projectId ? { 'X-Appwrite-Project': projectId } : {},
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const error = new Error(`HTTP ${response.status} downloading ${msg.download_url}`);
            (error as any).status = response.status;
            throw error;
        }

        // --- Stream progress handling ---
        const contentLength = +(response.headers.get('Content-Length') || '0');
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Response body is not readable');

        const chunks: Uint8Array[] = [];
        let receivedLength = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedLength += value.length;
            if (contentLength) onProgress?.((receivedLength / contentLength) * 100);
        }

        const blob = new Blob(chunks as any);
        // --------------------------------
        const mimeType = msg.file_mime_type || blob.type || FALLBACK_MIME_TYPE;
        const fileName = msg.file_name || `${msg.message_id}${inferExtension(msg)}`;

        await storeMediaBlob(msg.message_id, blob, mimeType, fileName);
        console.log(TAG, `Stored in IDB → ${msg.message_id}`);
        return idbUri;
    } catch (err) {
        console.error(TAG, `Failed to download ${msg.message_id}:`, err);
        throw err; // let caller decide (Rule 7: primary blocks ACK, non-primary continues)
    }
}
