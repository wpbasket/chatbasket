import { File, UploadType } from 'expo-file-system';
import { Platform } from 'react-native';

const TAG = '[FileUploadR2]';

/**
 * Uploads a raw binary file to an R2 presigned URL.
 * 
 * - Native (iOS/Android): Uses Expo SDK 56 `File.createUploadTask` for true background native uploads without bridge serialization.
 * - Web: Uses `XMLHttpRequest` with raw `Blob` payloads for browser-native streaming.
 * 
 * @param presignedUrl The exact R2 PUT URL. Do not append query parameters to this URL.
 * @param fileUriOrBlob Native: `file://` URI string. Web: `Blob` or `File` object.
 * @param mimeType The exact MIME type used when generating the presigned URL.
 * @param onProgress Callback receiving progress from 0 to 100.
 */
export async function uploadFileToR2WithProgress(
    presignedUrl: string,
    fileUriOrBlob: string | Blob,
    mimeType: string,
    onProgress: (progress: number) => void,
    signal?: AbortSignal
): Promise<void> {

    // ── NATIVE OPTIMIZATION (SDK 56 Next API) ──
    if (Platform.OS !== 'web') {
        const file = new File(fileUriOrBlob as string);
        
        const uploadTask = file.createUploadTask(presignedUrl, {
            httpMethod: 'PUT',
            uploadType: UploadType.BINARY_CONTENT, // Critical: sends exact raw bytes to R2
            headers: { 'Content-Type': mimeType },
            onProgress: (task) => {
                // Ensure we don't divide by zero
                if (task.totalBytes > 0) {
                    const progress = Math.round((task.bytesSent / task.totalBytes) * 100);
                    onProgress(progress);
                }
            }
        });

        if (signal) {
            signal.addEventListener('abort', () => {
                console.log(`${TAG} Upload aborted by signal`);
                uploadTask.cancel();
            });
        }

        console.log(`${TAG} Native R2 upload started`);
        const result = await uploadTask.uploadAsync();
        
        if (result?.status && (result.status < 200 || result.status >= 300)) {
            // R2 usually returns 200 OK on successful PUT
            throw new Error(`R2 Native Upload failed with status ${result.status}`);
        }
        console.log(`${TAG} Native R2 upload finished`);
        return;
    }

    // ── WEB FALLBACK ──
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', mimeType);

        if (signal) {
            signal.addEventListener('abort', () => {
                console.log(`${TAG} Web R2 upload aborted by signal`);
                xhr.abort();
                reject(new Error('Upload aborted'));
            });
        }

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
                const progress = Math.round((event.loaded / event.total) * 100);
                onProgress(progress);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                console.log(`${TAG} Web R2 upload finished`);
                resolve();
            } else {
                reject(new Error(`R2 Web Upload failed with status ${xhr.status}: ${xhr.responseText}`));
            }
        };
        
        xhr.onerror = () => reject(new Error('Network error during Web R2 upload'));
        
        console.log(`${TAG} Web R2 upload started`);
        xhr.send(fileUriOrBlob as Blob); 
    });
}
