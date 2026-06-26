import { Platform } from "react-native";
import { FALLBACK_MIME_TYPE } from "@/lib/personalLib/fileSystem/file.download";
import { uploadFileToR2WithProgress } from "@/lib/personalLib/fileSystem/file.upload";
import { PersonalProfileApi } from "./personal.api.profile";
import type { BooleanResponse } from "@/lib/constantLib";

/**
 * Orchestrates the 3-step R2 upload process for user avatars natively.
 */
async function uploadAvatar(formData: FormData): Promise<BooleanResponse> {
    // 1. Extract file payload and mime type from FormData natively/web safely without UI changes
    let filePayload: string | Blob;
    let mimeType = FALLBACK_MIME_TYPE;

    if (Platform.OS === 'web') {
        const file = formData.get('avatar') as File | null;
        if (!file) throw new Error('No avatar file in FormData');
        filePayload = file;
        mimeType = file.type || FALLBACK_MIME_TYPE;
    } else {
        // React Native FormData exposes internal `_parts`
        const parts = (formData as any)._parts || [];
        const avatarPart = parts.find((p: any) => p[0] === 'avatar');
        if (!avatarPart || !avatarPart[1]?.uri) {
            throw new Error('No avatar file in FormData parts');
        }
        filePayload = avatarPart[1].uri;
        mimeType = avatarPart[1].type || FALLBACK_MIME_TYPE;
    }

    // 2. Presign
    const presign = await PersonalProfileApi.presignAvatarUpload();

    // 3. Upload to R2 directly
    await uploadFileToR2WithProgress(
        presign.presigned_url,
        filePayload,
        mimeType,
        () => { /* no-op progress for avatar */ }
    );

    // 4. Confirm
    return PersonalProfileApi.confirmAvatarUpload({ file_id: presign.file_id });
}

export const ProfileService = {
    uploadAvatar,
};
