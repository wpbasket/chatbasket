import { Stack } from "expo-router";
import { ThemeProvider } from "@react-navigation/native";
import { ThemedView } from "@/components/ui/common/ThemedView";
import { UnistylesRuntime } from "react-native-unistyles";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";
import { StyleSheet } from "react-native-unistyles";
import { useValue } from "@legendapp/state/react";
import { authState } from "@/state/auth/state.auth";
import { appMode$, setAppMode } from "@/state/appMode/state.appMode";

export default function HomeScreenLayout() {

  return (
    <>
      <ThemeProvider value={UnistylesRuntime.colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ThemedView style={styles.outerContainer}>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="post" options={{ headerShown: false }} />
            <Stack.Screen name="tempprofile" options={{ headerShown: false }} />
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
