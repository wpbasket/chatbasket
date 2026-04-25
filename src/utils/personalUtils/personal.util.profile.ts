import { ApiError } from "@/lib/constantLib";
import { PersonalProfileApi } from "@/lib/personalLib/profileApi/personal.api.profile";
import { PersonalStorageSetUser } from "@/lib/storage/personalStorage/profile/personal.storage.user";
import { $personalStateCreateProfile } from "@/state/personalState/profile/personal.state.profile.createProfile";
import { $personalStateUser } from "@/state/personalState/user/personal.state.user";
import { syncProfileAvatar } from "./util.profileAvatar";

/**
 * Utility to fetch the user's personal profile.
 * Note: This is no longer called automatically on app boot per user request.
 */
export async function PersonalUtilGetUser() {
  try {
    // Capture the OLD file ID from the currently persisted profile
    // BEFORE overwriting state with the fresh API response
    const oldFileId = $personalStateUser.user.get()?.avatar_file_id ?? null;

    const response = await PersonalProfileApi.getProfile();
    if (response) {
      $personalStateUser.user.set(response);
      PersonalStorageSetUser(response);

      // Sync avatar: only downloads if file ID changed
      await syncProfileAvatar(response, oldFileId);
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
