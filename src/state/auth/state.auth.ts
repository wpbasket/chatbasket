import { ProfileResponse } from "@/lib/publicLib";
import { observable } from "@legendapp/state";

export const authState = observable({
  isSentOtp: false,
  isLoggedIn: false,
  sessionId: null as string | null,
  sessionExpiry: null as string | null,
  userId: null as string | null,
  user: null as ProfileResponse | null,
  isInTheProfileUpdateMode: false,
  name: null as string | null,
  email: null as string | null,
  isPrimary: null as boolean | null,
  primaryDeviceName: null as string | null,
});