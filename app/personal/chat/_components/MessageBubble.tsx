import React, { memo } from 'react';
import { ThemedText, ThemedView } from '@/components/ui/basic';
import { StyleSheet } from 'react-native-unistyles';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';

type MessageBubbleProps = {
    text: string;
    type: 'me' | 'other';
    messageType?: string;
    status?: 'pending' | 'sent' | 'read';
};

const MessageBubble = memo(
    ({ text, type, messageType = 'text', status }: MessageBubbleProps) => {
        const isMe = type === 'me';
        const isText = messageType === 'text';

        const renderStatusIcon = () => {
            if (!isMe || !status) return null;

            let iconName: any = 'checkmark';
            let color = '#FFD700'; // Sent (Yellow) Default

            if (status === 'pending') {
                iconName = 'clock';
                color = 'rgba(255,255,255,0.5)';
            } else if (status === 'read') {
                color = '#4CAF50'; // Read (Green)
            }

            return (
                <ThemedView style={styles.statusContainer}>
                    <IconSymbol name={iconName} size={12} color={color} />
                </ThemedView>
            );
        };

        const renderTypeIcon = () => {
            if (isText) return null;
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

        return (
            <ThemedView
                accessibilityRole="text"
                accessibilityLabel={`${isMe ? 'You' : 'Other'}: ${isText ? text : messageType}`}
                style={[
                    styles.bubble,
                    isMe && styles.myBubble
                ]}
            >
                {renderTypeIcon()}
                <ThemedText style={isMe ? styles.myText : undefined}>{text}</ThemedText>
                {renderStatusIcon()}
            </ThemedView>
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
        padding: 10,
        marginBottom: 8,
        borderRadius: 14,
        backgroundColor: theme.colors.surface,
        maxWidth: '75%',
        alignSelf: 'flex-start',
    },
    myBubble: {
        alignSelf: 'flex-end',
        backgroundColor: theme.colors.primary,
    },
    myText: {
        color: theme.colors.reverseText,
    },
    typeLabel: {
        fontSize: 12,
        opacity: 0.7,
        marginBottom: 4,
        fontWeight: '600',
    },
    statusContainer: {
        alignSelf: 'flex-end',
        marginTop: 2,
        backgroundColor: 'transparent',
    },
}));
