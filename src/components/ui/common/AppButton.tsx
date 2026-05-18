import React from 'react';
import { Platform, Pressable, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ThemedText, type ThemedTextProps } from './ThemedText';
import { useObservable, useValue } from '@legendapp/state/react';

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
  onPress: (event?: any) => void;
  /** Optional press-in handler (for animation hooks) */
  onPressIn?: () => void;
  /** Disable the button */
  disabled?: boolean;
  /** Opacity when pressed (default: 0.6) */
  pressedOpacity?: number;
  /** Show asymmetric border and padding. If false, sets border to none and horizontal padding to 10. Default: true. */
  asymmetric?: boolean;
  /** Enable hover effect on web. Default: true. */
  hover?: boolean;
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
  asymmetric = true,
  hover = true,
}: AppButtonProps) => {
  const clicked$ = useObservable(false);
  const clicked = useValue(clicked$);

  const handlePress = React.useCallback((event: any) => {
    clicked$.set(true);
    setTimeout(() => {
      clicked$.set(false);
    }, 400);

    if (onPress) {
      onPress(event);
    }
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      disabled={disabled || !hover}
      style={({ pressed }) => [
        styles.container,
        asymmetric ? styles.asymmetric : styles.symmetric,
        pressed && !(Platform.OS === 'web' && hover) && { opacity: pressedOpacity },
        disabled && styles.disabled,
        width != null && { width: width as any },
        height != null && { height: height as any },
        (hover && !clicked) && styles.hoverEnabled,
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
    ...theme.radii.asymmetric,
    paddingVertical: 1.5,
  },
  asymmetric: {
    borderWidth: 1,
    borderColor: theme.colors.neutral2,
    paddingLeft: 12,
    paddingRight: 30,
  },
  symmetric: {
    borderWidth: 0,
    paddingLeft: 12,
    paddingRight: 30,
    marginLeft: -12,
    marginRight: -30,
  },
  hoverEnabled: {
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
