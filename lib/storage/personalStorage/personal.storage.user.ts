import { PersonalProfileResponse } from "@/lib/personalLib";
import { $personalStateUser } from "@/state/personalState/user/personal.state.user";
import { AppStorage } from "../storage.wrapper";

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
};

export const PersonalStorageRemoveUser = async (): Promise<void> => {
  const storage = await getStorage();
  await storage.remove(PersonalUserKey);
};
