import { ApiError } from "@/lib/publicLib/api";
import { profileApi } from "@/lib/publicLib/api/profileApi/api.profile";
import { setUserInStorage } from "@/lib/storage/auth.storage";
import { authState } from "@/state/auth/auth.state";
import { createProfile$ } from "@/state/publicState/profile/createProfile.state";

export async function getUser() {
  try {
    const response = await profileApi.getProfile();
    authState.user.set(response);
    
    // Get the current user data from the state after setting it
    const user = authState.user.get();
    
    const avatarUrl = user?.avatar && user.avatarTokens?.length 
      ? `https://fra.cloud.appwrite.io/v1/storage/buckets/685bc613002edcfee6bb/files/${user.avatar}/view?project=6858ed4d0005c859ea03&token=${user.avatarTokens[2]}` 
      : '';
      
    authState.avatarUri.set(avatarUrl);
    setUserInStorage();
  } catch (error) {
    if (error instanceof ApiError) {
      if (['not_found'].includes(error.type)) {
        console.log('User not found');
        createProfile$.userNotFound.set(true);
      }
    }
  }
}