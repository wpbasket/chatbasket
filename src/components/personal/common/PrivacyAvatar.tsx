import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { Image } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export interface PrivacyAvatarProps {
  uri: string | null;
  name: string;
  size?: number;
  colorKey?: string;
}

const AVATAR_COLORS = [
  '#00bb77',
  '#8200fcd0',
  '#F89B29',
  '#eb5757',
  '#ff0f7be0',
  '#50c9c3',
  '#083b7d',

] as const;

const getInitials = (name: string) => {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // Only first letter of the name
  return (trimmed[0] ?? '?').toUpperCase();
};

const getAvatarColor = (name: string) => {
  if (!name) return AVATAR_COLORS[0];
  const normalized = name.toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
};

export function PrivacyAvatar({ uri, name, size = 48, colorKey }: PrivacyAvatarProps) {
  const dimensionStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  } as const;

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimensionStyle]} {...({ pointerEvents: 'none' } as any)} />;
  }

  const backgroundColor = getAvatarColor(colorKey || name);

  return (
    <ThemedView
      style={[
        styles.placeholder,
        dimensionStyle,
        { backgroundColor }
      ]}
    >
      <ThemedText type='smallBold' style={[styles.initials, { lineHeight: size }]} selectable={false}>
        {getInitials(name)}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create((theme) => ({
  image: {
    borderRadius: 9999,
    resizeMode: 'cover',
    pointerEvents: 'none',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  initials: {
    color: '#FFFFFF', // White text for gradients
    fontSize: 20, // Adjusted for better fit
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.1)', // Subtle shadow for legibility
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    // lineHeight set dynamically to match size
  },
}));
