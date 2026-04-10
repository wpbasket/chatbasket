// networkStore.ts
import { observable } from "@legendapp/state";
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';


export const network$ = observable({
  isConnected: true,
  isLoaded: false
});

let isInitialized = false;

// Cloudflare DNS endpoint for fastest connectivity testing
const CONNECTIVITY_URL = 'https://1.1.1.1/';

// Test internet connectivity using Cloudflare 1.1.1.1
export const testConnectivity = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout
    await fetch(CONNECTIVITY_URL, {
      method: 'HEAD',
      cache: 'no-cache',
      mode: 'no-cors', // Avoid CORS issues
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return true; // If no error thrown, we have connectivity
  } catch (error) {
    return false;
  }
};

// Web-specific connectivity tracking
export const initializeWebConnectivity = () => {
  if (typeof window !== 'undefined') {

    const check = async () => {
      const result = await testConnectivity();
      if (result !== network$.isConnected.peek()) {
        network$.isConnected.set(result);
      }
      // Signal that the first thorough check is done
      if (!network$.isLoaded.peek()) {
        network$.isLoaded.set(true);
      }
    };

    // Dynamic check logic
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const scheduleNext = () => {
      if (timerId) clearTimeout(timerId);
      const delay = network$.isConnected.peek() ? 30000 : 10000;
      timerId = setTimeout(async () => {
        await check();
        scheduleNext();
      }, delay);
    };

    const handleOnline = () => {
      if (timerId) clearTimeout(timerId);
      network$.isConnected.set(true);
      check(); // Re-trigger immediate check
      scheduleNext();
    };
    const handleOffline = () => {
      if (timerId) clearTimeout(timerId);
      network$.isConnected.set(false);
      scheduleNext();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check and start the dynamic loop
    check();
    scheduleNext();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (timerId) clearTimeout(timerId);
    };
  }

  return () => { };
};

// Native implementation using expo-network
export const initializeNativeConnectivity = async () => {
  // Get initial network state
  const initialState = await NetInfo.fetch();
  network$.isConnected.set((initialState.isInternetReachable && initialState.isConnected) ?? false);
  network$.isLoaded.set(true); // Native fetch is usually fast enough to call "loaded" immediately

  // Listen for network state changes
  NetInfo.addEventListener(state => {
    network$.isConnected.set((state.isInternetReachable && state.isConnected) ?? false);
  });
};

export const initializeGlobalNetworkTracking = async () => {
  if (isInitialized) return;

  isInitialized = true;

  if (Platform.OS === 'web') {
    initializeWebConnectivity();
  } else {
    await initializeNativeConnectivity();
  }
};