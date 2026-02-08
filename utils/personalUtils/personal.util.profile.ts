import { ApiError } from "@/lib/constantLib";
import { PersonalProfileApi } from "@/lib/personalLib/profileApi/personal.api.profile";
import { PersonalStorageSetUser } from "@/lib/storage/personalStorage/personal.storage.user";
import { $personalStateCreateProfile } from "@/state/personalState/profile/personal.state.profile.createProfile";
import { $personalStateUser } from "@/state/personalState/user/personal.state.user";

export async function PersonalUtilGetUser() {
  try {
    const response = await PersonalProfileApi.getProfile();
    if (response) {
      $personalStateUser.user.set(response);
      PersonalStorageSetUser(response);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (['not_found'].includes(error.type)) {
        $personalStateUser.user.set(null);
        PersonalStorageSetUser(null as any);
        console.log('User profile not found');
        $personalStateCreateProfile.userNotFound.set(true);
      }
    }
  }
}