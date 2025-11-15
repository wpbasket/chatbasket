import { ThemedView } from "@/components/ui/common/ThemedView";
import { useLegend$ } from "@/hooks/commonHooks/hooks.useLegend";
import { authState } from "@/state/auth/state.auth";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, UnistylesRuntime } from "react-native-unistyles";
import { PersonalStorageGetUser } from "@/lib/storage/personalStorage/personal.storage.user";

export default function PersonalProfileScreenLayout() {
  const isInTheProfileUpdateMode = useLegend$(authState.isInTheProfileUpdateMode);
  
  useEffect(() => {
    PersonalStorageGetUser();
  }, []);

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
              <Stack.Screen name="contacts" options={{headerShown:false}} />
              <Stack.Screen name="requests" options={{headerShown:false}} />
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
