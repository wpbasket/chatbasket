import { ProfileResponse } from "@/lib/publicLib";
import { authState } from "@/state/auth/state.auth";
import { Platform } from 'react-native';
import { AppStorage } from "../storage.wrapper";
import { appMode$ } from "@/state/appMode/state.appMode";
import {
  PersonalStorageGetDeviceStatus,
  PersonalStorageRemoveDeviceStatus,
} from "@/lib/storage/personalStorage/personal.storage.device";

// Define the schema for Auth storage
type AuthSchema = {
  sessionId: string;
  userId: string;
  sessionExpiry: string;
  user: ProfileResponse;
  keys_revision: number;
  own_keys_initialized: boolean;
};

let authStorage: AppStorage<AuthSchema> | null = null;

/**
 * Initialize the secure auth storage instance.
 * Must be called at app startup.
 */
export const initializeSecureStorage = async (): Promise<void> => {
  try {
    authStorage = await AppStorage.createSecure<AuthSchema>('secure-auth-storage', { webBackend: 'indexeddb' });

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

export const setSession = async (session: { sessionId: string; userId: string; sessionExpiry: string; keys_revision?: number; user?: ProfileResponse | null }) => {
  const { sessionId, userId, sessionExpiry, user, keys_revision } = session;
  const storage = getStorage();

  if (Platform.OS === 'web') {
    // Web: store session expiry plus E2EE revision metadata and userId
    await storage.setMany({
      userId,
      sessionExpiry,
      keys_revision: keys_revision ?? 0,
      own_keys_initialized: false,
    } as any);
  } else {
    // Native: Store all session data atomically
    await storage.setMany({
      sessionId,
      userId,
      sessionExpiry,
      keys_revision: keys_revision ?? 0,
      own_keys_initialized: false,
      user: user || undefined
    } as any);
  }

  // Update auth state
  authState.sessionId.set(sessionId || '');
  authState.userId.set(userId || '');
  authState.sessionExpiry.set(sessionExpiry);
  authState.keys_revision.set(keys_revision ?? 0);
  authState.isLoggedIn.set(true);
  authState.isSentOtp.set(false);

  // Trigger hydration of personal modules (contacts, chats, etc.) 
  // immediately after successful login without requiring a manual refresh.
  // Use sync require inside the function so Metro bundles the module on native;
  // runtime import() can create lazy chunk IDs that fail during cold cleanup.
  try {
    const { hydratePersonalModules } = require('@/lib/storage/storage.init');
    void hydratePersonalModules();
  } catch (error) {
    console.log('Failed to trigger personal hydration:', error);
  }
};

export const getSession = async () => {
  const storage = getStorage();

  if (Platform.OS === 'web') {
    // Web: Only retrieve session expiry, user, and userId from storage
    const data = await storage.getMany(['sessionExpiry', 'user', 'keys_revision', 'own_keys_initialized', 'userId']);
    return {
      sessionId: '',
      userId: data.userId || '',
      sessionExpiry: data.sessionExpiry || null,
      user: data.user || null,
      keys_revision: data.keys_revision ?? 0,
      own_keys_initialized: data.own_keys_initialized === true,
    };
  } else {
    // Native: Retrieve all session data
    const data = await storage.getMany(['sessionId', 'userId', 'sessionExpiry', 'user', 'keys_revision', 'own_keys_initialized']);
    return {
      sessionId: data.sessionId || '',
      userId: data.userId || '',
      sessionExpiry: data.sessionExpiry || null,
      user: data.user || null,
      keys_revision: data.keys_revision ?? 0,
      own_keys_initialized: data.own_keys_initialized === true,
    };
  }
};

export const clearSession = async (options?: { skipAuthStateReset?: boolean }) => {
  const storage = getStorage();

  // Phase D: Stop outbox queue + connection watcher FIRST — before clearing auth tokens.
  // Abort in-flight requests immediately to prevent leaked writes after logout.
  try {
    const { connectionWatcher } = require('@/lib/personalLib/chatApi/connection.watcher');
    const { outboxQueue } = require('@/lib/personalLib/chatApi/outbox.queue');
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
    const { PreferencesStorage } = require('./storage.preferences');
    PreferencesStorage.clearTheme();
    PreferencesStorage.clearMode();
  } catch (error) {
    console.log('Failed to clear preferences storage:', error);
  }

  // Clear personal user storage for both platforms (Chats, Contacts, Profile, Devices)
  try {
    const { PersonalStorageRemoveChat } = require('@/lib/storage/personalStorage/chat/personal.storage.chat');
    const { PersonalStorageRemoveUser } = require('@/lib/storage/personalStorage/profile/personal.storage.user');
    const { PersonalStorageRemoveContacts, PersonalStorageRemoveContactRequests } = require('../personalStorage/personal.storage.contacts');

    await PersonalStorageRemoveChat();
    await PersonalStorageRemoveUser();
    await PersonalStorageRemoveContacts();
    await PersonalStorageRemoveContactRequests();
    await PersonalStorageRemoveDeviceStatus();
  } catch (error) {
    console.log('Failed to clear personal user storage:', error);
  }

  // E2EE: delete the device identity keypair. Pending messages were already
  // fetched + decrypted earlier in the logout flow — after this point any
  // remaining undelivered ciphertext is unrecoverable (strict E2EE by design).
  try {
    const { deleteLocalE2EEKeys } = require('@/lib/personalLib/e2ee/e2ee.keys');
    await deleteLocalE2EEKeys();
  } catch (error) {
    console.log('Failed to delete local E2EE keys:', error);
  }

  if (!options?.skipAuthStateReset) {
    resetAuthStateAfterLogout();
  }

  // Reset Domain Observables (In-memory Cleanup)
  try {
    const { $contactsState, $contactRequestsState } = require("@/state/personalState/contacts/personal.state.contacts");
    const { $personalStateUser } = require("@/state/personalState/user/personal.state.user");
    const { $chatMessagesState, $chatListState } = require("@/state/personalState/chat/personal.state.chat");

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
    const { resetPersonalHydration } = require('@/lib/storage/storage.init');
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
    keys_revision: null,
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
        authState.userId.set(session.userId || '');
        authState.sessionExpiry.set(session.sessionExpiry);
        authState.user.set(session.user);
        authState.keys_revision.set(session.keys_revision ?? 0);
        authState.isLoggedIn.set(true);
        await PersonalStorageGetDeviceStatus();
      } else {
        if (session.sessionId && session.userId) {
          authState.sessionId.set(session.sessionId);
          authState.userId.set(session.userId);
          authState.sessionExpiry.set(session.sessionExpiry);
          authState.user.set(session.user);
          authState.keys_revision.set(session.keys_revision ?? 0);
          authState.isLoggedIn.set(true);
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
  authState.keys_revision.set(null);
};

export const setUserInStorage = async (): Promise<void> => {
  const userData: ProfileResponse | null = authState.user.get();
  if (!userData) return;

  const storage = getStorage();
  await storage.set('user', userData);
};

export const setStoredKeysRevision = async (revision: number): Promise<void> => {
  const normalized = Number.isFinite(revision) ? Math.max(0, Math.trunc(revision)) : 0;
  authState.keys_revision.set(normalized);
  const storage = getStorage();
  await storage.set('keys_revision', normalized as any);
};

export const isOwnKeysInitialized = async (): Promise<boolean> => {
  const storage = getStorage();
  return (await storage.get('own_keys_initialized' as any)) === true;
};

export const setOwnKeysInitialized = async (value: boolean): Promise<void> => {
  const storage = getStorage();
  await storage.set('own_keys_initialized' as any, value as any);
};
