import type { PropsWithChildren, ReactElement } from 'react';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from 'react-native-reanimated';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';

import { View } from 'react-native';

const HEADER_HEIGHT_DEFAULT = 0;

type Props = PropsWithChildren<{
  headerImage?: ReactElement;
  headerBackgroundColor?: { dark: string; light: string };
  headerHeight?: number;
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
}>;

export default function ParallaxScrollView({
  children,
  headerImage,
  headerBackgroundColor = undefined,
  headerHeight = HEADER_HEIGHT_DEFAULT,
  justifyContent,
}: Props) {
  const theme = UnistylesRuntime.themeName;
  // Detect theme mode (light/dark)
  const mode = theme === 'dark' ? 'dark' : 'light';
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [-headerHeight, 0, headerHeight],
            [-headerHeight / 2, 0, headerHeight * 0.75]
          ),
        },
        {
          scale: interpolate(scrollOffset.value, [-headerHeight, 0, headerHeight], [2, 1, 1]),
        },
      ],
    };
  });

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        contentContainerStyle={{ flexGrow: 1 }} >
        {headerImage && headerHeight > 0 && (
          <Animated.View
            style={[
              styles.header,
              { height: headerHeight },
              headerBackgroundColor && { backgroundColor: headerBackgroundColor[mode] ?? headerBackgroundColor['light'] },
              headerAnimatedStyle,
              justifyContent && { justifyContent },
            ]}>
            {headerImage}
          </Animated.View>
        )}
        <View style={styles.content}>{children}</View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme,rt) => ({
  container: {
    flex: 1,
    // paddingTop: rt.insets.top,
    paddingBottom: rt.insets.bottom,
  },
  header: {
    overflow: 'hidden',
    // alignItems: 'center',
  },
  content: {
    flex: 1,
    // padding: 12,
    // gap: 16,
    overflow: 'hidden',
    backgroundColor: theme.colors.background,
  },
}));
