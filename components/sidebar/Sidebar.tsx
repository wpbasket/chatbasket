import { StyleSheet } from 'react-native-unistyles'
import { ThemedView } from '../ui/common/ThemedView';
import { ThemedText } from '../ui/common/ThemedText';
import VerticalTabBar from './VerticalTabBar';
import { Pressable, View } from 'react-native';
import { useLegend$ } from '@/hooks/useLegend';

import { appMode$, setAppMode } from '@/state/appMode/mode.state';
import { pressableAnimation } from '@/hooks/pressableAnimation';

export default function Sidebar() {
  const currentMode = useLegend$(appMode$.mode);
  const { handlePressIn } = pressableAnimation();
  const toggleMode = () => {
    const next = currentMode === 'public' ? 'personal' : 'public';
    setAppMode(next);
  };
  return (
    <ThemedView style={styles.container}>
      <View style={styles.titleContainer}>
        <ThemedText type="logo" style={styles.logo} selectable={false}>
          ChatBasket
        </ThemedText>
        <Pressable 
          onPress={toggleMode}
          onPressIn={handlePressIn}
          style={({ pressed }) => [
            { opacity: pressed ? 0.1 : 1 },
            styles.modeToggle
          ]}
        >
          <ThemedText type="defaultGantari" style={styles.modeText} selectable={false}>
            {currentMode === 'public' ? 'Public' : 'Personal'}
          </ThemedText>
        </Pressable>
      </View>
      <VerticalTabBar />
    </ThemedView>
  )
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    width: 249,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingBottom: 10,
    paddingTop: 11,
    paddingRight: 10,
    justifyContent: 'space-between',
    gap: 8,
  },
  logo: {
    fontSize: 25,
    color: theme.colors.primary,
  },
  modeToggle: {
    paddingHorizontal: 10,
    // paddingVertical: 0.5,
    borderRadius: 14,
    backgroundColor: theme.colors.primaryDark,
  },
  modeText: {
    fontSize: 14,
    color: theme.colors.reverseText,
    fontWeight: 'bold',
  },


}));