import { PersonalProfileResponse } from "@/lib/personalLib";
import { $personalStateUser } from "@/state/personalState/user/personal.state.user";
import { AppStorage } from "../../storage.wrapper";
import { Platform } from 'react-native';

const PersonalUserKey = 'user-profile';

type PersonalUserSchema = {
  [PersonalUserKey]: PersonalProfileResponse;
};

let mmkv: AppStorage<PersonalUserSchema> | null = null;

const getStorage = async (): Promise<AppStorage<PersonalUserSchema>> => {
  if (!mmkv) {
    mmkv = await AppStorage.createSecure<PersonalUserSchema>('personal-user');
  }
  return mmkv;
};

export const PersonalStorageSetUser = async (userData?: PersonalProfileResponse): Promise<void> => {
  const data = userData || $personalStateUser.user.get();

  if (!data) {
    return;
  }

  const storage = await getStorage();
  await storage.set(PersonalUserKey, data);
};

export const PersonalStorageGetUser = async (): Promise<void> => {
  const storage = await getStorage();
  const user = await storage.get(PersonalUserKey);
  $personalStateUser.user.set(user);

  // Phase 1: Restore avatar URI from local file (no network)
  if (user) {
    const { restoreProfileAvatar } = await import('@/utils/personalUtils/util.profileAvatar');
    await restoreProfileAvatar();
  }
};

export const PersonalStorageRemoveUser = async (): Promise<void> => {
  const storage = await getStorage();
  await storage.remove(PersonalUserKey);
  // Clear associated profile storage (avatar, etc.)
  await clearProfileStorage();
};

/**
 * Clears all profile-related local storage.
 * Called during logout. Add future profile storage cleanup here.
 */
export const clearProfileStorage = async (): Promise<void> => {
  // Avatar files (Native: filesystem, Web: dedicated IndexedDB)
  if (Platform.OS === 'web') {
    try {
      const { deleteProfileAvatarBlob } = await import('./profile.storage');
      await deleteProfileAvatarBlob();
    } catch (err) {
      console.error('[ProfileStorage] Web avatar cleanup failed:', err);
    }
  } else {
    try {
      const { File, Directory, Paths } = await import('expo-file-system');
      const profileDir = new Directory(Paths.document, 'profiles');
      if (profileDir.exists) {
        const avatarFile = new File(profileDir, 'me_avatar.jpg');
        if (avatarFile.exists) {
          avatarFile.delete();
        }
      }
    } catch (err) {
      console.error('[ProfileStorage] Native avatar cleanup failed:', err);
    }
  }

  // Future: add more profile-related storage cleanup here
};
