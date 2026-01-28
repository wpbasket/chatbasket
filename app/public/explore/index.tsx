
import { ThemedText } from '@/components/ui/common/ThemedText'
import { ThemedView } from '@/components/ui/common/ThemedView'
import { StyleSheet } from 'react-native-unistyles'
import Sidebar from '@/components/sidebar/Sidebar'
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar'

export default function Explore() {
  return (
    <>
      <ThemedViewWithSidebar>
        <ThemedViewWithSidebar.Sidebar>
          <Sidebar />
        </ThemedViewWithSidebar.Sidebar>
        <ThemedViewWithSidebar.Main>
          <ThemedView style={styles.container}>
            <ThemedText type='defaultGantari'>Coming Soon</ThemedText>
          </ThemedView>
        </ThemedViewWithSidebar.Main>
      </ThemedViewWithSidebar>
    </>
  )
}

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    paddingTop: rt.insets.top,
    alignItems: 'center',
    justifyContent: 'center',
  },
}))