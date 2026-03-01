import { useValue } from '@legendapp/state/react';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ThemedText } from '../ui/common/ThemedText';
import { ThemedView } from '../ui/common/ThemedView';
import VerticalTabBar from './VerticalTabBar';

import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { appMode$, setAppMode } from '@/state/appMode/state.appMode';

export default function Sidebar() {
  const currentMode = useValue(appMode$.mode);
  const router = useRouter();
  const { handlePressIn } = pressableAnimation();
  const toggleMode = () => {
    const next = currentMode === 'public' ? 'personal' : 'public';
    setAppMode(next);
    // Navigate to the corresponding home screen
    router.push(next === 'public' ? '/public/home' : '/personal/home');
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
    paddingRight: 20,
    // paddingVertical: 1,
    borderTopLeftRadius: 35,
    borderBottomLeftRadius: 35,
    borderTopRightRadius: 60,
    borderBottomRightRadius: 12,
    backgroundColor: theme.colors.primaryDark,
  },
  modeText: {
    fontSize: 14,
    color: theme.colors.reverseText,
    // fontWeight: 'bold',
  },


}));