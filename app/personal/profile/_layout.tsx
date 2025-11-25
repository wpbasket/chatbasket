import LoadingScreen from "@/components/ui/common/LoadingScreen";
import { ThemedView } from "@/components/ui/common/ThemedView";
import { PersonalStorageGetUser } from "@/lib/storage/personalStorage/personal.storage.user";
import { authState } from "@/state/auth/state.auth";
import { PersonalUtilGetUser } from "@/utils/personalUtils/personal.util.profile";
import { useValue } from "@legendapp/state/react";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, UnistylesRuntime } from "react-native-unistyles";

export default function PersonalProfileScreenLayout() {
  const isInTheProfileUpdateMode = useValue(authState.isInTheProfileUpdateMode);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      await PersonalStorageGetUser();
      await PersonalUtilGetUser();
      setLoading(false);
    }
    init();
  }, []);

  if (loading) {
    return <LoadingScreen />
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
