import { use$ } from "@legendapp/state/react";
import { Stack } from "expo-router";
import { authState } from "@/state/auth/auth.state";
import { ThemeProvider } from "@react-navigation/native";
import { ThemedView } from "@/components/ui/common/ThemedView";
import { UnistylesRuntime } from "react-native-unistyles";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";
import { StyleSheet } from "react-native-unistyles";

export default function ProfileScreenLayout() {
  const isInTheProfileUpdateMode = use$(authState.isInTheProfileUpdateMode);

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
