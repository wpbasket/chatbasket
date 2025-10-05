import { MMKV } from "react-native-mmkv";
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { authState } from "@/state/auth/auth.state";
import { ProfileResponse } from "../publicLib/api/models/profile.model";


const ENCRYPTION_KEY_NAME = 'mmkv-encryption-key';
const WEB_SESSION_EXPIRY_KEY = 'web-session-expiry';
const WEB_USER_KEY = 'user';

// Generate and store encryption key once (native only)
const getOrCreateEncryptionKey = async (): Promise<string> => {
  let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_NAME);

  if (!key) {
    // Generate a secure random key
    key = Crypto.randomUUID().replace(/-/g, '');
    await SecureStore.setItemAsync(ENCRYPTION_KEY_NAME, key);
  }

  return key;
};

// Storage instance (initialized later, native only)
let secureStorage: MMKV;

// Initialize secure storage - call this once at app start
export const initializeSecureStorage = async (): Promise<void> => {
  if (Platform.OS === 'web') {
    // Web doesn't need initialization - AsyncStorage is ready to use
    return;
  }

  try {
    const encryptionKey = await getOrCreateEncryptionKey();

    secureStorage = new MMKV({
      id: 'secure-auth-storage',
      encryptionKey,
    });
  } catch (error) {
    console.error('Failed to initialize secure storage:', error);
    throw error;
  }
};

// Helper to ensure storage is ready (native only)
const ensureStorageReady = () => {
  if (Platform.OS !== 'web' && !secureStorage) {
    throw new Error('Secure storage not initialized. Call initializeSecureStorage() first.');
  }
};

export const setSession = async (sessionId: string, userId: string, sessionExpiry: string) => {
  if (Platform.OS === 'web') {
    // Web: Only store session expiry, backend handles sessionId/userId via httpOnly cookies
    try {
      await AsyncStorage.setItem(WEB_SESSION_EXPIRY_KEY, sessionExpiry);
    } catch (error) {
      console.error('Failed to store session expiry on web:', error);
    }

    // Update auth state - sessionId and userId will be empty strings from backend
    authState.sessionId.set(sessionId || '');
    authState.userId.set(userId || '');
    authState.sessionExpiry.set(sessionExpiry);
    authState.isLoggedIn.set(true);
    authState.isSentOtp.set(false);
  } else {
    // Native: Store all session data in encrypted MMKV
    ensureStorageReady();

    secureStorage.set('sessionId', sessionId);
    secureStorage.set('userId', userId);
    secureStorage.set('sessionExpiry', sessionExpiry);

    authState.sessionId.set(sessionId);
    authState.userId.set(userId);
    authState.sessionExpiry.set(sessionExpiry);
    authState.isLoggedIn.set(true);
    authState.isSentOtp.set(false);
  }
};

export const getSession = async () => {
  if (Platform.OS === 'web') {
    // Web: Only retrieve session expiry from AsyncStorage
    try {
      const sessionExpiry = await AsyncStorage.getItem(WEB_SESSION_EXPIRY_KEY);
      const userData = await AsyncStorage.getItem(WEB_USER_KEY);
      return { 
        sessionId: '', // Empty for web - managed by httpOnly cookies
        userId: '', // Empty for web - managed by httpOnly cookies
        sessionExpiry,
        user: userData ? JSON.parse(userData) : null
      };
    } catch (error) {
      console.error('Failed to retrieve session expiry on web:', error);
      return { sessionId: '', userId: '', sessionExpiry: null, user: null };
    }
  } else {
    // Native: Retrieve all session data from encrypted MMKV
    ensureStorageReady();
    
    const sessionId = secureStorage.getString('sessionId');
    const userId = secureStorage.getString('userId');
    const sessionExpiry = secureStorage.getString('sessionExpiry');
    const userData = secureStorage.getString('user');
    return { sessionId, userId, sessionExpiry, user: userData ? JSON.parse(userData) : null };
  }
};

export const clearSession = async () => {
  if (Platform.OS === 'web') {
    // Web: Clear session expiry and user data from AsyncStorage
    try {
      await AsyncStorage.removeItem(WEB_SESSION_EXPIRY_KEY);
      await AsyncStorage.removeItem(WEB_USER_KEY);
    } catch (error) {
      console.error('Failed to clear session data on web:', error);
    }
  } else {
    // Native: Clear all session data from encrypted MMKV
    ensureStorageReady();

    secureStorage.delete('sessionId');
    secureStorage.delete('userId');
    secureStorage.delete('sessionExpiry');
    secureStorage.delete('user');
  }

  // Clear auth state for both platforms
  authState.sessionId.set(null);
  authState.userId.set(null);
  authState.sessionExpiry.set(null);
  authState.user.set(null);
  authState.isLoggedIn.set(false);
  authState.isSentOtp.set(false);
};

// Helper function to check if session is expired
export const isSessionExpired = async (): Promise<boolean> => {
  const session = await getSession();
  if (!session.sessionExpiry) return true;

  const expiryTime = new Date(session.sessionExpiry).getTime();
  const currentTime = new Date().getTime();

  return currentTime >= expiryTime;
};

// Main function to restore/check auth state - use this for both app start and auth checks
export const restoreAuthState = async (): Promise<void> => {
  try {
    const session = await getSession();

    if (session.sessionExpiry && !(await isSessionExpired())) {
      // Session is valid, restore auth state
      if (Platform.OS === 'web') {
        // Web: Only check sessionExpiry
        authState.sessionId.set('');
        authState.userId.set('');
        authState.sessionExpiry.set(session.sessionExpiry);
        authState.user.set(session.user); // Restore user data
        console.log('Session expiry date', session.sessionExpiry);
        authState.isLoggedIn.set(true);
      } else {
        // Native: Check all session data
        if (session.sessionId && session.userId) {
          authState.sessionId.set(session.sessionId);
          authState.userId.set(session.userId);
          authState.sessionExpiry.set(session.sessionExpiry);
          authState.user.set(session.user); // Restore user data
          authState.isLoggedIn.set(true);
        } else {
          await clearSession();
        }
      }
    } else {
      // Session is expired or doesn't exist, clear everything
      await clearSession();
    }
  } catch (error) {
    console.error('Failed to restore auth state:', error);
    await clearSession();
  }
};

// Helper function to check if user is authenticated (synchronous)
export const isUserAuthenticated = (): boolean => {
  const currentExpiry = authState.sessionExpiry.get();
  const isLoggedIn = authState.isLoggedIn.get();

  if (!isLoggedIn || !currentExpiry) return false;

  // Check if session is not expired
  return new Date(currentExpiry) > new Date();
};

// Helper function to get current session info
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

// Helper function to clear all auth state (synchronous)
export const clearAuthState = () => {
  authState.isLoggedIn.set(false);
  authState.userId.set(null);
  authState.sessionId.set(null);
  authState.sessionExpiry.set(null);
  authState.user.set(null);
  authState.isSentOtp.set(false);
};

// Save current user data from authState to storage
export const setUserInStorage = async (): Promise<void> => {
  const userData: ProfileResponse | null = authState.user.get();
  
  if (!userData) {
    console.log('No user data to save');
    return;
  }

  if (Platform.OS === 'web') {
    // Web: Store user data in AsyncStorage
    try {
      await AsyncStorage.setItem(WEB_USER_KEY, JSON.stringify(userData));
    } catch (error) {
      console.error('Failed to store user data on web:', error);
    }
  } else {
    // Native: Store user data in encrypted MMKV
    ensureStorageReady();
    secureStorage.set('user', JSON.stringify(userData));
  }
};