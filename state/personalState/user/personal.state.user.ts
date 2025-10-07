import { PersonalProfileResponse } from "@/lib/personalLib";
import { observable } from "@legendapp/state";

export const $personalStateUser = observable({
  user: null as PersonalProfileResponse | null,
  avatarUri: null as string | null,
});