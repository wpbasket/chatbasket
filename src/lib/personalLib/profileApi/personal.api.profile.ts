import { PersonalCreateProfilePayload, PersonalGetE2EEKeyResponse, PersonalLogoutPayload, PersonalProfileResponse, PersonalUpdateE2EEKeyPayload, PersonalUpdateE2EEKeyResponse, PersonalUpdateUserProfilePayload, PresignAvatarUploadResponse, ConfirmAvatarUploadPayload } from "@/lib/personalLib";
import { apiClient, BooleanResponse } from "@/lib/constantLib";


/**
 * Handles user logout.
 * @param payload all_sessions: boolean;
 * @returns status: boolean; message: string;
 */
async function logout(payload: PersonalLogoutPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/personal/profile/logout', payload);
}

/** 
 * Handles user profile retrieval. 
 * @returns id:string; name:string; username:string; email:string; bio:string; avatar:string; avatar_tokens:string[]; profile_type:string; createdAt:string; updatedAt:string;
 */
async function getProfile(): Promise<PersonalProfileResponse> {
    return apiClient.get<PersonalProfileResponse>('/personal/profile/get-profile');
}


/**
 * Handles user profile creation.
 * @param payload name: string; bio: string; profile_type: string;
 * @returns id:string; name:string; username:string; email:string; bio:string; avatar:string; avatar_tokens:string[]; profile_type:string; createdAt:string; updatedAt:string;
 */
async function createProfile(payload: PersonalCreateProfilePayload): Promise<PersonalProfileResponse> {
    return apiClient.post<PersonalProfileResponse>('/personal/profile/create-profile', payload);
}


async function updateProfile(payload: PersonalUpdateUserProfilePayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/personal/profile/update-profile', payload);
}

async function presignAvatarUpload(): Promise<PresignAvatarUploadResponse> {
    return apiClient.post<PresignAvatarUploadResponse>('/personal/profile/presign-avatar', {});
}

async function confirmAvatarUpload(payload: ConfirmAvatarUploadPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/personal/profile/confirm-avatar', payload);
}




async function removeAvatar(): Promise<BooleanResponse> {
    return apiClient.delete<BooleanResponse>('/personal/profile/remove-avatar');
}


/**
 * Uploads/saves the current user's E2EE public key.
 * @param payload e2ee_public_key: string; (standard Base64 X25519 public key, exactly 44 chars)
 * @returns status: boolean; message: string;
 */
async function updateE2EEKey(payload: PersonalUpdateE2EEKeyPayload): Promise<PersonalUpdateE2EEKeyResponse> {
    return apiClient.post<PersonalUpdateE2EEKeyResponse>('/personal/profile/update-e2ee-key', payload);
}


/**
 * Fetches another user's E2EE public key by user ID.
 * @param userId target user's UUID
 * @returns e2ee_public_key: string | null; (null = user has not set up E2EE)
 */
async function getE2EEKey(userId: string): Promise<PersonalGetE2EEKeyResponse> {
    return apiClient.get<PersonalGetE2EEKeyResponse>('/personal/profile/get-e2ee-key', { user_id: userId });
}


export const PersonalProfileApi = {
    logout,
    getProfile,
    createProfile,
    updateProfile,
    presignAvatarUpload,
    confirmAvatarUpload,
    removeAvatar,
    updateE2EEKey,
    getE2EEKey,
}