import { useUnistyles } from 'react-native-unistyles';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
// Map SFSymbol-like names to Ionicons names (industry standard)
const MAPPING = {
  'house.fill': 'home',
  'house.line': 'home-outline',
  'paperplane.fill': 'send',
  'paperplane.line': 'send-outline',
  'chevron.left.forwardslash.chevron.right': 'code-slash',
  'chevron.right': 'chevron-forward',
  'arrow.left': 'arrow-back',
  'person.fill': 'person',
  'person.line': 'person-outline',
  'account.add': 'person-add',
  'account.login': 'enter',
  'account.lock': 'lock-closed',
  'account.unlock': 'lock-open',
  'check': 'checkmark-sharp',
  'theme': 'sunny-sharp',
} as const;

export type IconSymbolName = keyof typeof MAPPING;

/**
 * An icon component that uses Ionicons.
 * Automatically syncs icon color with the theme using the useUnistyles hook.
 */
export function IconSymbol({
  name,
  size = 24,
  style,
  color: propColor,
}: {
  name: IconSymbolName;
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
    <Ionicons
      name={MAPPING[name]}
      size={size}
      color={color}
      style={style}
    />
  );
}
