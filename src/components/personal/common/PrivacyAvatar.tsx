import { useEffect, useState } from 'react';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { Image, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { resolveAvatarUri, downloadAndCacheAvatar } from '@/utils/personalUtils/util.avatarCache';

export interface PrivacyAvatarProps {
  userId: string;
  uri: string | null;
  name: string;
  size?: number;
  colorKey?: string;
  avatarFileId?: string | null;
  cachedAvatarFileId?: string | null;
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

export function PrivacyAvatar({ 
  userId, 
  uri: serverUri, 
  name, 
  size = 48, 
  colorKey,
  avatarFileId,
  cachedAvatarFileId 
}: PrivacyAvatarProps) {
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const { theme } = useUnistyles();

  useEffect(() => {
    let isMounted = true;
    let blobUrl: string | null = null;
    
    async function resolve() {
      const { uri: resolvedUri, needsDownload } = await resolveAvatarUri(
        userId,
        serverUri,
        avatarFileId ?? null,
        cachedAvatarFileId ?? null
      );

      let finalUri = resolvedUri;

      // If we need to download, do it FIRST before showing anything
      if (needsDownload && serverUri && avatarFileId) {
        console.log(`[PrivacyAvatar:${userId}] Downloading before display...`);
        const localUri = await downloadAndCacheAvatar(userId, serverUri, avatarFileId);
        
        if (localUri) {
          console.log(`[PrivacyAvatar:${userId}] Download successful, using local storage`);
          finalUri = localUri;
        } else {
          console.log(`[PrivacyAvatar:${userId}] Download failed, falling back to server URL as last resort`);
          finalUri = serverUri;
        }
      }
      
      // Web resolution: idb:// -> blob:
      if (Platform.OS === 'web' && finalUri?.startsWith('idb://')) {
        const key = finalUri.split('//')[1]?.split('?')[0];
        if (key) {
          const { getProfileAvatarBlob } = await import('@/lib/storage/personalStorage/profile/profile.storage');
          const blob = await getProfileAvatarBlob(key);
          if (blob && isMounted) {
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            blobUrl = URL.createObjectURL(blob);
            finalUri = blobUrl;
            console.log(`[PrivacyAvatar:${userId}] Web Resolved idb:// to blob URL`);
          }
        }
      }
      
      if (isMounted) setDisplayUri(finalUri);
    }

    resolve();
    return () => { 
      isMounted = false; 
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [userId, serverUri, avatarFileId, cachedAvatarFileId]);

  const dimensionStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  } as const;

  // Better: check if theme name exists
  const isDark = (theme as any).name === 'dark' || (theme as any).mode === 'dark';
  const finalBorderWidth = isDark ? 0 : 1;

  if (displayUri) {
    return (
      <Image 
        source={{ uri: displayUri }} 
        style={[styles.image, dimensionStyle, { borderWidth: finalBorderWidth }]} 
        resizeMethod="resize"
      />
    );
  }

  const backgroundColor = getAvatarColor(colorKey || name);

  return (
    <ThemedView
      style={[
        styles.placeholder,
        dimensionStyle,
        { backgroundColor, borderWidth: finalBorderWidth }
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
