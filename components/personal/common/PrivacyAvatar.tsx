import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { Image } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export interface PrivacyAvatarProps {
  uri: string | null;
  name: string;
  size?: number;
}

const getInitials = (name: string) => {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // Only first letter of the name
  return (trimmed[0] ?? '?').toUpperCase();
};

export function PrivacyAvatar({ uri, name, size = 48 }: PrivacyAvatarProps) {
  const dimensionStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  } as const;

  if (uri) {
    return <Image source={{ uri }} style={[styles.image, dimensionStyle]} />;
  }

  return (
    <ThemedView style={[styles.placeholder, dimensionStyle]}>
      <ThemedText type='smallBold' style={styles.initials} selectable={false}>
        {getInitials(name)}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create((theme) => ({
  image: {
    borderRadius: 999,
    resizeMode: 'cover',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.icon,
    borderWidth: 1,
    borderColor: theme.colors.neutral,
  },
  initials: {
    color: theme.colors.white,
    fontSize: 25,
    fontWeight: '600',
  },
}));
