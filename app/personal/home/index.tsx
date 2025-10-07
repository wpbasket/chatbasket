import Sidebar from '@/components/sidebar/Sidebar';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { useLegend$ } from '@/hooks/commonHooks/hooks.useLegend';
import { appMode$, setAppMode } from '@/state/appMode/state.appMode';
import { Pressable } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export default function Home() {
  const { handlePressIn } = pressableAnimation();
  const currentMode = useLegend$(appMode$.mode);

  const toggleMode = () => {
    const next = currentMode === 'public' ? 'personal' : 'public';
    setAppMode(next);
  };
  return (
    <>
    <ThemedViewWithSidebar>
      <ThemedViewWithSidebar.Sidebar>
        <Sidebar />
      </ThemedViewWithSidebar.Sidebar>
      <ThemedViewWithSidebar.Main>
        <ThemedView style={styles.container} >
          <ThemedView style={styles.titleContainer} >
            <ThemedText type="logo" style={styles.logo} selectable={false}>ChatBasket</ThemedText>
            <Pressable 
              onPress={toggleMode}
              onPressIn={handlePressIn}
              style={({ pressed }) => [
                { opacity: pressed ? 0.1 : 1 },
                styles.modeToggle
              ]}
            >
              <ThemedText type="default" style={styles.modeText} selectable={false}>
                {currentMode === 'public' ? 'Public' : 'Personal'}
              </ThemedText>
            </Pressable>
          </ThemedView>

          <ThemedText style={styles.commingSoon}>Comming soon</ThemedText>
        </ThemedView>
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    paddingTop: {
      xs:rt.insets.top,
      sm:rt.insets.top,
      md:rt.insets.top,
      lg:11
    }
  },
  titleContainer: {
    display:{
      xs:'flex',
      sm:'flex',
      md:'flex',
      lg:'none'
    },
    flexDirection: 'row',
    alignItems: 'center',
    // backgroundColor:theme.colors.BackgroundSelect,
    paddingLeft: 15,
    paddingBottom: 11,
    paddingTop: 11,
    paddingRight: 15,
    justifyContent: 'space-between',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  logo: {
    fontSize: 25,
    color: theme.colors.primary,
  },
  modeToggle: {
    paddingHorizontal: 10,
    // paddingVertical: 2,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 8,
    backgroundColor: theme.colors.primaryDark,
  },
  modeText: {
    fontSize: 14,
    color: theme.colors.reverseText,
    fontWeight: 'bold',
  },
  commingSoon: {
    fontSize: 18,
    color:'gray',
    textAlign: 'center',
    marginTop: 320,
  },
}));
