import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

// Map SFSymbol-like names to Ionicons names (industry standard)
const MAPPING = {
  'house.fill': 'home',
  'house.line': 'home-outline',
  'paperplane.fill': 'send',
  'paperplane.line': 'send-outline',
  'chevron.left.forwardslash.chevron.right': 'code-slash',
  'chevron.right': 'chevron-forward',
  'chevron.left': 'chevron-back',
  'arrow.left': 'arrow-back',
  'arrow.right': 'arrow-forward',
  'person.fill': 'person',
  'person.line': 'person-outline',
  'account.add': 'person-add',
  'account.login': 'enter',
  'account.lock': 'lock-closed',
  'account.unlock': 'lock-open',
  'check': 'checkmark-sharp',
  'checkmark': 'checkmark',
  'checkmark.double': 'checkmark-done',
  'checkmark.circle': 'checkmark-circle-outline',
  'theme': 'sunny-sharp',
  'magnifyingglass': 'search',
  'clock': 'time-outline',
  'alert': 'alert-circle-outline',
  'plus.circle.fill': 'add-circle',
  'doc.fill': 'document',
  'photo.fill': 'image',
  'play.fill': 'play',
  'pause.fill': 'pause',
  'video.fill': 'videocam',
  'waveform': 'mic',
  'xmark': 'close',
} as const;

export type IconSymbolName =
  | 'house.fill'
  | 'house.line'
  | 'paperplane.fill'
  | 'paperplane.line'
  | 'chevron.left.forwardslash.chevron.right'
  | 'chevron.right'
  | 'chevron.left'
  | 'arrow.left'
  | 'arrow.right'
  | 'person.fill'
  | 'person.line'
  | 'account.add'
  | 'account.login'
  | 'account.lock'
  | 'account.unlock'
  | 'check'
  | 'checkmark'
  | 'checkmark.double'
  | 'checkmark.circle'
  | 'theme'
  | 'magnifyingglass'
  | 'clock'
  | 'alert'
  | 'plus.circle.fill'
  | 'doc.fill'
  | 'photo.fill'
  | 'play.fill'
  | 'pause.fill'
  | 'video.fill'
  | 'waveform'
  | 'xmark';

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
  const { theme } = useUnistyles();
  const color = propColor || theme.colors.text;

  const iconName = MAPPING[name as keyof typeof MAPPING];

  if (!iconName) {
    console.warn(`Icon "${name}" is not mapped to Ionicons.`);
    return null;
  }

  return (
    <Ionicons
      name={iconName as any}
      size={size}
      color={color}
      style={style}
    />
  );
}
