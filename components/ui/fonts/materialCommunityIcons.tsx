import { useUnistyles } from 'react-native-unistyles';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
// Map SFSymbol-like names to Ionicons names (industry standard)
const MAPPING = {
  'account.edit': 'account-edit',
  'image.edit': 'image-edit',
  'magnify.scan': 'magnify-scan',
  'account.settings': 'account-settings',
  'account.emailEdit': 'email-edit',
  'edit': 'pencil-circle',
  'contacts.fill': 'contacts',
  'contacts.outline': 'contacts-outline',
  'keyboard.backspace': 'keyboard-backspace',
  'checkmark.all': 'check-all',
} as const;

export type IconSymbolName = keyof typeof MAPPING;

/**
 * An icon component that uses Ionicons.
 * Automatically syncs icon color with the theme using the useUnistyles hook.
 */
export function MaterialCommunityIcon({
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
    <MaterialCommunityIcons
      name={MAPPING[name]}
      size={size}
      color={color}
      style={style}
    />
  );
}
