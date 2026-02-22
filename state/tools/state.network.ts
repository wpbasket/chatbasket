// networkStore.ts
import { observable } from "@legendapp/state";
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';


export const network$ = observable({
  isConnected: false
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
    // console.log("Connectivity test response:", response.ok);
    clearTimeout(timeoutId);
    return true; // If no error thrown, we have connectivity
  } catch (error) {
    return false;
  }
};

// Web-specific connectivity tracking
export const initializeWebConnectivity = () => {
  // Use browser's native connectivity tracking instead of periodic polling
  // to avoid Net::ERR_CONNECTION_TIMED_OUT console noise.
  if (typeof window !== 'undefined' && window.navigator) {
    network$.isConnected.set(window.navigator.onLine);

    const handleOnline = () => network$.isConnected.set(true);
    const handleOffline = () => network$.isConnected.set(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }

  return () => { };
};

// Native implementation using expo-network
export const initializeNativeConnectivity = async () => {

  // Get initial network state
  const initialState = await NetInfo.fetch();
  network$.isConnected.set((initialState.isInternetReachable && initialState.isConnected) ?? false);

  // Listen for network state changes
  NetInfo.addEventListener(state => {
    network$.isConnected.set((state.isInternetReachable && state.isConnected) ?? false);
  });

  // const initialState = await Network.getNetworkStateAsync();
  // network$.isConnected.set(initialState.isInternetReachable ?? false);

  // Network.addNetworkStateListener((state) => {
  //   network$.isConnected.set(state.isInternetReachable ?? false);
  // });
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