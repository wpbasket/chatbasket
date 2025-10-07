import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';

/**
 * Append a single ImagePickerAsset to an existing FormData under a given field name.
 * - Web: prefer the web File (`asset.file`) per Expo Image Picker docs; fall back to fetch(uri)->Blob.
 * - Native: use the RN file object shape { uri, name, type }.
 */
export async function appendAssetToFormData(
  formData: FormData,
  asset: ImagePickerAsset,
  options: { fieldName?: string; filename?: string; mimeType?: string } = {}
): Promise<void> {
  const fieldName = options.fieldName ?? 'file';
  const filename = options.filename ?? asset.fileName ?? `file_${Date.now()}`;
  const mimeType = options.mimeType ?? asset.mimeType ?? 'application/octet-stream';

  if (Platform.OS === 'web') {
    const maybeFile = (asset as any).file as any;
    // Heuristic: Expo ImagePicker on web provides a File-like object with name and size
    if (maybeFile && typeof maybeFile === 'object' && typeof maybeFile.name === 'string' && typeof maybeFile.size === 'number') {
      formData.append(fieldName, maybeFile, maybeFile.name || filename);
      return;
    }

    const res = await fetch(asset.uri);
    let blob = await res.blob();
    if (!blob.type) {
      blob = new Blob([blob], { type: mimeType });
    }
    formData.append(fieldName, blob, filename);
    return;
  }

  // iOS/Android
  formData.append(fieldName, {
    uri: asset.uri,
    name: filename,
    type: mimeType,
  } as any);
}

/**
 * Build a FormData containing a single ImagePickerAsset.
 */
export async function buildFormDataFromAsset(
  asset: ImagePickerAsset,
  options: { fieldName?: string; filename?: string; mimeType?: string } = {}
): Promise<FormData> {
  const fd = new FormData();
  await appendAssetToFormData(fd, asset, options);
  return fd;
}

 
