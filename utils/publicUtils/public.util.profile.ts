import { ApiError } from "@/lib/constantLib";
import { profileApi } from "@/lib/publicLib/profileApi/public.api.profile";
import { setUserInStorage } from "@/lib/storage/commonStorage/storage.auth";
import { authState } from "@/state/auth/state.auth";
import { createProfile$ } from "@/state/publicState/profile/public.state.profile.createProfile";

export async function getUser() {
  try {
    const response = await profileApi.getProfile();
    if (response) {
      authState.user.set(response);
      setUserInStorage();
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (['not_found'].includes(error.type)) {
        console.log('User not found');
        createProfile$.userNotFound.set(true);
      }
    }
  }
}