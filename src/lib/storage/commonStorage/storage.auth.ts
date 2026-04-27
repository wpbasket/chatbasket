import { ProfileResponse } from "@/lib/publicLib";
import { authState } from "@/state/auth/state.auth";
import { Platform } from 'react-native';
import { AppStorage } from "../storage.wrapper";
import { appMode$ } from "@/state/appMode/state.appMode";

// Define the schema for Auth storage
type AuthSchema = {
  sessionId: string;
  userId: string;
  sessionExpiry: string;
  user: ProfileResponse;
};

let authStorage: AppStorage<AuthSchema> | null = null;

/**
 * Initialize the secure auth storage instance.
 * Must be called at app startup.
 */
export const initializeSecureStorage = async (): Promise<void> => {
  try {
    authStorage = await AppStorage.createSecure<AuthSchema>('secure-auth-storage');

    // Quick verification (Native Only)
    if (Platform.OS !== 'web') {
      const TEST_KEY = '__cb_init_check';
      await authStorage.set(TEST_KEY as any, 'verified');
      const val = await authStorage.get(TEST_KEY as any);
      await authStorage.remove(TEST_KEY as any);
      if (val !== 'verified') {
        throw new Error('Auth storage verification failed');
      }
    }
  } catch (error) {
    console.error('Failed to initialize secure storage:', error);
    throw error;
  }
};

const getStorage = (): AppStorage<AuthSchema> => {
  if (!authStorage) {
    throw new Error('Secure storage not initialized. Call initializeSecureStorage() first.');
  }
  return authStorage;
};

export const setSession = async (session: { sessionId: string; userId: string; sessionExpiry: string; user?: ProfileResponse | null }) => {
  const { sessionId, userId, sessionExpiry, user } = session;
  const storage = getStorage();

  if (Platform.OS === 'web') {
    // Web: Only store session expiry
    await storage.set('sessionExpiry', sessionExpiry);
  } else {
    // Native: Store all session data atomically
    await storage.setMany({
      sessionId,
      userId,
      sessionExpiry,
      user: user || undefined
    } as any);
  }

  // Update auth state
  authState.sessionId.set(sessionId || '');
  authState.userId.set(userId || '');
  authState.sessionExpiry.set(sessionExpiry);
  authState.isLoggedIn.set(true);
  authState.isSentOtp.set(false);

  // Trigger hydration of personal modules (contacts, chats, etc.) 
  // immediately after successful login without requiring a manual refresh.
  // We use a dynamic import here to avoid a circular dependency with storage.init.
  void import('@/lib/storage/storage.init').then((m) => m.hydratePersonalModules());
};

export const getSession = async () => {
  const storage = getStorage();

  if (Platform.OS === 'web') {
    // Web: Only retrieve session expiry and user from storage
    const data = await storage.getMany(['sessionExpiry', 'user']);
    return {
      sessionId: '',
      userId: '',
      sessionExpiry: data.sessionExpiry || null,
      user: data.user || null,
    };
  } else {
    // Native: Retrieve all session data
    const data = await storage.getMany(['sessionId', 'userId', 'sessionExpiry', 'user']);
    return {
      sessionId: data.sessionId || '',
      userId: data.userId || '',
      sessionExpiry: data.sessionExpiry || null,
      user: data.user || null,
    };
  }
};

export const clearSession = async (options?: { skipAuthStateReset?: boolean }) => {
  const storage = getStorage();

  // Phase D: Stop outbox queue + connection watcher FIRST — before clearing auth tokens.
  // Abort in-flight requests immediately to prevent leaked writes after logout.
  try {
    const { connectionWatcher } = await import('@/lib/personalLib/chatApi/connection.watcher');
    const { outboxQueue } = await import('@/lib/personalLib/chatApi/outbox.queue');
    outboxQueue.abortInFlightRequests(); // Abort active HTTP requests immediately
    outboxQueue.pause(); // Stop the queue loop
    connectionWatcher.stop(); // Stop WS connection
  } catch (error) {
    console.log('Failed to stop outbox/connection watcher:', error);
  }

  // Clear all session data in this scope
  await storage.clearAll();

  // Clear preferences storage for both platforms
  try {
    const { PreferencesStorage } = await import('./storage.preferences');
    PreferencesStorage.clearTheme();
    PreferencesStorage.clearMode();
  } catch (error) {
    console.log('Failed to clear preferences storage:', error);
  }

  // Clear personal user storage for both platforms (Chats, Contacts, Profile, Devices)
  try {
    const { PersonalStorageRemoveChat } = await import('@/lib/storage/personalStorage/chat/personal.storage.chat');
    const { PersonalStorageRemoveUser } = await import('@/lib/storage/personalStorage/profile/personal.storage.user');
    const { PersonalStorageRemoveContacts, PersonalStorageRemoveContactRequests } = await import('../personalStorage/personal.storage.contacts');
    const { PersonalStorageRemoveDeviceStatus } = await import('@/lib/storage/personalStorage/personal.storage.device');

    await PersonalStorageRemoveChat();
    await PersonalStorageRemoveUser();
    await PersonalStorageRemoveContacts();
    await PersonalStorageRemoveContactRequests();
    await PersonalStorageRemoveDeviceStatus();
  } catch (error) {
    console.log('Failed to clear personal user storage:', error);
  }

  if (!options?.skipAuthStateReset) {
    resetAuthStateAfterLogout();
  }

  // Reset Domain Observables (In-memory Cleanup)
  try {
    const { $contactsState, $contactRequestsState } = await import("@/state/personalState/contacts/personal.state.contacts");
    const { $personalStateUser } = await import("@/state/personalState/user/personal.state.user");
    const { $chatMessagesState, $chatListState } = await import("@/state/personalState/chat/personal.state.chat");

    $contactsState.reset();
    $contactRequestsState.reset();
    $personalStateUser.user.set(null);
    $personalStateUser.avatarUri.set(null);
    $chatMessagesState.reset();
    $chatListState.reset();
  } catch (error) {
    console.log('Failed to reset domain observables:', error);
  }

  // Reset the hydration gate so the next login re-initializes everything
  // (re-opens SQLite, reloads contacts, restarts connection watcher).
  // This is the critical fix: without it, hydratePersonalModules() returns
  // immediately on re-login because the old resolved promise is still cached,
  // leaving db=null and causing "Database not initialized" errors.
  try {
    const { resetPersonalHydration } = await import('@/lib/storage/storage.init');
    resetPersonalHydration();
  } catch (error) {
    console.log('Failed to reset hydration:', error);
  }
};

export const resetAuthStateAfterLogout = () => {
  // Clear auth state for both platforms (Exhaustive)
  authState.set({
    isSentOtp: false,
    isLoggedIn: false,
    sessionId: null,
    sessionExpiry: null,
    userId: null,
    user: null,
    isInTheProfileUpdateMode: false,
    name: null,
    email: null,
    isPrimary: null,
    primaryDeviceName: null,
  });

  // Reset App Mode to Public
  try {
    appMode$.mode.set('public');
  } catch (error) {
    console.log('Failed to reset app mode:', error);
  }
};

export const isSessionExpired = async (): Promise<boolean> => {
  const session = await getSession();
  if (!session.sessionExpiry) return true;

  const expiryTime = new Date(session.sessionExpiry).getTime();
  const currentTime = new Date().getTime();

  return currentTime >= expiryTime;
};

export const restoreAuthState = async (): Promise<void> => {
  // CRITICAL: If we are already logged in in-memory (e.g. just completed login handshake),
  // DO NOT restore from storage and risk clearing the session due to race conditions.
  if (authState.isLoggedIn.get()) {
    console.log('[StorageAuth] Skipping restoreAuthState - already logged in');
    return;
  }

  try {
    const session = await getSession();
    const isExpired = !session.sessionExpiry || (new Date(session.sessionExpiry).getTime() <= Date.now());

    if (session.sessionExpiry && !isExpired) {
      // Session is valid, restore auth state
      if (Platform.OS === 'web') {
        authState.sessionId.set('');
        authState.userId.set('');
        authState.sessionExpiry.set(session.sessionExpiry);
        authState.user.set(session.user);
        authState.isLoggedIn.set(true);
        const { PersonalStorageGetDeviceStatus } = await import('@/lib/storage/personalStorage/personal.storage.device');
        await PersonalStorageGetDeviceStatus();
      } else {
        if (session.sessionId && session.userId) {
          authState.sessionId.set(session.sessionId);
          authState.userId.set(session.userId);
          authState.sessionExpiry.set(session.sessionExpiry);
          authState.user.set(session.user);
          authState.isLoggedIn.set(true);
          const { PersonalStorageGetDeviceStatus } = await import('@/lib/storage/personalStorage/personal.storage.device');
          await PersonalStorageGetDeviceStatus();
        } else {
          await clearSession();
        }
      }
    } else {
      await clearSession();
    }
  } catch (error) {
    console.log('Failed to restore auth state:', error);
    await clearSession();
  }
};


export const isUserAuthenticated = (): boolean => {
  const currentExpiry = authState.sessionExpiry.get();
  const isLoggedIn = authState.isLoggedIn.get();

  if (!isLoggedIn || !currentExpiry) return false;

  return new Date(currentExpiry) > new Date();
};

export const getCurrentSessionInfo = () => {
  return {
    sessionId: authState.sessionId.get(),
    userId: authState.userId.get(),
    sessionExpiry: authState.sessionExpiry.get(),
    user: authState.user.get(),
    isLoggedIn: authState.isLoggedIn.get(),
    isSentOtp: authState.isSentOtp.get()
  };
};

export const clearAuthState = () => {
  authState.isLoggedIn.set(false);
  authState.userId.set(null);
  authState.sessionId.set(null);
  authState.sessionExpiry.set(null);
  authState.user.set(null);
  authState.isSentOtp.set(false);
};

export const setUserInStorage = async (): Promise<void> => {
  const userData: ProfileResponse | null = authState.user.get();
  if (!userData) return;

  const storage = getStorage();
  await storage.set('user', userData);
};