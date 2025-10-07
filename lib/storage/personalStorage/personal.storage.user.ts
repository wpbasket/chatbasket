import { MMKV } from "react-native-mmkv";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PersonalProfileResponse } from "@/lib/personalLib";
import { $personalStateUser } from "@/state/personalState/user/personal.state.user";
import { Platform } from "react-native";

const PersonalUserKey='user-profile';
const mmkv = new MMKV({ id: 'personal-user' })
const isWeb = Platform.OS === 'web'

export const PersonalStorageSetUser = async (): Promise<void> => {
  const userData: PersonalProfileResponse | null = $personalStateUser.user.get(); 

  if (!userData) {
    return;
  }

  try {
    if (isWeb) {
      await AsyncStorage.setItem(PersonalUserKey, JSON.stringify(userData));
    } else {
      mmkv.set(PersonalUserKey, JSON.stringify(userData));
    }
  } catch {
    // no-op
  }
}

export const PersonalStorageGetUser = async (): Promise<void> => {
  try {
    if (isWeb) {
      const userData = await AsyncStorage.getItem(PersonalUserKey);
      const user=userData ? JSON.parse(userData) : null;
      $personalStateUser.user.set(user);
    } else {
      const userData = mmkv.getString(PersonalUserKey);
      const user=userData ? JSON.parse(userData) : null;
      $personalStateUser.user.set(user);
    }
  } catch {
    // no-op
  }
}

export const PersonalStorageRemoveUser = async (): Promise<void> => {
  try {
    if (isWeb) {
      await AsyncStorage.removeItem(PersonalUserKey);
    } else {
      mmkv.delete(PersonalUserKey);
    }
  } catch {
    // no-op
  }
}
