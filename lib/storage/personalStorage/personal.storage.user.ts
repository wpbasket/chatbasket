import { PersonalProfileResponse } from "@/lib/personalLib";
import { $personalStateUser } from "@/state/personalState/user/personal.state.user";
import { AppStorage } from "../storage.wrapper";

const PersonalUserKey = 'user-profile';

type PersonalUserSchema = {
  [PersonalUserKey]: PersonalProfileResponse;
};

const mmkv = new AppStorage<PersonalUserSchema>('personal-user');

export const PersonalStorageSetUser = async (userData?: PersonalProfileResponse): Promise<void> => {
  const data = userData || $personalStateUser.user.get();

  if (!data) {
    return;
  }

  await mmkv.set(PersonalUserKey, data);
};

export const PersonalStorageGetUser = async (): Promise<void> => {
  const user = await mmkv.get(PersonalUserKey);
  $personalStateUser.user.set(user);
};

export const PersonalStorageRemoveUser = async (): Promise<void> => {
  await mmkv.remove(PersonalUserKey);
};
