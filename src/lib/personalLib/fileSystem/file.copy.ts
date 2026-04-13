/**
 * file.copy.ts — Phase 4a
 *
 * Copies user-picked files into a private app directory so they survive
 * the picker's temporary lifecycle. Also provides orphan cleanup.
 *
 * - Native: Uses expo-file-system v55 class-based API (File, Directory, Paths).
 *   Legacy functions (copyAsync, getInfoAsync, etc.) are NOT used — they
 *   throw at runtime in v55.
 * - Web: Stores the Blob in encrypted IndexedDB via storeMediaBlob so it
 *   survives page refreshes and the outbox queue can retry failed uploads.
 */

import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { File, Directory, Paths } from 'expo-file-system';
import { storeMediaBlob, getMediaBlob } from '@/lib/storage/personalStorage/chat/chat.storage';
import { FALLBACK_MIME_TYPE } from './file.download';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CopyResult {
    /** URI pointing to the private copy (native file URI or idb:// on web). */
    localUri: string;
    /** The file name used for storage (UUID-based on native, original on web). */
    fileName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAT_FILES_DIR = 'chatFiles';
const TAG = '[FileCopy]';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the chatFiles Directory instance, creating it if it doesn't exist.
 * Only meaningful on native.
 */
function ensureChatFilesDir(): Directory {
    const dir = new Directory(Paths.document, CHAT_FILES_DIR);
    if (!dir.exists) {
        dir.create({ intermediates: true });
    }
    return dir;
}

/**
 * Extracts the file extension from a URI or filename.
 * Returns empty string if none found.
 */
function getExtension(uriOrName: string): string {
    const lastSlash = uriOrName.lastIndexOf('/');
    const basename = lastSlash >= 0 ? uriOrName.substring(lastSlash + 1) : uriOrName;
    const dotIdx = basename.lastIndexOf('.');
    if (dotIdx > 0) {
        return basename.substring(dotIdx); // includes the dot, e.g. ".jpg"
    }
    return '';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Copies a file to the app's private storage so it survives app restarts
 * and can be retried by the outbox queue if the upload fails.
 *
 * - **Web:** Fetches the blob from the URI and stores it in encrypted
 *   IndexedDB via `storeMediaBlob`. Returns `{ localUri: "idb://<tempId>", fileName }`.
 *   If a Blob is provided directly, it is stored without fetching.
 * - **Native:** Copies the file to `Paths.document/chatFiles/<uuid><ext>`,
 *   generating a unique filename via `Crypto.randomUUID()`.
 *
 * @param uri - The source URI (picker result, blob URL, etc.)
 * @param tempId - A unique ID for this file (used as the IDB key on web).
 * @param originalFileName - Optional original file name for extension detection.
 * @param mimeType - Optional MIME type (used for web IDB storage).
 * @param blob - Optional Blob to store directly (web only, avoids re-fetching).
 * @returns A `CopyResult` with the private `localUri` and `fileName`.
 */
export async function copyFileToPrivateDir(
    uri: string,
    tempId: string,
    originalFileName?: string,
    mimeType?: string,
    blob?: Blob,
): Promise<CopyResult> {
    const name = originalFileName || uri.split('/').pop() || 'file';

    if (Platform.OS === 'web') {
        return copyForWeb(uri, tempId, name, mimeType, blob);
    }

    return copyForNative(uri, name);
}

// ─── Native implementation ────────────────────────────────────────────────────

function copyForNative(uri: string, originalFileName: string): CopyResult {
    const chatDir = ensureChatFilesDir();

    // Build a unique filename preserving the original extension
    const ext = getExtension(originalFileName || uri);
    const uniqueName = `${randomUUID()}${ext}`;

    const sourceFile = new File(uri);
    const destFile = new File(chatDir, uniqueName);

    // Idempotent: if dest already exists (e.g. retry), skip copy
    if (!destFile.exists) {
        sourceFile.copy(destFile);
        console.log(TAG, `Copied → ${uniqueName}`);
    }

    return { localUri: destFile.uri, fileName: uniqueName };
}

// ─── Web implementation ───────────────────────────────────────────────────────

async function copyForWeb(
    uri: string,
    tempId: string,
    fileName: string,
    mimeType?: string,
    providedBlob?: Blob,
): Promise<CopyResult> {
    const idbUri = `idb://${tempId}`;

    // Idempotent: skip if already stored
    const existing = await getMediaBlob(tempId);
    if (existing) {
        return { localUri: idbUri, fileName };
    }

    // Get the blob — either provided directly or fetched from the URI
    let fileBlob: Blob;
    if (providedBlob) {
        fileBlob = providedBlob;
    } else {
        const response = await fetch(uri);
        fileBlob = await response.blob();
    }

    const resolvedMimeType = mimeType || fileBlob.type || FALLBACK_MIME_TYPE;
    await storeMediaBlob(tempId, fileBlob, resolvedMimeType, fileName);
    console.log(TAG, `Stored in IDB → ${tempId} (${fileName})`);

    return { localUri: idbUri, fileName };
}
