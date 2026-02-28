import React, { memo } from 'react';
import { Pressable } from 'react-native';
import { ThemedText, ThemedView } from '@/components/ui/basic';
import { StyleSheet } from 'react-native-unistyles';
import type { ChatEntry } from '@/lib/personalLib';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { $chatListState } from '@/state/personalState/chat/personal.state.chat';
import { $contactsState } from '@/state/personalState/contacts/personal.state.contacts';
import { useUnistyles } from 'react-native-unistyles';
import { PrivacyAvatar } from '@/components/personal/common/PrivacyAvatar';
import { useValue } from '@legendapp/state/react';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { getPreviewText } from '@/utils/personalUtils/util.chatPreview';

import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';

type ChatListItemProps = {
    chatId: string;
    onPress: (chat: ChatEntry) => void;
};

function formatTime(dateStr: string | null): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const oneDay = 86_400_000;

    if (diff < oneDay && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 7 * oneDay) {
        return d.toLocaleDateString([], { weekday: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const ChatListItem = memo(({ chatId, onPress }: ChatListItemProps) => {
    const { theme } = useUnistyles();
    const { handlePressIn } = pressableAnimation();

    // Fine-grained observation: observe specific fields to ensure updates trigger re-renders
    const chat = useValue(() => $chatListState.chatsById[chatId]?.get());
    const unreadCount = useValue(() => $chatListState.chatsById[chatId]?.unread_count.get() ?? 0);
    const lastReadAt = useValue(() => $chatListState.chatsById[chatId]?.other_user_last_read_at.get() ?? '');
    const lastDeliveredAt = useValue(() => $chatListState.chatsById[chatId]?.other_user_last_delivered_at.get() ?? '');
    const lastMessageStatus = useValue(() => $chatListState.chatsById[chatId]?.last_message_status.get() ?? 'sent');
    const contact = useValue(() => $contactsState.contactsById[chat?.other_user_id]?.get());

    if (!chat) return null;

    const displayName = (contact?.nickname ?? chat.other_user_name) || chat.other_user_username || 'User';

    // Construct dummy MessageEntry to reuse getPreviewText helper
    const preview = getPreviewText({
        content: chat.last_message_content,
        file_name: chat.last_message_content, // Reusing field for file identification if needed
        message_type: chat.last_message_type,
        // @ts-ignore
        is_unsent: chat.last_message_is_unsent,
    } as any);

    const time = formatTime(chat.last_message_created_at);
    const hasUnread = unreadCount > 0;

    return (
        <Pressable
            onPress={() => onPress(chat)}
            onPressIn={handlePressIn}
            style={({ pressed }) => [
                styles.container,
                pressed && { opacity: 0.1 },
            ]}
        >
            {/* Avatar */}
            <PrivacyAvatar
                uri={chat.avatar_url}
                name={displayName}
                size={50}
                colorKey={chat.other_user_id}
            />

            {/* Content */}
            <ThemedView style={styles.content}>
                <ThemedView style={styles.topRow}>
                    <ThemedText
                        type='semibold'
                        numberOfLines={1}
                        style={styles.name}
                    >
                        {displayName}
                    </ThemedText>
                    <ThemedText style={styles.time}>
                        {time}
                    </ThemedText>
                </ThemedView>

                <ThemedView style={styles.bottomRow}>
                    <ThemedView style={styles.previewContainer}>
                        {(() => {
                            const isMe = chat.last_message_is_from_me;
                            if (!isMe || !chat.last_message_content) return null;

                            // If unsent, we don't want any icon (per user request)
                            if (chat.last_message_is_unsent) {
                                return null;
                            }

                            let status = lastMessageStatus;

                            const parseDate = (d: string | null | undefined) => {
                                if (!d) return NaN;
                                try {
                                    return new Date(String(d).replace(' ', 'T')).getTime();
                                } catch {
                                    return NaN;
                                }
                            };

                            // SOURCE OF TRUTH: Compare last message time against chat-level persistent delivery/read timestamps
                            if (chat.last_message_created_at) {
                                const msgTime = parseDate(chat.last_message_created_at);
                                const readTime = parseDate(lastReadAt);

                                // GRACE PERIOD: 10s for clock drift
                                if (!isNaN(readTime) && msgTime <= readTime + 10000) {
                                    status = 'read';
                                } else {
                                    const deliveredTime = parseDate(lastDeliveredAt);
                                    if (!isNaN(deliveredTime) && msgTime <= deliveredTime + 10000) {
                                        status = 'delivered';
                                    }
                                }
                            }

                            if (status === 'pending') {
                                return <IconSymbol name="clock" size={14} color="#999" style={styles.statusIcon} />;
                            }

                            if (status === 'read') {
                                return <MaterialCommunityIcon name="checkmark.all" size={15} color={theme.colors.primary} style={styles.statusIcon} />;
                            }

                            if (status === 'delivered') {
                                return <MaterialCommunityIcon name="checkmark.all" size={15} color="#999" style={styles.statusIcon} />;
                            }

                            if (status === 'sent') {
                                return <MaterialCommunityIcon name="checkmark" size={15} color="#999" style={styles.statusIcon} />;
                            }

                            return null;
                        })()}
                        <ThemedText
                            numberOfLines={1}
                            style={[
                                styles.preview,
                                hasUnread && styles.previewUnread,
                            ]}
                        >
                            {preview}
                        </ThemedText>
                    </ThemedView>
                    {hasUnread && (
                        <ThemedView style={styles.badge}>
                            <ThemedText style={styles.badgeText}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </ThemedText>
                        </ThemedView>
                    )}
                </ThemedView>
            </ThemedView>
        </Pressable>
    );
});

export default ChatListItem;

const styles = StyleSheet.create((theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 12,
        gap: 12,
    },
    pressed: {
        opacity: 0.6,
    },
    content: {
        flex: 1,
        gap: 2,
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    name: {
        flex: 1,
        fontSize: 15,
        marginRight: 8,
    },
    time: {
        fontSize: 12,
        color: theme.colors.icon,
    },
    bottomRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    previewContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 8,
    },
    statusIcon: {
        marginRight: 4,
    },
    preview: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.icon,
    },
    previewUnread: {
        fontWeight: '600',
        color: theme.colors.text,
    },
    badge: {
        backgroundColor: theme.colors.primary,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
    },
    badgeText: {
        color: theme.colors.reverseText,
        fontSize: 11,
        fontWeight: 'bold',
    },
}));
