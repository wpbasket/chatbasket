import { ThemedText } from '@/components/ui/common/ThemedText';
import { $personalStateUser } from '@/state/personalState/user/personal.state.user';
import { getProfileAvatarBlob } from '@/lib/storage/personalStorage/profile/profile.storage';
import { useValue } from '@legendapp/state/react';
import { useEffect, useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

const AVATAR_COLORS = [
    '#00bb77',
    '#8200fcd0',
    '#F89B29',
    '#eb5757',
    '#ff0f7be0',
    '#50c9c3',
    '#083b7d',
] as const;

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

/**
 * Isolated profile avatar component.
 * Renders the current user's profile picture from local storage (IndexedDB on Web,
 * filesystem on Native). This component is NOT shared with chat lists, contacts,
 * or any other part of the app — it is strictly for the Profile section.
 *
 * Resolution order:
 * 1. Local blob (idb:// on Web, file:// on Native) via $personalStateUser.avatarUri
 * 2. Fallback to initials
 */
export function ProfileAvatar({ size = 80, uri }: { size?: number, uri?: string | null }) {
    const { theme, rt } = useUnistyles();
    const avatarUriFromState = useValue($personalStateUser.avatarUri);
    const avatarUri = uri !== undefined ? uri : avatarUriFromState;
    const name = useValue($personalStateUser.user?.name) ?? '';
    const [resolvedUri, setResolvedUri] = useState<string | null>(null);

    useEffect(() => {
        if (!avatarUri) {
            console.log('[ProfileAvatar:UI] No avatarUri, showing initials');
            setResolvedUri(null);
            return;
        }

        // Web: resolve idb:// key to a blob URL
        if (Platform.OS === 'web' && avatarUri.startsWith('idb://')) {
            let revoked = false;
            let blobUrl: string | null = null;

            getProfileAvatarBlob()
                .then((blob: Blob | null) => {
                    if (blob && !revoked) {
                        blobUrl = URL.createObjectURL(blob);
                        console.log('[ProfileAvatar:UI] Resolved ProfileStorage blob URL:', blobUrl);
                        setResolvedUri(blobUrl);
                    }
                })
                .catch((err: any) => {
                    console.error('[ProfileAvatar:UI] Failed to resolve IDB blob:', err);
                    setResolvedUri(null);
                });

            return () => {
                revoked = true;
                if (blobUrl) URL.revokeObjectURL(blobUrl);
            };
        }

        // Native: file:// URI — verify it exists before rendering
        if (Platform.OS !== 'web' && avatarUri.startsWith('file://')) {
            import('expo-file-system').then(({ File }) => {
                // Strip query param for existence check
                const pureUri = avatarUri.split('?')[0];
                const file = new File(pureUri);
                const exists = file.exists;
                console.log('[ProfileAvatar:UI] Verifying native file existence:', exists ? 'FOUND' : 'MISSING', pureUri);
                setResolvedUri(exists ? avatarUri : null);
            }).catch((err: any) => {
                console.error('[ProfileAvatar:UI] Failed to verify native file:', err);
                setResolvedUri(null);
            });
            return;
        }

        // Other URIs (blob:, etc.) — use directly
        console.log('[ProfileAvatar:UI] Using URI directly:', avatarUri);
        setResolvedUri(avatarUri);
    }, [avatarUri]);

    const dimensionStyle = {
        width: size,
        height: size,
        borderRadius: 9999,
        borderWidth: rt.themeName === 'dark' ? 0 : 2,
        borderColor: theme.colors.border,
        overflow: 'hidden',
    } as const;

    if (resolvedUri) {
        return (
            <View style={dimensionStyle}>
                <Image 
                    source={{ uri: resolvedUri }} 
                    style={styles.image} 
                    resizeMethod="resize"
                />
            </View>
        );
    }

    // Fallback: initials
    const initial = name ? name.trim()[0]?.toUpperCase() ?? '?' : '?';
    const backgroundColor = getAvatarColor(name);

    return (
        <View style={[dimensionStyle, { backgroundColor }]}>
            <View style={styles.placeholder}>
                <ThemedText
                    type="smallBold"
                    style={[styles.initials, { lineHeight: size, fontSize: size * 0.4 }]}
                    selectable={false}
                >
                    {initial}
                </ThemedText>
            </View>
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    image: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
        pointerEvents: 'none',
    },
    placeholder: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    initials: {
        color: '#FFFFFF',
        fontWeight: '600',
        textShadowColor: 'rgba(0, 0, 0, 0.1)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
        textAlign: 'center',
        textAlignVertical: 'center',
        includeFontPadding: false,
    },
}));
