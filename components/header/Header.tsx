import React from "react";
import { View, Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ThemedView } from "../ui/common/ThemedView";
import { IconSymbol } from "../ui/fonts/IconSymbol";
import { MaterialCommunityIcon } from "../ui/fonts/materialCommunityIcons";
import { pressableAnimation } from "@/hooks/commonHooks/hooks.pressableAnimation";

type Props = {
  leftSection?: React.ReactNode;
  centerSection?: React.ReactNode;
  rightSection?: React.ReactNode;
  onBackPress?: () => void;
};

export default function Header({ leftSection, centerSection, rightSection, onBackPress }: Props) {
  const { handlePressIn } = pressableAnimation();

  // Convenience: auto-render back button if onBackPress is provided shifted to left
  const leftContent = leftSection || (onBackPress && (
    <Pressable
      onPress={onBackPress}
      onPressIn={handlePressIn}
      style={({ pressed }) => [
        styles.leftButton,
        pressed && styles.activeLeftButton,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Left header button"
    >
      <MaterialCommunityIcon name="keyboard.backspace" size={25} />
    </Pressable>
  ));

  return (
    <ThemedView style={styles.container}>
      <View style={styles.leftContainer} pointerEvents="box-none">
        {leftContent}
      </View>

      <View style={styles.centerContainer} pointerEvents="box-none">
        {centerSection}
      </View>

      <View style={styles.rightContainer} pointerEvents="box-none">
        {rightSection}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: 'row',
    height: 65,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    position: 'relative',
  },
  leftContainer: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  leftButton: {
    width: 60,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 30,
    borderBottomLeftRadius: 8,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  activeLeftButton: {
    backgroundColor: theme.colors.neutral0,
  },
  centerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightContainer: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
}));
