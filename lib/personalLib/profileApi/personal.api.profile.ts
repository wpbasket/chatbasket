import { PersonalCreateProfilePayload, PersonalLogoutPayload, PersonalProfileResponse } from "@/lib/personalLib";
import { apiClient } from "@/lib/constantLib";
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
 * @returns id:string; name:string; username:string; email:string; bio:string; avatar:string; avatar_tokens:string[]; contacts:number; profile_type:string; createdAt:string; updatedAt:string;
 */
async function getProfile(): Promise<PersonalProfileResponse> {
    return apiClient.get<PersonalProfileResponse>('/personal/profile/get-profile');
}


/**
 * Handles user profile creation.
 * @param payload name: string; bio: string; profile_type: string;
 * @returns id:string; name:string; username:string; email:string; bio:string; avatar:string; avatar_tokens:string[]; contacts:number; profile_type:string; createdAt:string; updatedAt:string;
 */
async function createProfile(payload: PersonalCreateProfilePayload): Promise<PersonalProfileResponse> {
    return apiClient.post<PersonalProfileResponse>('/personal/profile/create-profile', payload);
}

export const PersonalProfileApi = {
    logout,
    getProfile,
    createProfile
}