import { Link, Stack } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';

import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { isUserAuthenticated } from '@/lib/storage/auth.storage';

export default function NotFoundScreen() {
  const isLoggedIn = isUserAuthenticated();
  return (
    <>
      <Stack.Screen options={{ title: 'Oops! This screen does not exist.' }} />
      <ThemedView style={styles.outerctn}>
        <ThemedView style={styles.container}>
          <Link href={isLoggedIn ? '/' : '/(auth)'} style={styles.link}>
            <ThemedText type="link" style={styles.linkText}>Go to home screen!</ThemedText>
          </Link>

        </ThemedView>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  outerctn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background
  },
  container: {
    height: 330,
    width: 330,
    backgroundColor: theme.colors.BackgroundSelect,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 9999,
    gap: 12
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    color: theme.colors.primary,
    fontSize: 30
  }

}));
