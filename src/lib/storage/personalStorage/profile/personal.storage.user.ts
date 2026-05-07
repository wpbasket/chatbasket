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
  await storage.clearAll();
  await clearProfileStorage();
};

/**
 * Clears all profile-related local storage.
 * Called during logout + logged-out boot safety cleanup.
 */
export const clearProfileStorage = async (): Promise<void> => {
  // Profile AppStorage scope (Native MMKV / Web AsyncStorage)
  try {
    const storage = await getStorage();
    await storage.clearAll();
  } catch (err) {
    console.error('[ProfileStorage] AppStorage cleanup failed:', err);
  }

  if (Platform.OS === 'web') {
    try {
      const { clearAllProfileStorage } = await import('./profile.storage');
      await clearAllProfileStorage();
    } catch (err) {
      console.error('[ProfileStorage] Web storage cleanup failed:', err);
    }
  } else {
    try {
      const { Directory, Paths } = await import('expo-file-system');
      const docDir = new Directory(Paths.document);
      if (docDir.exists) {
        const entries = docDir.list();
        for (const entry of entries) {
          const name = entry.uri.split('/').pop()?.toLowerCase() || '';
          if (entry instanceof Directory && (name === 'profiles' || name.includes('profile'))) {
            try {
              entry.delete();
              console.log(`[ProfileStorage] Deleted directory: ${name}`);
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      console.error('[ProfileStorage] Native storage cleanup failed:', err);
    }
  }
};
