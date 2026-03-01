import { Stack } from "expo-router";
import { ThemeProvider } from "@react-navigation/native";
import { ThemedView } from "@/components/ui/common/ThemedView";
import { UnistylesRuntime } from "react-native-unistyles";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";
import { StyleSheet } from "react-native-unistyles";
import { useValue } from "@legendapp/state/react";
import { $contactsState } from "@/state/personalState/contacts/personal.state.contacts";

export default function PersonalContactsScreenLayout() {

  const isInContacts = useValue($contactsState.isInContacts)
  return (
    <>
      <ThemeProvider value={UnistylesRuntime.colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ThemedView style={styles.outerContainer}>
          <Stack>
            <Stack.Screen name="index" />
            <Stack.Protected guard={isInContacts}>
              <Stack.Screen name="requests" options={{ headerShown: false }} />
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
