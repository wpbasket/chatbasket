// import '../unistyles'
import { SplashScreen, Stack } from 'expo-router';
import { initUserPosts } from '@/state/publicState/initUserPosts.state';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react'; // Import useState
import 'react-native-reanimated';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { UnistylesRuntime } from 'react-native-unistyles';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { Platform } from 'react-native';
import { authState } from '@/state/auth/auth.state';
import { use$ } from '@legendapp/state/react';
import { restoreAuthState } from '@/lib/storage/auth.storage';
import { initializeSecureStorage } from '@/lib/storage/auth.storage';
import { AppModal } from '@/components/modals/AppModal';
import { StyleSheet } from 'react-native-unistyles';
import { initializeGlobalNetworkTracking } from '@/state/tools/network.state';
import { getUser } from '@/utils/profile.util';
import Entypo from '@expo/vector-icons/Entypo';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import Ionicons from '@expo/vector-icons/Ionicons';
import { appMode$ } from '@/state/appMode/mode.state';


if (Platform.OS === 'android' || Platform.OS === 'ios') {
  SplashScreen.preventAutoHideAsync();
}

export default function RootLayout() {
  // NEW: State to track if the authentication status has been loaded from storage.
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await initializeSecureStorage();
        await restoreAuthState();
        // Direct background fetch of user after restoring auth (only if logged in)
        if (authState.isLoggedIn.get()) {
          void getUser();
        }
      } catch (e) {
        console.warn("Failed to initialize auth", e);
      } finally {
        // Mark authentication as loaded. Now the app knows if the user is logged in or not.
        setAuthLoaded(true);
      }
    };
    init();
  }, []); // This runs only once on mount

  // const lock = true;
  const lock = use$(authState.isLoggedIn);
  const sentOtp = use$(authState.isSentOtp);
  const mode = use$(appMode$.mode);

  const themeName = UnistylesRuntime.themeName;

  useEffect(() => {
    // Initialize once - runs for the entire app lifecycle
    initializeGlobalNetworkTracking();
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
    });

    useEffect(() => {
      // This logic remains the same. It hides the splash screen when fonts are loaded.
      // This `useEffect` will only run after the `!loaded || !authLoaded` check below passes.
      if (loaded) {
        SplashScreen.hideAsync();
        initUserPosts();
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

              <Stack.Protected guard={lock && mode === 'public'}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              </Stack.Protected>

              <Stack.Protected guard={lock && mode === 'personal'}>
                <Stack.Screen name="personal" options={{ headerShown: false }} />
              </Stack.Protected>

            </Stack.Protected>

            <Stack.Protected guard={mode === 'public'}>
              <Stack.Screen name="(temp)/post" options={{ headerShown: false }} />
              <Stack.Screen name="(temp)/tempprofile" options={{ headerShown: false }} />
            </Stack.Protected>

            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />
          <AppModal />
        </ThemedView>
      </ThemeProvider>
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  outerContainer: {
    flex: 1,
  },
}));