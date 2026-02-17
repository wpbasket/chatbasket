import React, { memo } from 'react';
import { Pressable } from 'react-native';
import { ThemedText, ThemedView } from '@/components/ui/basic';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';

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
};

const MessageBubble = memo(
    ({ text, type, messageType = 'text', status, delivered, createdAt, onLongPress, onContextMenu, onPress, isSelected }: MessageBubbleProps) => {
        const { theme } = useUnistyles();
        const isMe = type === 'me';
        const isText = messageType === 'text';

        const renderStatusIcon = () => {
            if (!isMe || messageType === 'unsent') return null;

            if (status === 'pending') {
                return (
                    <ThemedView style={styles.statusContainer}>
                        <IconSymbol name="clock" size={16} color="rgba(255,255,255,0.7)" />
                    </ThemedView>
                );
            } else if (status === 'read') {
                return (
                    <ThemedView style={styles.statusContainer}>
                        <MaterialCommunityIcon name="checkmark.all" size={18} color={theme.colors.primary} />
                    </ThemedView>
                );
            } else if (delivered || status === 'sent') {
                return (
                    <ThemedView style={styles.statusContainer}>
                        <IconSymbol name="checkmark" size={16} color="#FFD700" />
                    </ThemedView>
                );
            }

            return null;
        };

        const renderTypeIcon = () => {
            if (isText) return null;

            // Special handling for unsent messages
            if (messageType === 'unsent') {
                return (
                    <ThemedText style={[styles.unsentText, isMe && styles.myUnsentText]}>
                        Message unsent
                    </ThemedText>
                );
            }

            let icon = '📄';
            let label = messageType.charAt(0).toUpperCase() + messageType.slice(1);

            if (messageType === 'image') icon = '🖼️';
            if (messageType === 'video') icon = '🎥';
            if (messageType === 'audio') icon = '🎵';

            return (
                <ThemedText style={styles.typeLabel}>
                    {icon} {label}
                </ThemedText>
            );
        };

        const formatTime = (dateStr: string) => {
            try {
                const date = new Date(dateStr);
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } catch {
                return '';
            }
        };

        return (
            <Pressable
                onPress={onPress}
                onLongPress={onLongPress}
                // @ts-ignore - onContextMenu is supported on web
                onContextMenu={onContextMenu}
                delayLongPress={300}
                style={({ pressed }) => [
                    { opacity: pressed ? 0.7 : 1 },
                    isMe ? styles.myBubbleContainer : styles.otherBubbleContainer
                ]}
            >
                <ThemedView
                    accessibilityRole="text"
                    accessibilityLabel={`${isMe ? 'You' : 'Other'}: ${isText ? text : messageType}`}
                    style={[
                        styles.bubble,
                        isMe && styles.myBubble,
                        isSelected && styles.selectedBubble
                    ]}
                >
                    {renderTypeIcon()}
                    {messageType !== 'unsent' && (
                        <ThemedText style={isMe ? styles.myText : undefined}>{text}</ThemedText>
                    )}

                    <ThemedView style={styles.footer}>
                        <ThemedText style={[styles.timeText, isMe && styles.myTimeText]}>
                            {formatTime(createdAt)}
                        </ThemedText>
                        {renderStatusIcon()}
                    </ThemedView>

                    {isSelected && (
                        <ThemedView style={styles.selectionOverlay}>
                            <IconSymbol name="checkmark.circle" size={20} color={theme.colors.primary} />
                        </ThemedView>
                    )}
                </ThemedView>
            </Pressable>
        );
    },
    (prev, next) =>
        prev.text === next.text &&
        prev.type === next.type &&
        prev.status === next.status
);

export default MessageBubble;

const styles = StyleSheet.create((theme) => ({
    bubble: {
        paddingVertical: 6,
        paddingHorizontal: 14,
        marginBottom: 8,
        borderRadius: 20,
        borderBottomRightRadius: 4,
        backgroundColor: theme.colors.card,
        maxWidth: '80%',
    },
    myBubbleContainer: {
        alignSelf: 'flex-start',
        maxWidth: '80%',
    },
    otherBubbleContainer: {
        alignSelf: 'flex-end',
        maxWidth: '80%',
    },
    myBubble: {
        alignSelf: 'stretch',
        backgroundColor: theme.colors.bubblePurple,
        borderBottomLeftRadius: 4,
        borderBottomRightRadius: 20,
    },
    myText: {
        color: theme.colors.white,
    },
    typeLabel: {
        fontSize: 12,
        opacity: 0.7,
        marginBottom: 4,
        fontWeight: '600',
    },
    unsentText: {
        fontSize: 14,
        fontStyle: 'italic',
        opacity: 0.6,
        color: theme.colors.textSecondary,
    },
    myUnsentText: {
        color: 'rgba(255, 255, 255, 0.9)',
    },
    statusContainer: {
        marginLeft: 4,
        backgroundColor: 'transparent',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        alignSelf: 'flex-end',
        marginTop: 2,
        backgroundColor: 'transparent',
    },
    timeText: {
        fontSize: 10,
        opacity: 0.6,
        color: theme.colors.textSecondary,
    },
    myTimeText: {
        color: 'rgba(255,255,255,0.7)',
    },
    selectedBubble: {
        borderWidth: 2,
        borderColor: theme.colors.primary,
    },
    selectionOverlay: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
}));
