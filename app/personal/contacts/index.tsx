import Sidebar from '@/components/sidebar/Sidebar';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { appMode$, setAppMode } from '@/state/appMode/state.appMode';
import { StyleSheet } from 'react-native-unistyles';

export default function Contacts() {
  return (
    <>
    <ThemedViewWithSidebar>
      <ThemedViewWithSidebar.Sidebar>
        <Sidebar />
      </ThemedViewWithSidebar.Sidebar>
      <ThemedViewWithSidebar.Main>
        <ThemedView style={styles.container} >
          <ThemedText>Contacts</ThemedText>
        </ThemedView>
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    paddingTop: rt.insets.top,
  },
}));
