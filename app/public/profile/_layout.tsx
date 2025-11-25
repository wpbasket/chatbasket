import { ThemedView } from "@/components/ui/common/ThemedView";
import { appMode$ } from "@/state/appMode/state.appMode";
import { authState } from "@/state/auth/state.auth";
import { useValue } from "@legendapp/state/react";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { router, Stack } from "expo-router";
import { StyleSheet, UnistylesRuntime } from "react-native-unistyles";

export default function ProfileScreenLayout() {
  const isInTheProfileUpdateMode = useValue(authState.isInTheProfileUpdateMode);
  const lock = useValue(authState.isLoggedIn)
  if (!lock) {
    router.replace('/(auth)')
  }

  return (
    <>
      <ThemeProvider value={UnistylesRuntime.colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ThemedView style={styles.outerContainer}>
          <Stack>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Protected guard={isInTheProfileUpdateMode}>
                <Stack.Screen name='create-profile' options={{ headerShown: false }} />
                <Stack.Screen name='update-profile' options={{ headerShown: false }} />
                <Stack.Screen name='settings' options={{ headerShown: false }} />
              </Stack.Protected>
          </Stack>
        </ThemedView>
      </ThemeProvider>
    </>
  );
};

const styles = StyleSheet.create((theme, rt) => ({
  outerContainer: {
    flex: 1,
  },
}));
