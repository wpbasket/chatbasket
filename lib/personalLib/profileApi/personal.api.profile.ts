import { PersonalCreateProfilePayload, PersonalLogoutPayload, PersonalProfileResponse, PersonalUpdateUserProfilePayload } from "@/lib/personalLib";
import { apiClient, fileUploadClient } from "@/lib/constantLib";
import { BooleanResponse } from "@/lib/constantLib";



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


async function uploadAvatar(formData: FormData): Promise<BooleanResponse> {
    return fileUploadClient.uploadFile<BooleanResponse>('/personal/profile/upload-avatar', formData);
}


async function removeAvatar(): Promise<BooleanResponse> {
    return apiClient.delete<BooleanResponse>('/personal/profile/remove-avatar');
}


export const PersonalProfileApi = {
    logout,
    getProfile,
    createProfile,
    updateProfile,
    uploadAvatar,
    removeAvatar
}