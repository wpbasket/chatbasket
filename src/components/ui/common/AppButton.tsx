import React from 'react';
import { Pressable, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ThemedText, type ThemedTextProps } from './ThemedText';

export type AppButtonProps = {
  /** Button text label */
  label?: string;
  /** Custom children (alternative to label for complex content) */
  children?: React.ReactNode;
  /** Icon element rendered before the label */
  icon?: React.ReactNode;

  /** Explicit width override */
  width?: number | string;
  /** Explicit height override */
  height?: number | string;

  /** Custom text style (color, fontWeight, etc.) */
  labelStyle?: StyleProp<TextStyle>;
  /** Additional container style overrides */
  style?: StyleProp<ViewStyle>;
  /** ThemedText type prop (e.g. 'small', 'smallBold', 'default') */
  textType?: ThemedTextProps['type'];

  /** Press handler */
  onPress: () => void;
  /** Optional press-in handler (for animation hooks) */
  onPressIn?: () => void;
  /** Disable the button */
  disabled?: boolean;
  /** Opacity when pressed (default: 0.6) */
  pressedOpacity?: number;
};

/**
 * Reusable asymmetric-rounded button used throughout the app.
 * Supports icon + text, text-only, or icon-only layouts.
 * Accepts explicit width/height for sizing flexibility.
 */
export const AppButton = React.memo(({
  label,
  children,
  icon,
  width,
  height,
  labelStyle,
  style,
  textType = 'small',
  onPress,
  onPressIn,
  disabled = false,
  pressedOpacity = 0.6,
}: AppButtonProps) => {
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        pressed && { opacity: pressedOpacity },
        disabled && styles.disabled,
        width != null && { width: width as any },
        height != null && { height: height as any },
        style,
      ]}
    >
      {icon}
      {children ? children : label ? (
        <ThemedText
          type={textType}
          style={[styles.label, labelStyle]}
          selectable={false}
        >
          {label}
        </ThemedText>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.neutral2,
    ...theme.radii.asymmetric,
    padding: 8,
    paddingLeft: 12,
    paddingVertical: 2,
    paddingRight: 25,
    _web: {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
      _hover: {
        backgroundColor: theme.colors.backgroundElement,
      },
    },
  },
  label: {
    color: theme.colors.whiteOrBlack,
  },
  disabled: {
    opacity: 0.5,
  },
}));
