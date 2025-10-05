import { useUnistyles } from 'react-native-unistyles';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
// Map SFSymbol-like names to Ionicons names (industry standard)
const MAPPING = {
  'account.lock': 'lock',
  'account.unlock': 'unlock',
  'account.friends': 'user-friends',
  'hashtag': 'hashtag',
  'list':'list-ul',
} as const;

export type FontAwesome5IconName = keyof typeof MAPPING;

/**
 * An icon component that uses Ionicons.
 * Automatically syncs icon color with the theme using the useUnistyles hook.
 */
export function FontAwesome5Icon({
  name,
  size = 24,
  style,
  color: propColor,
}: {
  name: FontAwesome5IconName;
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
    <FontAwesome5
      name={MAPPING[name]}
      size={size}
      color={color}
      style={style}
    />
  );
}
