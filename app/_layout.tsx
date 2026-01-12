// import '../unistyles'
import { AppModal } from '@/components/modals/AppModal';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { IncomingShareListener } from '@/hooks/useIncomingShare';
import { initializeSecureStorage, restoreAuthState } from '@/lib/storage/commonStorage/storage.auth';
import { checkInitialNotification, registerTokenWithBackend, setupNotificationListeners } from '@/notification/registerFcmOrApn';
import { appMode$, setAppMode } from '@/state/appMode/state.appMode';
import { authState } from '@/state/auth/state.auth';
import { initUserPosts } from '@/state/publicState/public.state.initUserPosts';
import { initializeGlobalNetworkTracking } from '@/state/tools/state.network';
import { getUser } from '@/utils/publicUtils/public.util.profile';
import Entypo from '@expo/vector-icons/Entypo';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useValue } from '@legendapp/state/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { SplashScreen, Stack, useSegments } from 'expo-router';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import 'react-native-reanimated';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';


if (Platform.OS === 'android' || Platform.OS === 'ios') {
  SplashScreen.preventAutoHideAsync();
}

export default function RootLayout() {
  // NEW: State to track if the authentication status has been loaded from storage.
  const [authLoaded, setAuthLoaded] = useState(false);

  // const lock = true;
  const lock = useValue(authState.isLoggedIn);
  const sentOtp = useValue(authState.isSentOtp);
  const mode = useValue(appMode$.mode);

  // Helper to process deep links (memoized to avoid recreation on every render)
  const handleDeepLink = useCallback((url: string) => {
    if (!url) return;
    const parsed = Linking.parse(url);

    // OPTIMIZATION: Only set mode if it's different to avoid redundant state updates
    if (parsed.path?.startsWith('public') && mode !== 'public') {
      setAppMode('public');
    } else if (parsed.path?.startsWith('personal') && mode !== 'personal') {
      setAppMode('personal');
    }
  }, [mode]); // Recreate only when mode changes

  useEffect(() => {
    const init = async () => {
      try {
        // Note: Cold start deep links are now handled by +native-intent.tsx
        // This is the modern Expo Router pattern for initial URL handling

        await initializeSecureStorage();
        await restoreAuthState();
        // Direct background fetch of user after restoring auth (only if logged in)
        if (authState.isLoggedIn.get()) {
          void getUser();
        }
      } catch (e) {
        console.warn("Failed to initialize auth", e);
      } finally {
        setAuthLoaded(true);
      }
    };
    init();

    // Listen for incoming deep links (Warm Start / Background -> Foreground)
    // Cold starts are handled by +native-intent.tsx
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleDeepLink]); // Depend on handleDeepLink

  const themeName = UnistylesRuntime.themeName;
  const segments = useSegments();

  // Sync app mode with route during navigation
  // On native: +native-intent.tsx handles cold starts, this handles subsequent navigations
  // On web: getInitialMode() reads window.location.pathname, this handles client-side navigation
  useEffect(() => {
    if (segments.length > 0) {
      const firstSegment = segments[0];

      // Sync mode with current route
      // OPTIMIZATION: Only set mode if it's different to avoid redundant state updates
      if (firstSegment === 'public' && mode !== 'public') {
        setAppMode('public');
      } else if (firstSegment === 'personal' && mode !== 'personal') {
        setAppMode('personal');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  useEffect(() => {
    // Initialize once - runs for the entire app lifecycle
    initializeGlobalNetworkTracking();

    // Setup push notification listeners
    const cleanupNotificationListeners = setupNotificationListeners();

    // Cleanup listeners on unmount
    return () => {
      cleanupNotificationListeners();
    };
  }, []);

  // --- NATIVE PLATFORM LOGIC (Your setup, with one addition) ---
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    const [loaded] = useFonts({
      Gantari400: require('../assets/fonts/Gantari-Regular.ttf'),
      AstaSans400: require('../assets/fonts/AstaSans-Regular.ttf'),
      AstaSans600: require('../assets/fonts/AstaSans-SemiBold.ttf'),
      Gantari200: require('../assets/fonts/Gantari-ExtraLight.ttf'),
      Gantari600: require('../assets/fonts/Gantari-SemiBold.ttf'),
      // Preload icon fonts to avoid first-use layout shifts
      ...Entypo.font,
      ...MaterialCommunityIcons.font,
      ...FontAwesome5.font,
      ...Ionicons.font,
      ...FontAwesome6.font,
    });

    useEffect(() => {
      // This logic remains the same. It hides the splash screen when fonts are loaded.
      // This `useEffect` will only run after the `!loaded || !authLoaded` check below passes.
      if (loaded) {
        SplashScreen.hideAsync();
        initUserPosts();
        // Register push notification token after app is fully loaded and visible
        if (authState.isLoggedIn.get()) {
          void registerTokenWithBackend();
          // Check if app was opened via notification (Cold Start)
          void checkInitialNotification();
        }
      }
    }, [loaded]);

    // UPDATED: Render nothing until BOTH fonts AND auth state are ready.
    // This prevents the flicker by keeping the splash screen visible.
    if (!loaded || !authLoaded) {
      return null;
    }
  }

  // --- WEB PLATFORM LOGIC (Your setup, with one addition) ---
  if (Platform.OS === 'web') {
    const [loaded] = useFonts({
      Gantari400: require('../assets/fonts/Gantari-Regular.ttf'),
      AstaSans400: require('../assets/fonts/AstaSans-Regular.ttf'),
      Gantari200: require('../assets/fonts/Gantari-ExtraLight.ttf'),
      // Preload icon fonts to avoid first-use layout shifts on web
      ...Entypo.font,
      ...MaterialCommunityIcons.font,
      ...FontAwesome5.font,
      ...Ionicons.font,
    });

    useEffect(() => {
      SplashScreen.hideAsync();
      initUserPosts();
    }, [loaded]);

    // NEW: Also wait for auth to be loaded on web before rendering the UI.
    if (!authLoaded) {
      return null;
    }
  }

  // --- This section is now only reached when `authLoaded` is true ---
  // By this point, `lock` has the correct value from storage, so the router makes the right decision immediately.
  return (
    <>
      <ShareIntentProvider>
        <IncomingShareListener />
        <ThemeProvider value={themeName === 'dark' ? DarkTheme : DefaultTheme}>
          <ThemedView style={styles.outerContainer}>
            <Stack>
              <Stack.Protected guard={!lock}>
                <Stack.Screen name="(auth)/index" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)/auth" options={{ headerShown: false }} />
                <Stack.Protected guard={sentOtp}>
                  <Stack.Screen name="(auth)/auth-verify" options={{ headerShown: false }} />
                </Stack.Protected>
              </Stack.Protected>

              <Stack.Protected guard={lock}>
                <Stack.Screen name='index' options={{ headerShown: false }} />


                <Stack.Protected guard={lock && mode === 'personal'}>
                  <Stack.Screen name="personal" options={{ headerShown: false }} />
                </Stack.Protected>

              </Stack.Protected>

              <Stack.Protected guard={mode === 'public'} >
                <Stack.Screen name="public" options={{ headerShown: false }} />
              </Stack.Protected>

              <Stack.Screen name="+not-found" />
            </Stack>
            <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />
            <AppModal />
          </ThemedView>
        </ThemeProvider>
      </ShareIntentProvider>
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  outerContainer: {
    flex: 1,
  },
}));