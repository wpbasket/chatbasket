import {apiClient, fileUploadClient, type BooleanResponse} from "@/lib/constantLib";

import {
    type CheckUsernamePayload,
    type CreateUserProfilePayload,
    type LogoutPayload,
    type ProfileResponse,
    type UpdateUserProfilePayload,
    type UploadAvatarResponse
} from "@/lib/publicLib";

/**
 * Handles user logout.
 * @param payload allSessions: boolean;
 * @returns status: boolean; message: string;
 */
async function logout(payload: LogoutPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/public/profile/logout', payload); 
}

/**
 * Handles user profile creation.
 * @param payload name: string; username: string; profileVisibleTo: string; bio: string;
 * @returns id:string; name:string; username:string; email:string; bio:string; followers:number; following:number; posts:number; profileVisibleTo:string; createdAt:string; updatedAt:string;
 */
async function createProfile(payload: CreateUserProfilePayload): Promise<ProfileResponse> {
    return apiClient.post<ProfileResponse>('/public/profile/create-profile', payload);
}



/**
 * Handles user profile retrieval.
 * @returns id:string; name:string; username:string; email:string; bio:string; avatar:string; followers:number; following:number; posts:number; profileVisibleTo:string; createdAt:string; updatedAt:string;
 */
async function getProfile(): Promise<ProfileResponse> {
    return apiClient.get<ProfileResponse>('/public/profile/get-profile');
}

/**
 * Handles user profile update.
 * @param payload name: string; username: string; profileVisibleTo: string; bio: string; avatar: string;
 * @returns id:string; name:string; username:string; email:string; bio:string; avatar:string; followers:number; following:number; posts:number; profileVisibleTo:string; createdAt:string; updatedAt:string;
 */
async function updateProfile(payload: UpdateUserProfilePayload): Promise<ProfileResponse> {
    return apiClient.post<ProfileResponse>('/public/profile/update-profile', payload);
}



/**
 * Handles username availability check.
 * @param payload username: string;
 * @returns status: boolean; message: string;
 */
async function checkUsername(payload: CheckUsernamePayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/public/profile/check-username', payload);
}

async function removeAvatar(): Promise<BooleanResponse> {
    return apiClient.delete<BooleanResponse>('/public/profile/remove-avatar');
}


async function uploadAvatar(formData: FormData): Promise<UploadAvatarResponse> {
    return fileUploadClient.uploadFile<UploadAvatarResponse>('/public/profile/upload-avatar', formData);
}


export const profileApi = {
    logout,
    createProfile,
    getProfile,
    updateProfile,
    checkUsername,
    uploadAvatar,
    removeAvatar,
}