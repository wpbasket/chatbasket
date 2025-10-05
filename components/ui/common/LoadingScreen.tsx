// components/ui/common/LoadingScreen.tsx
import { StyleSheet } from 'react-native-unistyles';
import { ActivityIndicator } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { ThemedView } from './ThemedView';
import { ThemedViewWithSidebar } from './ThemedViewWithSidebar';
import Sidebar from '@/components/sidebar/Sidebar';
import type { ReactNode } from 'react';

type LoadingScreenProps = {
  loading?: boolean; // default true to preserve prior behavior
  size?: 'small' | 'large';
  color?: string;
  emptyContent?: ReactNode; // optional custom empty UI when not loading
};

const LoadingScreen = ({ loading = true, size = 'large', color, emptyContent }: LoadingScreenProps) => {
  const { theme } = useUnistyles();
  const Usecolor = color || theme.colors.loader;
  return (
    <>
      <ThemedViewWithSidebar>
        <ThemedViewWithSidebar.Sidebar>
          <Sidebar />
        </ThemedViewWithSidebar.Sidebar>
        <ThemedViewWithSidebar.Main>
          <ThemedView style={styles.container}>
            {loading ? (
              <ActivityIndicator size={size} color={Usecolor} />
            ) : (
              emptyContent ?? null
            )}
          </ThemedView>
        </ThemedViewWithSidebar.Main>
      </ThemedViewWithSidebar>
    </>
  );
};

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: rt.insets.bottom,
  },
})
);

export default LoadingScreen;
