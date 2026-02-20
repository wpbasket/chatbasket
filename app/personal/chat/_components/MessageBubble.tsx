import React, { memo, useState, useMemo, useCallback } from 'react';
import { View, Pressable, Modal, TouchableOpacity, Image as RNImage, useWindowDimensions } from 'react-native';
import { ThemedText, ThemedView } from '@/components/ui/basic';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ExpoAudio from 'expo-audio';

// ─── Pure helpers — outside component, never recreated on render ──────────────

const formatSize = (bytes?: number | null): string => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
};

const formatTime = (dateStr: string): string => {
    try {
        return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
};

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageBubbleProps = {
    text: string;
    type: 'me' | 'other';
    messageType?: string;
    status?: 'pending' | 'sent' | 'read';
    delivered?: boolean;
    createdAt: string;
    onLongPress?: (event: import('react-native').GestureResponderEvent) => void;
    onContextMenu?: (event: import('react-native').GestureResponderEvent) => void;
    onPress?: () => void;
    isSelected?: boolean;
    isSelectMode?: boolean;
    fileUrl?: string;
    fileName?: string | null;
    fileSize?: number | null;
    fileMimeType?: string | null;
    viewUrl?: string;
    downloadUrl?: string;
    progress?: number;
    message_id?: string;
};

// ─── Main component ───────────────────────────────────────────────────────────

const MessageBubble = memo(
    ({
        message_id,
        text,
        type,
        messageType = 'text',
        status,
        delivered,
        createdAt,
        onLongPress,
        onContextMenu,
        onPress,
        isSelected,
        isSelectMode,
        fileUrl,
        viewUrl,
        downloadUrl,
        fileName,
        fileSize,
        fileMimeType,
        progress = 0,
    }: MessageBubbleProps) => {
        const [isLightboxVisible, setIsLightboxVisible] = useState(false);
        // Lazy load: video and audio players only mount after first tap — avoids
        // auto-buffering all media in the list when the chat screen opens.
        const [isMediaLoaded, setIsMediaLoaded] = useState(false);
        const { theme } = useUnistyles();
        // useWindowDimensions responds to orientation changes; Dimensions.get() does not
        const { width: windowWidth, height: windowHeight } = useWindowDimensions();
        const isMe = type === 'me';

        // ── Media type detection — memoized, only recomputes when mime/name/type change ─
        const { isImage, isVideo, isAudio } = useMemo(() => {
            if (messageType === 'unsent') return { isImage: false, isVideo: false, isAudio: false };
            const lowerMime = (fileMimeType || '').toLowerCase();
            const lowerName = (fileName || '').toLowerCase();
            return {
                isImage: messageType === 'image' || lowerMime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic)$/.test(lowerName),
                isVideo: messageType === 'video' || lowerMime.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/.test(lowerName),
                isAudio: messageType === 'audio' || lowerMime.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg)$/.test(lowerName),
            };
        }, [messageType, fileMimeType, fileName]);

        // ── Stable handler references ─────────────────────────────────────────
        const handlePress = useCallback(() => {
            if (isSelectMode && onPress) { onPress(); return; }
            if (isImage) { setIsLightboxVisible(true); return; }
            if (isAudio || isVideo) {
                // First tap: load the player. Subsequent taps are handled by player controls.
                if (!isMediaLoaded) setIsMediaLoaded(true);
                return;
            }
            if (onPress) onPress();
        }, [isSelectMode, isImage, isAudio, isVideo, isMediaLoaded, onPress]);

        const closeLightbox = useCallback(() => setIsLightboxVisible(false), []);

        // ── Shared media meta row (filename + size) ───────────────────────────
        const renderMediaMeta = (fallbackLabel: string) => (
            <View style={{ paddingHorizontal: 20, paddingBottom: 2 }}>
                <View style={[styles.fileHeader, { backgroundColor: 'transparent', padding: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <ThemedText numberOfLines={1} style={[styles.fileName, styles.bubbleText, isMe && { color: '#FFFFFF' }, { fontSize: 10, flex: 1 }]}>
                        {fileName || fallbackLabel}
                    </ThemedText>
                    <ThemedText style={[styles.fileSize, isMe ? styles.myTimeText : { opacity: 0.5 }, { fontSize: 8, marginLeft: 8 }]}>
                        {formatSize(fileSize)}
                    </ThemedText>
                </View>
            </View>
        );

        const renderProgressBar = () => {
            if (status !== 'pending' || progress >= 100 || progress <= 0) return null;
            return (
                <View style={[styles.progressContainer, { marginHorizontal: 20 }]}>
                    <View style={[styles.progressBar, { width: `${progress}%` }]} />
                </View>
            );
        };

        const renderStatusIcon = () => {
            if (messageType === 'unsent') return <View style={styles.statusPlaceholder} />;
            if (!isMe) return null;
            if (status === 'pending') return (
                <View style={styles.statusContainer}>
                    <IconSymbol name="clock" size={16} color="rgba(255,255,255,0.7)" />
                </View>
            );
            if (status === 'read') return (
                <View style={styles.statusContainer}>
                    <MaterialCommunityIcon name="checkmark.all" size={18} color={theme.colors.primary} />
                </View>
            );
            if (delivered || status === 'sent') return (
                <View style={styles.statusContainer}>
                    <IconSymbol name="checkmark" size={16} color="#FFD700" />
                </View>
            );
            return null;
        };

        const renderContent = () => {
            if (messageType === 'unsent') {
                return (
                    <View style={styles.contentPadding}>
                        <ThemedText style={[styles.unsentText, isMe && styles.myUnsentText]}>
                            Message unsent
                        </ThemedText>
                    </View>
                );
            }

            if (isImage) {
                const activeViewUrl = viewUrl || fileUrl;
                if (!activeViewUrl) {
                    return (
                        <>
                            <View style={[styles.mediaFrame, { justifyContent: 'center', alignItems: 'center' }]}>
                                <IconSymbol name="photo.fill" size={48} color={theme.colors.border} />
                            </View>
                            {renderProgressBar()}
                        </>
                    );
                }
                return (
                    <>
                        <View style={styles.mediaFrame}>
                            <RNImage
                                source={{ uri: activeViewUrl.trim() }}
                                style={styles.mediaFrameContent}
                                resizeMode="cover"
                                resizeMethod="resize"
                            />
                        </View>
                        {renderMediaMeta('Image')}
                        {renderProgressBar()}
                        {!!text && (
                            <ThemedText style={[styles.caption, styles.bubbleText, isMe && { color: '#FFFFFF' }, { marginTop: 0 }]}>
                                {text}
                            </ThemedText>
                        )}
                    </>
                );
            }

            if (isVideo || isAudio) {
                const activeMediaUrl = viewUrl || fileUrl;
                if (!activeMediaUrl) {
                    return (
                        <View style={styles.contentPadding}>
                            <View style={styles.fileHeader}>
                                <View style={styles.fileIconBox}>
                                    <IconSymbol name={isVideo ? 'video.fill' : 'waveform'} size={24} color={theme.colors.primary} />
                                </View>
                                <View style={styles.fileInfo}>
                                    <ThemedText numberOfLines={1} style={[styles.fileName, styles.bubbleText, isMe && { color: '#FFFFFF' }]}>
                                        {fileName || (isVideo ? 'Video' : 'Audio')}
                                    </ThemedText>
                                    <ThemedText style={[styles.fileSize, isMe ? styles.myTimeText : { opacity: 0.6 }]}>
                                        {status === 'pending' ? 'Preparing...' : 'Resolving...'}
                                    </ThemedText>
                                </View>
                            </View>
                            {renderProgressBar()}
                        </View>
                    );
                }

                return (
                    <>
                        {isVideo ? (
                            // Video: show tap-to-load thumbnail until first tap, then mount player
                            <View style={styles.mediaFrame} pointerEvents={isSelectMode ? 'none' : 'auto'}>
                                {isMediaLoaded ? (
                                    <VideoInlinePlayer url={activeMediaUrl} />
                                ) : (
                                    <View style={styles.videoPlaceholder}>
                                        <View style={styles.videoPlayButton}>
                                            <IconSymbol name="play.fill" size={28} color="#FFFFFF" />
                                        </View>
                                    </View>
                                )}
                            </View>
                        ) : (
                            // Audio: show static shell until first tap, then mount real player
                            <View pointerEvents={isSelectMode ? 'none' : 'auto'}>
                                {isMediaLoaded ? (
                                    <AudioInlinePlayer url={activeMediaUrl} />
                                ) : (
                                    <AudioPlaceholder isMe={isMe} />
                                )}
                            </View>
                        )}
                        {renderMediaMeta(isVideo ? 'Video' : 'Audio')}
                        {renderProgressBar()}
                        {!!text && (
                            <ThemedText style={[styles.caption, styles.bubbleText, isMe && { color: '#FFFFFF' }, { marginTop: 0 }]}>
                                {text}
                            </ThemedText>
                        )}
                    </>
                );
            }

            if (messageType === 'file') {
                const isResolved = !!(downloadUrl || fileUrl);
                return (
                    <View style={styles.contentPadding}>
                        <View style={styles.fileHeader}>
                            <View style={styles.fileIconBox}>
                                <IconSymbol name="doc.fill" size={24} color={theme.colors.orange} />
                            </View>
                            <View style={styles.fileInfo}>
                                <ThemedText numberOfLines={1} style={[styles.fileName, styles.bubbleText, isMe && { color: '#FFFFFF' }]}>
                                    {fileName || 'Attachment'}
                                </ThemedText>
                                <ThemedText style={[styles.fileSize, isMe ? styles.myTimeText : { color: '#FFFFFF' }]}>
                                    {(!isResolved && status !== 'pending') ? 'Resolving link...' : formatSize(fileSize)}
                                </ThemedText>
                            </View>
                        </View>
                        {renderProgressBar()}
                        {!!text && (
                            <ThemedText style={[styles.caption, styles.bubbleText, isMe && { color: '#FFFFFF' }]}>
                                {text}
                            </ThemedText>
                        )}
                    </View>
                );
            }

            // Plain text
            return (
                <View style={styles.contentPadding}>
                    <ThemedText style={[styles.bubbleText, isMe && { color: '#FFFFFF' }]}>{text}</ThemedText>
                </View>
            );
        };

        return (
            <Pressable
                onPress={handlePress}
                onLongPress={onLongPress}
                // @ts-ignore - onContextMenu is web-only
                onContextMenu={onContextMenu}
                delayLongPress={300}
                hitSlop={0}
                style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    isMe ? styles.myBubbleContainer : styles.otherBubbleContainer,
                ]}
            >
                <View
                    accessibilityRole="text"
                    accessibilityLabel={`${isMe ? 'You' : 'Other'}: ${messageType === 'text' ? text : (isImage ? 'Image' : isVideo ? 'Video' : isAudio ? 'Audio' : 'File')}`}
                    style={[
                        styles.bubble,
                        isMe ? styles.myBubble : styles.otherBubble,
                        (isImage || isAudio) && styles.mediaBubble,
                        isVideo && styles.videoBubble,
                        messageType === 'file' && styles.fileBubble,
                        isSelected && styles.selectedBubble,
                    ]}
                >
                    {renderContent()}

                    <View style={styles.footer}>
                        <ThemedText style={[styles.timeText, isMe ? styles.myTimeText : styles.otherTimeText]}>
                            {formatTime(createdAt)}
                        </ThemedText>
                        {renderStatusIcon()}
                        {!isMe && <View style={styles.statusPlaceholder} />}
                    </View>

                    {isSelected && (
                        <View style={styles.selectionOverlay}>
                            <IconSymbol name="checkmark.circle" size={20} color={theme.colors.primary} />
                        </View>
                    )}

                    {/* Modal only mounts for image bubbles — saves a Modal instance per every
                        text/audio/video/file bubble that would otherwise sit in the tree unused */}
                    {isImage && (
                        <Modal
                            visible={isLightboxVisible}
                            transparent
                            animationType="fade"
                            onRequestClose={closeLightbox}
                        >
                            <ThemedView style={styles.lightboxContainer}>
                                <TouchableOpacity style={styles.lightboxClose} onPress={closeLightbox}>
                                    <IconSymbol name="xmark" size={32} color="white" />
                                </TouchableOpacity>
                                {viewUrl || fileUrl ? (
                                    <RNImage
                                        source={{ uri: (viewUrl || fileUrl || '').trim() }}
                                        // Inline style uses hook values so it responds to rotation
                                        style={{ width: windowWidth, height: windowHeight * 0.85, backgroundColor: '#000' }}
                                        resizeMode="contain"
                                    />
                                ) : (
                                    <ThemedText style={{ color: 'white' }}>Image not available</ThemedText>
                                )}
                            </ThemedView>
                        </Modal>
                    )}
                </View>
            </Pressable>
        );
    },
    (prev, next) =>
        prev.text === next.text &&
        prev.type === next.type &&
        prev.status === next.status &&
        prev.messageType === next.messageType &&
        prev.fileUrl === next.fileUrl &&
        prev.viewUrl === next.viewUrl &&
        prev.downloadUrl === next.downloadUrl &&
        prev.fileMimeType === next.fileMimeType &&
        prev.progress === next.progress &&
        prev.delivered === next.delivered &&
        prev.isSelected === next.isSelected &&
        prev.isSelectMode === next.isSelectMode
);

// ─── VideoInlinePlayer ────────────────────────────────────────────────────────

const VideoInlinePlayer = memo(({ url }: { url: string }) => {
    const hasAutoPlayed = React.useRef(false);

    const setup = useCallback((player: any) => {
        player.loop = false;
        player.timeUpdateEventInterval = 0;
    }, []);

    const player = useVideoPlayer({ uri: url, useCaching: true }, setup);

    // expo-video player status: 'idle' | 'loading' | 'readyToPlay' | 'error'
    // Play once readyToPlay — calling play() before this is silently ignored.
    // useRef guards against re-triggering if status oscillates.
    React.useEffect(() => {
        const sub = player.addListener('statusChange', ({ status }: { status: string }) => {
            if (!hasAutoPlayed.current && status === 'readyToPlay') {
                hasAutoPlayed.current = true;
                player.play();
            }
        });
        return () => sub.remove();
    }, [player]);

    return (
        <View style={styles.inlinePlayerContainer}>
            <VideoView
                style={styles.inlineVideo}
                player={player}
                allowsFullscreen
                allowsPictureInPicture
                contentFit="contain"
            />
        </View>
    );
});

// ─── AudioInlinePlayer ────────────────────────────────────────────────────────

const AudioInlinePlayer = memo(({ url }: { url: string }) => {
    const player = ExpoAudio.useAudioPlayer(url, { updateInterval: 250 });
    const status = ExpoAudio.useAudioPlayerStatus(player);
    const [trackWidth, setTrackWidth] = useState(0);
    const hasAutoPlayed = React.useRef(false);

    // Icon state driven purely by tap — no sync from native status at all.
    // Native status is only used for: auto-play trigger, progress bar, and
    // detecting natural end-of-track. The icon never reads status.playing.
    const [isPlaying, setIsPlaying] = useState(false);

    // Auto-play once loaded — set icon to playing at the same time
    React.useEffect(() => {
        if (!hasAutoPlayed.current && status.isLoaded) {
            hasAutoPlayed.current = true;
            setIsPlaying(true);
            player.play();
        }
    }, [status.isLoaded, player]);

    // Detect natural end-of-track: duration known, currentTime reached it
    React.useEffect(() => {
        if (status.isLoaded && status.duration > 0 && status.currentTime >= status.duration && !status.playing) {
            setIsPlaying(false);
        }
    }, [status.currentTime, status.duration, status.playing, status.isLoaded]);

    const togglePlay = useCallback(() => {
        if (isPlaying) {
            setIsPlaying(false);
            player.pause();
        } else {
            setIsPlaying(true);
            player.play();
        }
    }, [isPlaying, player]);

    const handleSeek = useCallback((event: any) => {
        if (event.stopPropagation) event.stopPropagation();
        const x = event.nativeEvent.locationX;
        if (typeof x === 'number' && Number.isFinite(x) && trackWidth > 0 && status.duration > 0) {
            const target = (x / trackWidth) * status.duration;
            if (Number.isFinite(target)) {
                player.seekTo(Math.max(0, Math.min(target, status.duration)));
            }
        }
    }, [trackWidth, status.duration, player]);

    const handleLayout = useCallback((e: any) => {
        setTrackWidth(e.nativeEvent.layout.width);
    }, []);

    const progressValue = status.duration > 0 ? status.currentTime / status.duration : 0;

    return (
        <View style={styles.inlineAudioPlayer}>
            <Pressable onPress={togglePlay} style={styles.audioPlayButton} disabled={!status.isLoaded}>
                <IconSymbol
                    name={isPlaying ? 'pause.fill' : 'play.fill'}
                    size={25}
                    color={status.isLoaded ? '#6366f1' : 'rgba(99,102,241,0.35)'}
                />
            </Pressable>
            <View style={styles.audioWaveform}>
                <View
                    onStartShouldSetResponder={() => true}
                    onResponderRelease={handleSeek}
                    style={styles.audioProgressTrack}
                    onLayout={handleLayout}
                >
                    <View style={styles.audioProgressInner} pointerEvents="none">
                        <View style={[styles.audioProgressFill, { width: `${progressValue * 100}%` }]} />
                    </View>
                </View>
                <ThemedText style={styles.audioTimer}>
                    {Math.floor(status.currentTime)}s / {Math.floor(status.duration)}s
                </ThemedText>
            </View>
        </View>
    );
});

// ─── AudioPlaceholder ────────────────────────────────────────────────────────
// Static shell shown before user taps — zero network cost, zero native player init.

const AudioPlaceholder = memo(({ isMe }: { isMe: boolean }) => (
    <View style={styles.inlineAudioPlayer}>
        <View style={[styles.audioPlayButton, { opacity: 0.85 }]}>
            <IconSymbol name="play.fill" size={25} color="#6366f1" />
        </View>
        <View style={styles.audioWaveform}>
            <View style={styles.audioProgressTrack}>
                <View style={styles.audioProgressInner}>
                    <View style={[styles.audioProgressFill, { width: '0%' }]} />
                </View>
            </View>
            <ThemedText style={styles.audioTimer}>0s / --</ThemedText>
        </View>
    </View>
));

export default MessageBubble;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create((theme) => ({
    // Pressable containers: shrink-wrap to bubble content so gap between
    // bubbles is outside the hit area. Sender = right (flex-end), receiver = left (flex-start).
    myBubbleContainer: {
        alignSelf: 'flex-start',
        marginBottom: 28,
        maxWidth: '85%',
        minWidth: 150,
    },
    otherBubbleContainer: {
        alignSelf: 'flex-end',
        marginBottom: 28,
        maxWidth: '85%',
        minWidth: 150,
    },
    bubble: {
        borderRadius: 20,
        overflow: 'hidden',
        // No maxWidth/minWidth here — they live on the Pressable container above
    },
    myBubble: {
        backgroundColor: theme.colors.bubblePurple,
        borderBottomRightRadius: 4,  // swapped
    },
    otherBubble: {
        backgroundColor: theme.colors.card,
        borderBottomLeftRadius: 4,   // swapped
    },
    mediaBubble: {
        minWidth: 260,
    },
    fileBubble: {
        minWidth: 260,
    },
    videoBubble: {
        width: '100%',
        minWidth: 260,
        maxWidth: 360,  // prevents oversized video on wide web screens
    },
    contentPadding: {
        paddingTop: 4,
        // paddingBottom: 0,
        paddingHorizontal: 20,
    },
    bubbleText: {
        color: theme.colors.text,
        lineHeight: 20,
    },
    mediaFrame: {
        marginHorizontal: 20,
        marginTop: 8,
        aspectRatio: 16 / 9,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'rgba(0,0,0,0.06)',
        marginBottom: 4,
    },
    mediaFrameContent: {
        width: '100%',
        height: '100%',
    },
    caption: {
        marginTop: 2,
        marginBottom: 4,
        marginHorizontal: 12,
        fontSize: 14,
        lineHeight: 18,
    },
    fileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        borderTopLeftRadius: 60,
        borderBottomLeftRadius: 60,
        borderTopRightRadius: 80,
        borderBottomRightRadius: 8,
        paddingTop: 5,
    },
    fileIconBox: {
        width: 35,
        height: 35,
        borderRadius: 9999,
        backgroundColor: theme.colors.white,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    fileInfo: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    fileName: {
        fontSize: 10,
        fontWeight: '600',
        color: theme.colors.text,
        lineHeight: 11,
        letterSpacing: 1.5,
    },
    fileSize: {
        fontSize: 8,
        lineHeight: 9,
        letterSpacing: 0.5,
    },
    unsentText: {
        fontSize: 14,
        lineHeight: 20,
        fontStyle: 'italic',
        opacity: 0.6,
        color: theme.colors.textSecondary,
    },
    myUnsentText: {
        color: 'rgba(255, 255, 255, 0.9)',
    },
    statusContainer: {
        marginLeft: 6,
        backgroundColor: 'transparent',
    },
    statusPlaceholder: {
        width: 18,
        height: 18,
        marginLeft: 6,
        backgroundColor: 'transparent',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingHorizontal: 20,
        paddingBottom: 0,
        marginTop: -4,
    },
    timeText: {
        fontSize: 8.5,
        fontStyle: 'italic',
        letterSpacing: 1,
    },
    myTimeText: {
        color: 'rgba(255,255,255,0.8)',
    },
    otherTimeText: {
        opacity: 0.6,
    },
    selectedBubble: {
        borderWidth: 2,
        borderColor: theme.colors.primary,
        transform: [{ scale: 0.98 }],
    },
    selectionOverlay: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: theme.colors.primary,
        borderRadius: 14,
        padding: 4,
    },
    progressContainer: {
        height: 4,
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.08)',
        borderRadius: 2,
        marginTop: 6,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: theme.colors.primary,
        borderRadius: 2,
    },
    videoPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.18)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoPlayButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        // Offset play icon visually to center it
        paddingLeft: 4,
    },
    inlinePlayerContainer: {
        width: '100%',
        height: '100%',   // fills the mediaFrame which owns the aspectRatio
        backgroundColor: 'transparent',
    },

    inlineVideo: {
        width: '100%',
        height: '100%',
    },
    inlineAudioPlayer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        margin: 8,
        padding: 10,
        height: 42,
        justifyContent: 'center',
    },
    audioPlayButton: {
        width: 35,
        height: 35,
        borderRadius: 22,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    audioWaveform: {
        flex: 1,
        justifyContent: 'center',
        height: 36,
        backgroundColor: 'transparent',
    },
    audioProgressTrack: {
        height: 36,
        justifyContent: 'center',
        width: '100%',
    },
    audioProgressInner: {
        height: 6,
        backgroundColor: 'white',
        borderRadius: 3,
        overflow: 'hidden',
        width: '100%',
    },
    audioProgressFill: {
        height: '100%',
        backgroundColor: theme.colors.orange,
        borderRadius: 3,
    },
    audioTimer: {
        fontSize: 10,
        marginTop: 4,
        opacity: 0.8,
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
    },
    lightboxContainer: {
        flex: 1,
        backgroundColor: 'black',
        justifyContent: 'center',
        alignItems: 'center',
    },
    lightboxClose: {
        position: 'absolute',
        top: 50,
        right: 25,
        zIndex: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 20,
        padding: 8,
    },
}));