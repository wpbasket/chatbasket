import { useUnistyles } from 'react-native-unistyles';
import Entypo from '@expo/vector-icons/Entypo';
import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
// Map SFSymbol-like names to Ionicons names (industry standard)
const MAPPING = {
  'bucket': 'bucket',
  'account.logout': 'aircraft-take-off',
  'circle-with-plus': 'circle-with-plus',
} as const;

export type EntypoIconName = keyof typeof MAPPING;

/**
 * An icon component that uses Ionicons.
 * Automatically syncs icon color with the theme using the useUnistyles hook.
 */
export function EntypoIcon({
  name,
  size = 24,
  style,
  color: propColor,
}: {
  name: EntypoIconName;
  size?: number;
  style?: StyleProp<TextStyle>;
  color?: string;
}) {
  // Use the color prop if provided, otherwise fall back to the theme text color
  const { theme } = useUnistyles();
  const color = propColor || theme.colors.text;

  if (!MAPPING[name]) {
    console.warn(`Icon "${name}" is not mapped to Ionicons.`);
    return null;
  }

  return (
    <Entypo
      name={MAPPING[name]}
      size={size}
      color={color}
      style={style}
    />
  );
}
