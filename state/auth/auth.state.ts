import { observable } from "@legendapp/state";
import { ProfileResponse } from "@/lib/publicLib/api";  

/**
 * This observable is the single source of truth for the user's auth state.
 *
 * - isLoggedIn: A boolean that components will watch to react to auth changes.
 * - sessionId/userId: Stored to be sent with every authenticated API request.
 * - user: Holds the profile data for the currently logged-in user.
 *
 * Any component can subscribe to it, and it will automatically re-render
 * when any of these values change.
 */
export const authState = observable({
  isSentOtp: false,
  isLoggedIn: false,
  sessionId: null as string | null,
  sessionExpiry: null as string | null,
  userId: null as string | null,
  user: null as ProfileResponse | null,
  avatarUri: null as string | null,
  isInTheProfileUpdateMode: false,
  name: null as string | null,
  email: null as string | null,
});