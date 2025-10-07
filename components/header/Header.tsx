import { pressableAnimation } from "@/hooks/commonHooks/hooks.pressableAnimation";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ThemedView } from "../ui/common/ThemedView";

type HeaderButton = {
  child: React.ReactNode;
  onPress: () => void;
};

type Props = {
  leftButton?: HeaderButton;
  Icon: React.ReactNode;
  centerIcon?: boolean;
};

export default function Header({ leftButton, Icon, centerIcon }: Props) {
  const { handlePressIn } = pressableAnimation();

  return (
    <ThemedView style={styles.container}>
      {/* Left Button */}
      <View style={styles.leftButtonContainer}>
        {leftButton && (
          <Pressable
            onPress={leftButton.onPress}
            style={({ pressed }) => [
              styles.leftButton,
              pressed && styles.activeLeftButton, 
              
            ]}
            onPressIn={handlePressIn}
            accessibilityRole="button"
            accessibilityLabel="Left header button"
          >
            {leftButton.child}
          </Pressable>
        )}
      </View>

      {/* Center or Left-Aligned Icon */}
      {centerIcon ? (
        <View style={styles.centerIcon}>
          {Icon}
        </View>
      ) : (
        <View style={styles.leftAlignedIcon}>
          {Icon}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: 'row',
    height: 56,
    alignItems: 'center',
    position: 'relative',
  },
  leftButtonContainer: {
    width: 80,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftButton: {
    width: 60,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  activeLeftButton: {
    backgroundColor: theme.colors.neutral0,
  },
  centerIcon: {
    position: 'absolute',
    left: '50%',
    transform: [{ translateX: '-50%' }],
    height: 30,
  },
  leftAlignedIcon: {
    marginLeft: 24,
    height: 30,
  },
}));
