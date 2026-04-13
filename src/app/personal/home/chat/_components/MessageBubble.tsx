import React, { memo, useMemo, useCallback, useEffect } from 'react';
import { View, Pressable, Modal, TouchableOpacity, Image as RNImage, useWindowDimensions, Platform, ActivityIndicator } from 'react-native';
import { ThemedText, ThemedView } from '@/components/ui/basic';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ExpoAudio from 'expo-audio';
import { UnistylesRuntime } from 'react-native-unistyles';
import { getMediaBlob } from '@/lib/storage/personalStorage/chat/chat.storage';
import { useObservable, useValue, useObserve } from '@legendapp/state/react';
import { $uiState, generateMediaId } from '@/state/ui/state.ui';

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

const formatDuration = (seconds: number): string => {
    const s = Math.floor(seconds);
    if (s < 60) return `${s}sec`;
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return secs === 0 ? `${mins} min` : `${mins} min ${secs}sec`;
};

const formatFileName = (name: string | null | undefined, maxLength: number = 30): string => {
    if (!name) return '';
    if (name.length <= maxLength) return name;

    const dotIndex = name.lastIndexOf('.');
    if (dotIndex !== -1 && dotIndex > 0) {
        const extension = name.slice(dotIndex);
        const baseName = name.slice(0, dotIndex);

        if (baseName.length > 20) {
            const startStr = baseName.slice(0, 15);
            const endStr = baseName.slice(-5);
            return `${startStr}...${endStr}${extension}`;
        }
    }

    if (name.length > maxLength) {
        return name.slice(0, 15) + '...' + name.slice(-5);
    }
    return name;
};

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageBubbleProps = {
    text: string;
    type: 'me' | 'other';
    messageType?: string;
    status?: 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'error';
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
    localUri?: string | null;
};

// ─── Hook: resolve local_uri to a renderable URI ─────────────────────────────
// Native: file:// path used directly.
// Web: idb:// marker → retrieve encrypted blob from IDB → URL.createObjectURL().

function useLocalMediaUri(
    localUri: string | null | undefined,
    messageId?: string
): string | null {
    // Phase 4b optimization: Initialize immediately if it's a native file path.
    // This avoids the 1-tick flicker of the ActivityIndicator on app boot/scroll.
    const resolvedUri$ = useObservable<string | null>(
        (Platform.OS !== 'web' && localUri?.startsWith('file://')) ? localUri : null
    );

    useEffect(() => {
        if (!localUri) { resolvedUri$.set(null); return; }

        if (Platform.OS !== 'web') {
            // Native: local_uri is a file:// path. 
            // We verify it actually exists on disk before resolving.
            if (localUri.startsWith('file://')) {
                import('expo-file-system').then(({ File }) => {
                    const file = new File(localUri);
                    if (file.exists) {
                        resolvedUri$.set(localUri);
                    } else {
                        resolvedUri$.set(null);
                    }
                }).catch(() => resolvedUri$.set(null));
            } else {
                resolvedUri$.set(localUri);
            }
            return;
        }

        // Web: idb:// marker → blob URL via getMediaBlob()
        if (localUri.startsWith('idb://')) {
            const msgId = localUri.replace('idb://', '');
            let revoked = false;
            let blobUrl: string | null = null;
            getMediaBlob(msgId).then((result: { blob: Blob; mime: string } | null) => {
                if (result && !revoked) {
                    blobUrl = URL.createObjectURL(result.blob);
                    resolvedUri$.set(blobUrl);
                }
            }).catch(() => {
                // IDB read failed (corrupt store, etc.) — fall back to server URLs
                resolvedUri$.set(null);
            });
            return () => {
                revoked = true;
                if (blobUrl) URL.revokeObjectURL(blobUrl);
            };
        }

        // Other URI (e.g. blob:, data:, etc.)
        resolvedUri$.set(localUri);
    }, [localUri, messageId]);

    return useValue(resolvedUri$);
}

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
        localUri,
    }: MessageBubbleProps) => {
        // Resolve local_uri to a renderable URI (file:// on native, blob: on web)
        const resolvedLocalUri = useLocalMediaUri(localUri, message_id);
        const isLightboxVisible$ = useObservable(false);
        const isLightboxVisible = useValue(isLightboxVisible$);
        // Lazy load: video and audio players only mount after first tap — avoids
        // auto-buffering all media in the list when the chat screen opens.
        const isMediaLoaded$ = useObservable(false);
        const isMediaLoaded = useValue(isMediaLoaded$);
        const { theme } = useUnistyles();
        // useWindowDimensions responds to orientation changes; Dimensions.get() does not
        const { width: windowWidth, height: windowHeight } = useWindowDimensions();
        const isMe = type === 'me';

        // ── Ready state check ─────────────────────────────────────────────────
        // A file is ready if we have a resolved local URI and it's not pending or error.
        const isError = status === 'error';
        const isReady = useValue(() => {
            if (messageType === 'text' || messageType === 'unsent') return true;
            const isPending = status === 'pending' || status === 'sending';
            // Optimization: Detect if we have an incoming download that hasn't started yet
            const isIncomingMissing = !isMe && !localUri && !isError;
            
            // If we have a localUri (even before resolved) and aren't pending/error, 
            // we can trust it for the 'Play' icon visibility to avoid flickering.
            return (!!resolvedLocalUri || !!localUri) && !isPending && !isError && !isIncomingMissing;
        });

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
            
            // Interaction Lock: prevent opening if not ready
            if (!isReady) return;

            if (isImage) { isLightboxVisible$.set(true); return; }
            if (isAudio || isVideo) {
                // First tap: load the player. Subsequent taps are handled by player controls.
                if (!isMediaLoaded$.get()) {
                    isMediaLoaded$.set(true);
                }
                return;
            }
            if (onPress) onPress();
        }, [isSelectMode, isImage, isAudio, isVideo, onPress, isReady]);

        const closeLightbox = useCallback(() => isLightboxVisible$.set(false), []);

        // ── Shared media meta row (filename + size) ───────────────────────────
        const renderMediaMeta = (fallbackLabel: string) => (
            <View style={{ paddingLeft: 20, paddingRight: 30, paddingBottom: 6, paddingTop: 4, zIndex: 1 }}>
                <View style={[styles.fileHeader, { backgroundColor: 'transparent', padding: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <ThemedText numberOfLines={1} style={[styles.fileName, styles.bubbleText, !isMe && { color: '#FFFFFF' }, { fontSize: 10, flex: 1 }]}>
                        {formatFileName(fileName || fallbackLabel)}
                    </ThemedText>
                    <ThemedText style={[styles.fileSize, isMe ? styles.myTimeText : styles.otherTimeText, { fontSize: 8, marginLeft: 8 }]}>
                        {formatSize(fileSize)}
                    </ThemedText>
                </View>
            </View>
        );

        const renderProgressBar = () => {
            const isPendingLike = status === 'pending' || status === 'sending';
            const isIncomingDownload = !isMe && !resolvedLocalUri && status !== 'error';
            
            // Show progress bar for any media while it is downloading or uploading
            if ((!isPendingLike && !isIncomingDownload) || progress >= 100 || progress <= 0) return null;
            return (
                <View style={[styles.progressContainer, { marginLeft: 20, marginRight: 30 }]}>
                    <View style={[styles.progressBar, { width: `${progress}%` }]} />
                </View>
            );
        };

        const renderStatusIcon = () => {
            if (messageType === 'unsent') return isMe ? <View style={styles.statusPlaceholder} /> : null;
            if (!isMe) return null;

            if (status === 'pending' || status === 'sending') return (
                <View style={styles.statusContainer}>
                    <IconSymbol name="clock" size={15} color="#999" />
                </View>
            );

            // Double Checkmark: Grey or Primary (for read)
            if (delivered || status === 'delivered' || status === 'read') {
                const isRead = status === 'read';
                return (
                    <View style={styles.statusContainer}>
                        <MaterialCommunityIcon
                            name="checkmark.all"
                            color={isRead ? theme.colors.primary : "#999"}
                            size={16}
                        />
                    </View>
                );
            }

            if (status === 'sent') return (
                <View style={styles.statusContainer}>
                    <MaterialCommunityIcon name="checkmark" size={16} color="#999" />
                </View>
            );

            if (status === 'error') return (
                <View style={styles.statusContainer}>
                    <IconSymbol name="alert" size={16} color={theme.colors.errorText} />
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
                const activeViewUrl = resolvedLocalUri || viewUrl || fileUrl;
                if (!activeViewUrl) {
                    return (
                        <View style={styles.mediaBubbleWrapper}>
                            <View style={[styles.mediaFrame, { justifyContent: 'center', alignItems: 'center' }]}>
                                <IconSymbol name="photo.fill" size={48} color={theme.colors.border} />
                            </View>
                            {renderProgressBar()}
                        </View>
                    );
                }
                return (
                    <View style={styles.mediaBubbleWrapper} pointerEvents={isSelectMode ? 'auto' : 'box-none'}>
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
                        {/* Only show caption if user-provided caption exists */}
                        {!!text && (
                            <ThemedText style={[styles.caption, styles.bubbleText, !isMe && { color: '#FFFFFF' }, { marginTop: 0 }]}>
                                {text}
                            </ThemedText>
                        )}
                    </View>
                );
            }

            if (isVideo || isAudio) {
                const activeMediaUrl = resolvedLocalUri || viewUrl || fileUrl;
                if (!activeMediaUrl) {
                    return (
                        <View style={isVideo ? styles.mediaBubbleWrapper : styles.contentPadding}>
                            <View style={styles.fileHeader}>
                                <View style={styles.fileIconBox}>
                                    <IconSymbol name={isVideo ? 'video.fill' : 'waveform'} size={24} color={theme.colors.primary} />
                                </View>
                                <View style={styles.fileInfo}>
                                    <ThemedText numberOfLines={1} style={[styles.fileName, styles.bubbleText, !isMe && { color: '#FFFFFF' }]}>
                                        {formatFileName(fileName || (isVideo ? 'Video' : 'Audio'))}
                                    </ThemedText>
                                    <ThemedText style={[styles.fileSize, isMe ? styles.myTimeText : styles.otherTimeText]}>
                                        {(status === 'pending' || status === 'sending') ? 'Preparing...' : 'Resolving...'}
                                    </ThemedText>
                                </View>
                            </View>
                            {!isVideo && renderProgressBar()}
                        </View>
                    );
                }

                return (
                    <View style={styles.mediaBubbleWrapper} pointerEvents={(isMediaLoaded && !isSelectMode) ? 'box-none' : 'auto'}>
                        {isVideo ? (
                            // Video: show tap-to-load thumbnail until first tap, then mount player
                            <View style={styles.mediaFrame} pointerEvents={isSelectMode ? 'none' : 'auto'}>
                                {isMediaLoaded ? (
                                    <VideoInlinePlayer 
                                        url={activeMediaUrl} 
                                        isReady={isReady}
                                        onExit={() => {
                                            isMediaLoaded$.set(false);
                                        }} 
                                    />
                                ) : (
                                    <View style={styles.videoPlaceholder}>
                                        <View style={[styles.videoPlayButton, (!isReady || isError) && { opacity: 0.5 }]}>
                                            {isError ? (
                                                <IconSymbol name="alert" size={24} color="#ef4444" />
                                            ) : !isReady ? (
                                                <ActivityIndicator size="small" color="#FFFFFF" />
                                            ) : (
                                                <IconSymbol name="play.fill" size={28} color="#FFFFFF" />
                                            )}
                                        </View>
                                    </View>
                                )}
                            </View>
                        ) : (
                            // Audio: show static shell until first tap, then mount real player
                            <View style={{ marginTop: 8 }} pointerEvents={isSelectMode ? 'none' : 'auto'}>
                                {isMediaLoaded ? (
                                    <AudioInlinePlayer url={activeMediaUrl} isMe={isMe} onLongPress={onLongPress} isReady={isReady} />
                                ) : (
                                    <AudioPlaceholder isMe={isMe} isReady={isReady} isError={isError} />
                                )}
                            </View>
                        )}
                        {renderMediaMeta(isVideo ? 'Video' : 'Audio')}
                        {!isVideo && renderProgressBar()}
                        {/* Only show caption if user-provided caption exists */}
                        {!!text && (
                            <ThemedText style={[styles.caption, styles.bubbleText, !isMe && { color: '#FFFFFF' }, { marginTop: 0 }]}>
                                {text}
                            </ThemedText>
                        )}
                    </View>
                );
            }

            if (messageType === 'file') {
                const isResolved = !!(resolvedLocalUri || downloadUrl || fileUrl);
                return (
                    <View style={styles.contentPadding}>
                        <View style={styles.fileHeader}>
                            <View style={styles.fileIconBox}>
                                {isError ? (
                                    <IconSymbol name="alert" size={18} color="#ef4444" />
                                ) : !isReady ? (
                                    <ActivityIndicator size="small" color={theme.colors.primary} />
                                ) : (
                                    <IconSymbol name="doc.fill" size={24} color={theme.colors.orange} />
                                )}
                            </View>
                            <View style={styles.fileInfo}>
                                <ThemedText numberOfLines={1} style={[styles.fileName, styles.bubbleText, !isMe && { color: '#FFFFFF' }]}>
                                    {formatFileName(fileName || 'Attachment')}
                                </ThemedText>
                                <ThemedText style={[styles.fileSize, isMe ? styles.myTimeText : styles.otherTimeText]}>
                                    {(!isResolved && status !== 'pending' && status !== 'sending') ? 'Resolving link...' : formatSize(fileSize)}
                                </ThemedText>
                            </View>
                        </View>
                        {renderProgressBar()}
                        {/* Only show caption if user-provided caption exists */}
                        {!!text && (
                            <ThemedText style={[styles.caption, styles.bubbleText, !isMe && { color: '#FFFFFF' }]}>
                                {text}
                            </ThemedText>
                        )}
                    </View>
                );
            }

            // Plain text
            return (
                <View style={styles.contentPadding}>
                    <ThemedText style={[styles.bubbleText, !isMe && { color: '#FFFFFF' }]}>{text}</ThemedText>
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
                delayPressIn={150} // Increased delay to further filter out seek taps
                hitSlop={0}
                style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    !isMe ? styles.myBubbleContainer : styles.otherBubbleContainer,
                ]}
                // On native, once media is loaded, touches should still trigger options.
                // We rely on child Pressables (like play buttons) to handle their own taps.

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
                    pointerEvents="auto"
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
                                {resolvedLocalUri || viewUrl || fileUrl ? (
                                    <RNImage
                                        source={{ uri: (resolvedLocalUri || viewUrl || fileUrl || '').trim() }}
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
        prev.isSelectMode === next.isSelectMode &&
        prev.isSelectMode === next.isSelectMode &&
        prev.localUri === next.localUri &&
        prev.fileName === next.fileName &&
        prev.fileSize === next.fileSize
);

// ─── VideoModalPlayer ─────────────────────────────────────────────────────────

// ─── VideoInlinePlayer ────────────────────────────────────────────────────────

const VideoInlinePlayer = memo((props: { 
    url: string; 
    isReady: boolean;
    onExit: () => void;
    onLongPress?: (event: any) => void;
}) => {
    const { url, onExit, onLongPress } = props;
    const { rt } = useUnistyles();
    const videoRef = React.useRef<VideoView>(null);
    const hasAutoFullscreenRef = React.useRef(false);
    const trackRef = React.useRef<View>(null);
    const isMountedRef = React.useRef(true);
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const isClosing$ = useObservable(false);
    const mediaId = React.useRef(generateMediaId('video')).current;
    
    const uiTimeRef = React.useRef(0);
    const uiTime$ = useObservable(0);
    const uiTime = useValue(uiTime$);
    const isPlaying$ = useObservable(false);
    const displayPlaying = useValue(isPlaying$);
    
    // Logic refs
    const lastFrameTimeRef = React.useRef<number | null>(null);
    const rafIdRef = React.useRef<number | null>(null);
    const isBlockingSync = React.useRef(false);

    const setup = useCallback((player: any) => {
        player.loop = false;
        player.timeUpdateEventInterval = 0.1; // 100ms Native Heartbeat
    }, []);

    const videoSource = React.useMemo(() => ({ 
        uri: url, 
        useCaching: true 
    }), [url]);
    
    const player = useVideoPlayer(videoSource, setup);

    // ── PROGRESS LOOP (60FPS Smoothness) ────────────────────────────────
    const runLoop = useCallback((timestamp: number) => {
        if (lastFrameTimeRef.current !== null) {
            const delta = (timestamp - lastFrameTimeRef.current) / 1000;
            const dur = player.duration;
            const next = uiTimeRef.current + delta;
            
            // Auto-detection of video end - proactive trigger 200ms before absolute end
            if (dur > 0 && next >= dur - 0.2 && !isClosing$.get()) {
                if (isMountedRef.current) {
                    uiTimeRef.current = dur;
                    uiTime$.set(dur);
                    isClosing$.set(true);
                    try {
                        player.pause();
                    } catch (e) {}
                    onExit();
                }
                return; // Stop animation loop after trigger
            }

            uiTimeRef.current = dur > 0 ? Math.min(next, dur) : next;
            uiTime$.set(uiTimeRef.current);
        }
        lastFrameTimeRef.current = timestamp;
        rafIdRef.current = requestAnimationFrame(runLoop);
    }, [player.duration, onExit]);

    // Start/Stop loop based on playback state
    React.useEffect(() => {
        const playing = isPlaying$.get();
        if (playing) {
            lastFrameTimeRef.current = null;
            rafIdRef.current = requestAnimationFrame(runLoop);
        } else {
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
        return () => {
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        };
    }, [displayPlaying, runLoop]);

    React.useEffect(() => {
        const statusSub = player.addListener('statusChange', ({ status }: { status: string }) => {
            if (status === 'readyToPlay') {
                if (!hasAutoFullscreenRef.current) {
                    hasAutoFullscreenRef.current = true;
                    $uiState.claimMediaFocus(mediaId);
                    player.play();
                }
            }
        });

        // The native way to detect video end
        const endSub = player.addListener('playToEnd', () => {
            if (isMountedRef.current && !isClosing$.get()) {
                isClosing$.set(true);
                try {
                    player.pause();
                } catch (e) {}
                onExit();
            }
        });

        // Track playing state with heavy dampening to prevent flickering
        const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
            // Only sync from native if we are NOT interacting and the state is stable
            if (!isBlockingSync.current && isMountedRef.current) {
                if (isPlaying) {
                    isPlaying$.set(true);
                } else {
                    // Ignore brief pause signals (seeking/buffering)
                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                    timeoutRef.current = setTimeout(() => {
                        // CRITICAL: Check if still mounted before accessing player
                        if (isMountedRef.current && !isBlockingSync.current && !player.playing) {
                            isPlaying$.set(false);
                        }
                    }, 150);
                }
            }
        });

        // Native Heartbeat Monitor
        const timeSub = player.addListener('timeUpdate', ({ currentTime }) => {
            const dur = player.duration;
            if (dur > 0 && currentTime >= dur - 0.2 && !isClosing$.get()) {
                if (isMountedRef.current) {
                    isClosing$.set(true);
                    try {
                        player.pause();
                    } catch (e) {}
                    onExit();
                }
            }
        });

        return () => {
            isMountedRef.current = false;
            statusSub.remove();
            playingSub.remove();
            endSub.remove();
            timeSub.remove();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [player, onExit]);



    const togglePlay = useCallback(() => {
        if (player.playing) {
            player.pause();
            isPlaying$.set(false);
            $uiState.releaseMediaFocus(mediaId);
        } else {
            // Replay logic
            if (uiTime$.get() >= player.duration - 0.2) {
                player.currentTime = 0;
                uiTimeRef.current = 0;
                uiTime$.set(0);
            }
            $uiState.claimMediaFocus(mediaId);
            player.play();
            isPlaying$.set(true);
        }
    }, [player]);

    const handleSeek = useCallback((e: any) => {
        const touchX = e.nativeEvent.pageX;
        if (!trackRef.current) return;

        trackRef.current.measure(async (_x, _y, width, _h, pageX) => {
            if (width <= 0) return;
            const ratio = Math.max(0, Math.min((touchX - pageX) / width, 1));
            const target = ratio * player.duration;
            
            uiTimeRef.current = target;
            uiTime$.set(target);
            isBlockingSync.current = true;

            try {
                player.currentTime = target;
                setTimeout(() => { isBlockingSync.current = false; }, 1000);
            } catch {
                isBlockingSync.current = false;
            }
        });
    }, [player]);

    const displayProgress = player.duration > 0 ? uiTime / player.duration : 0;

    const renderContent = () => (
        <View style={styles.fullscreenContainer}>
            <VideoView
                ref={videoRef}
                style={styles.fullscreenVideo}
                player={player}
                allowsPictureInPicture
                contentFit="contain"
                nativeControls={false}
                onFullscreenExit={onExit}
                playsInline={true}
            />
            
            {/* Custom Pro HUD Overlay */}
            <Pressable 
                onPress={togglePlay} 
                onLongPress={onLongPress}
                style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
            >
                {!displayPlaying && (
                    <View style={styles.videoOverlayVisible}>
                        <View style={styles.videoPlayButton}>
                            <IconSymbol name="play.fill" size={32} color="#FFFFFF" />
                        </View>
                    </View>
                )}
            </Pressable>

            {/* Bottom Control Bar */}
            <View style={[
                styles.videoBottomBar, 
                { 
                    zIndex: 2,
                    paddingBottom: Math.max(rt.insets.bottom, 20)
                }
            ]}>
                <Pressable onPress={togglePlay} style={styles.videoMiniToggle}>
                    <IconSymbol 
                        name={displayPlaying ? 'pause.fill' : 'play.fill'} 
                        size={18} 
                        color="#FFF" 
                    />
                </Pressable>
                
                <Pressable 
                    ref={trackRef}
                    onPressIn={handleSeek}
                    style={styles.videoProgressTrack}
                >
                    <View style={styles.videoProgressInner}>
                        <View style={[styles.videoProgressFill, { width: `${displayProgress * 100}%` }]} />
                    </View>
                </Pressable>

                <ThemedText style={styles.videoTimer}>
                    {formatDuration(uiTime)} / {formatDuration(player.duration)}
                </ThemedText>

                <Pressable onPress={onExit} style={[styles.videoMiniToggle, { marginLeft: 10 }]}>
                    <IconSymbol name="xmark" size={18} color="#FFF" />
                </Pressable>
            </View>
        </View>
    );

    return (
        <Modal
            transparent={false}
            animationType="fade"
            visible={!isClosing$.get()}
            onRequestClose={() => {
                isClosing$.set(true);
                onExit();
            }}
        >
            <View style={{ flex: 1, backgroundColor: '#000' }}>
                {renderContent()}
            </View>
        </Modal>
    );
});

// ─── AudioInlinePlayer ────────────────────────────────────────────────────────
// "UI-MASTER" Implementation: This player decouples the visual progress bar
// from the jittery native status updates. It runs a local 60FPS timer for
// 100% smooth movement and only syncs with the native player to correct drift.

const AudioInlinePlayer = memo(({ 
    url, 
    isMe, 
    onLongPress,
    isReady
}: { 
    url: string; 
    isMe: boolean; 
    onLongPress?: (event: any) => void;
    isReady: boolean;
}) => {
    const player = ExpoAudio.useAudioPlayer(url, { updateInterval: 100 });
    const status = ExpoAudio.useAudioPlayerStatus(player);
    const isDark = UnistylesRuntime.themeName === 'dark';
    const hasAutoPlayed = React.useRef(false);
    const isMountedRef = React.useRef(true);
    const trackRef = React.useRef<View>(null);
    const mediaId = React.useRef(generateMediaId('audio')).current;

    // Cache duration for layout stability.
    const durationRef = React.useRef(0);
    if (status.duration > 0) durationRef.current = status.duration;
    const duration = durationRef.current;

    // ── UI MASTER TIMER ──────────────────────────────────────────────────
    // The single source of truth for rendering.
    const uiTime$ = useObservable(0);
    const uiTime = useValue(uiTime$);
    
    // ── Hardening Logic ──
    // We dampen the native status to prevent "flashes" during seeks
    const isPlaying$ = useObservable(false);
    const displayPlaying = useValue(isPlaying$);
    const isLoadedRef = React.useRef(false);

    // Control refs for the playback loop.
    const lastFrameTimeRef = React.useRef<number | null>(null);
    const rafIdRef = React.useRef<number | null>(null);
    const isBlockingSync = React.useRef(false);

    // Sync display states with dampening
    React.useEffect(() => {
        if (!isMountedRef.current) return;
        if (!isBlockingSync.current) {
            isPlaying$.set(status.playing);
            if (status.isLoaded) isLoadedRef.current = true;
        }
    }, [status.playing, status.isLoaded]);

    // ── Playback Loop (60FPS Smoothness) ────────────────────────────────
    const runLoop = useCallback((timestamp: number) => {
        if (lastFrameTimeRef.current !== null) {
            const delta = (timestamp - lastFrameTimeRef.current) / 1000;
            const prev = uiTime$.get();
            const next = prev + delta;
            uiTime$.set(duration > 0 ? Math.min(next, duration) : next);
        }
        lastFrameTimeRef.current = timestamp;
        rafIdRef.current = requestAnimationFrame(runLoop);
    }, [duration]);

    // Start/Stop loop based on playback state
    React.useEffect(() => {
        if (status.playing) {
            lastFrameTimeRef.current = null;
            rafIdRef.current = requestAnimationFrame(runLoop);
        } else {
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
        return () => {
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        };
    }, [status.playing, runLoop]);

    // ── Auto-play ───────────────────────────────────────────────────────
    React.useEffect(() => {
        if (!hasAutoPlayed.current && status.isLoaded) {
            hasAutoPlayed.current = true;
            $uiState.claimMediaFocus(mediaId);
            player.play();
        }
    }, [status.isLoaded, player]);

    // ── Media Focus: auto-pause when another player claims focus ─────────
    useObserve($uiState.activeMediaId, ({ value }) => {
        if (value !== mediaId && isMountedRef.current) {
            // Another player took focus — pause this one
            if (player.playing) {
                player.pause();
            }
            isPlaying$.set(false);
        }
    });

    // ── Natural End ─────────────────────────────────────────────────────
    React.useEffect(() => {
        if (status.isLoaded && duration > 0 && status.currentTime >= duration && !status.playing) {
            uiTime$.set(0);
        }
    }, [status.currentTime, duration, status.playing, status.isLoaded]);

    // ── Drift Correction & Native Sync ──────────────────────────────────
    // We only snap the UI to the native time if they drift by more than 350ms.
    React.useEffect(() => {
        if (!isBlockingSync.current && status.isLoaded) {
            const drift = Math.abs(status.currentTime - uiTime$.get());
            if (drift > 0.35) {
                uiTime$.set(status.currentTime);
            }
        }
    }, [status.currentTime, status.isLoaded]);

    const togglePlay = useCallback(() => {
        if (isPlaying$.get()) {
            player.pause();
            isPlaying$.set(false);
            $uiState.releaseMediaFocus(mediaId);
        } else {
            const currentUiTime = uiTime$.get();
            const dur = durationRef.current;
            const isAtEnd = dur > 0 && (currentUiTime >= dur - 0.1);
            if (isAtEnd) {
                player.seekTo(0);
                uiTime$.set(0);
                lastFrameTimeRef.current = null;
            }
            $uiState.claimMediaFocus(mediaId);
            player.play();
            isPlaying$.set(true);
        }
    }, [player]);

    // ── Instant Seek Handler ───────────────────────────────────────────
    const handleSeek = useCallback((e: any) => {
        const touchX = e.nativeEvent.pageX;
        if (!trackRef.current) return;

        trackRef.current.measure(async (_x, _y, width, _h, pageX) => {
            if (width <= 0) return;
            
            const ratio = Math.max(0, Math.min((touchX - pageX) / width, 1));
            const totalDur = durationRef.current;
            if (totalDur <= 0) return;

            const target = ratio * totalDur;
            
            // 1. Update UI and block external sync
            uiTime$.set(target);
            isBlockingSync.current = true;

            // 2. Command the native player
            try {
                await player.seekTo(target);
                // Hold lock for 500ms to clear stale status events and prevent button flashes
                setTimeout(() => { isBlockingSync.current = false; }, 500);
            } catch {
                isBlockingSync.current = false;
            }
        });
    }, [player]);

    // Warm the native measure ref on first layout
    const onTrackLayout = useCallback(() => {
        trackRef.current?.measure?.(() => {});
    }, []);

    const displayProgress = duration > 0 ? uiTime / duration : 0;

    return (
        <View style={styles.inlineAudioPlayer}>
            <Pressable 
                onPress={togglePlay} 
                onLongPress={onLongPress}
                style={styles.audioPlayButton} 
                disabled={!isLoadedRef.current}
            >
                <IconSymbol
                    name={displayPlaying ? 'pause.fill' : 'play.fill'}
                    size={25}
                    color={isLoadedRef.current ? '#6366f1' : 'rgba(99,102,241,0.35)'}
                />
            </Pressable>
            <View style={styles.audioWaveform}>
                <Pressable
                    ref={trackRef}
                    onPressIn={handleSeek}
                    onLongPress={onLongPress}
                    style={styles.audioProgressTrack}
                    onLayout={onTrackLayout}
                >
                    <View style={[styles.audioProgressInner, isMe && isDark && { backgroundColor: 'black' }]} pointerEvents="none">
                        <View style={[styles.audioProgressFill, { width: `${displayProgress * 100}%` }]} />
                    </View>
                </Pressable>
                <ThemedText style={[styles.audioTimer, isMe ? styles.myTimeText : styles.otherTimeText]}>
                    {duration > 0 ? `${formatDuration(uiTime)} / ${formatDuration(duration)}` : '-- / --'}
                </ThemedText>
            </View>
        </View>
    );
});

// ─── AudioPlaceholder ────────────────────────────────────────────────────────
// Static shell shown before user taps — zero network cost, zero native player init.

const AudioPlaceholder = memo(({ isMe, isReady, isError }: { isMe: boolean, isReady: boolean, isError: boolean }) => {
    const isDark = UnistylesRuntime.themeName === 'dark';
    return (
        <View style={styles.inlineAudioPlayer}>
            <View style={[styles.audioPlayButton, { opacity: 0.85 }]}>
                {isError ? (
                    <IconSymbol name="alert" size={22} color="#ef4444" />
                ) : !isReady ? (
                    <ActivityIndicator size="small" color="#6366f1" />
                ) : (
                    <IconSymbol name="play.fill" size={25} color="#6366f1" />
                )}
            </View>
            <View style={styles.audioWaveform}>
                <View style={styles.audioProgressTrack}>
                    <View style={[styles.audioProgressInner, isMe && isDark && { backgroundColor: 'black' }]}>
                        <View style={[styles.audioProgressFill, { width: '0%' }]} />
                    </View>
                </View>
                <ThemedText style={[styles.audioTimer, isMe ? styles.myTimeText : styles.otherTimeText]} />
            </View>
        </View>
    );
});

export default MessageBubble;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create((theme) => ({
    // Pressable containers: shrink-wrap to bubble content so gap between
    // bubbles is outside the hit area. Sender = right (flex-end), receiver = left (flex-start).
    myBubbleContainer: {
        alignSelf: 'flex-end',
        marginBottom: 28,
        maxWidth: '85%',
        minWidth: 150,
    },
    otherBubbleContainer: {
        alignSelf: 'flex-start',
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
        backgroundColor: theme.colors.card1,
        borderBottomRightRadius: 4,  // swapped
    },
    otherBubble: {
        backgroundColor: theme.colors.bubblePurple,
        borderBottomLeftRadius: 4,   // swapped
    },
    mediaBubble: {
        width: 300,
    },
    fileBubble: {
        width: 300,
    },
    videoBubble: {
        width: 300,
    },
    contentPadding: {
        paddingTop: 4,
        // paddingBottom: 0,
        paddingLeft: 20,
        paddingRight: 30,
    },
    bubbleText: {
        color: theme.colors.bubbleText,
        lineHeight: 20,
    },
    mediaBubbleWrapper: {
        width: 300,
        paddingBottom: 12,
    },
    mediaFrame: {
        width: 300,
        height: 180,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        borderBottomLeftRadius: 2,
        borderBottomRightRadius: 2,
        overflow: 'hidden',
        backgroundColor: 'rgba(0,0,0,0.06)',
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
        color: 'white',

    },
    myUnsentText: {
        color: theme.colors.bubbleText,
    },
    statusContainer: {
        marginLeft: 6,
        marginTop: -10,
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
        paddingLeft: 20,
        paddingRight: 7,
        height: 10,
    },
    timeText: {
        fontSize: 8.5,
        fontStyle: 'italic',
        letterSpacing: 1,
    },
    myTimeText: {
        opacity: 0.8,
        color: theme.colors.bubbleText,
    },
    otherTimeText: {
        color: 'rgba(255,255,255,0.8)',
    },
    selectedBubble: {
        transform: [{ scale: 0.98 }],
        opacity: 0.6,
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
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        // Offset play icon visually to center it
        paddingLeft: 4,
    },
    videoOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.1)',
        opacity: 0,
    },
    fullscreenContainer: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
    },
    fullscreenVideo: {
        width: '100%',
        aspectRatio: 16 / 9,
    },
    videoOverlayVisible: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    videoBottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingBottom: 8,
        paddingTop: 8,
    },
    videoMiniToggle: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    videoProgressTrack: {
        flex: 1,
        height: 24, // Increased hit area
        justifyContent: 'center',
    },
    videoProgressInner: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    videoProgressFill: {
        height: '100%',
        backgroundColor: theme.colors.primary,
    },
    videoTimer: {
        fontSize: 10,
        color: '#FFF',
        marginLeft: 10,
        fontVariant: ['tabular-nums'],
        opacity: 0.9,
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
        padding: 10,
        height: 52, // Increased to comfortably fit progress + timer
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
        height: 44, // Increased to fit both children
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
