import React, { useCallback, useEffect } from 'react';
import { FlatList, Alert, Platform } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
    ThemedText,
    ThemedView,
    Header,
    router,
    Stack
} from '@/components/ui/basic';
import { StyleSheet } from 'react-native-unistyles';
import MessageBubble from './_components/MessageBubble';
import ChatInputBar from './_components/ChatInputBar';
import { BulkActionBar } from './_components/BulkActionBar';
import { $chatMessagesState, $chatListState } from '@/state/personalState/chat/personal.state.chat';
import { authState } from '@/state/auth/state.auth';
import { $uiState } from '@/state/ui/state.ui';
import { PersonalChatApi } from '@/lib/personalLib/chatApi/personal.api.chat';
import { getChatErrorMessage } from '@/utils/personalUtils/util.chatErrors';
import { showAlert, showControllersModal, showConfirmDialog } from '@/utils/commonUtils/util.modal';
import type { MessageEntry, ChatEntry } from '@/lib/personalLib';
import { PrivacyAvatar } from '@/components/personal/common/PrivacyAvatar';
import { batch } from '@legendapp/state';
import { useValue, Memo } from '@legendapp/state/react';

const PersonalChatScreen = React.memo(() => {

    // -------- Route Guard Lifecycle --------
    useFocusEffect(
        useCallback(() => {
            // Guard: If chat is entered without proper unlocking (e.g. deep link), redirect out
            if (!$chatMessagesState.isChatOpen.peek()) {
                // Use replace to avoid adding history entry if invalid
                router.replace('/personal/home');
                return;
            }

            return () => {
                // Runs when screen loses focus (e.g. back navigation or push to another screen)
                $chatMessagesState.isChatOpen.set(false);
            };
        }, [])
    );


    const { chat_id, recipient_id, recipient_name } = useLocalSearchParams<{
        chat_id: string;
        recipient_id: string;
        recipient_name: string;
    }>();

    const displayName = recipient_name || 'Chat';

    return (
        <ThemedView style={{ flex: 1 }}>
            <Stack.Screen
                options={{
                    header: () => (
                        <ThemedView style={styles.headerContainer}>
                            <Header
                                onBackPress={() => router.back()}
                                centerSection={
                                    <ThemedText type="subtitle" numberOfLines={1}>
                                        {displayName}
                                    </ThemedText>
                                }
                                rightSection={
                                    <Memo>
                                        {() => (
                                            <PrivacyAvatar
                                                uri={$chatListState.chatsById[chat_id]?.avatar_url.get()}
                                                name={displayName}
                                                size={50}
                                                colorKey={recipient_id}
                                            />
                                        )}
                                    </Memo>
                                }
                            />
                        </ThemedView>
                    ),
                }}
            />

            <ChatContentContainer
                chat_id={chat_id}
                recipient_id={recipient_id}
                recipient_name={recipient_name}
                displayName={displayName}
            />

            <Memo>
                {() => {
                    const error = $chatMessagesState.chats[chat_id]?.error.get();
                    if (error) {
                        setTimeout(() => {
                            showAlert(error);
                            $chatMessagesState.setError(chat_id, null);
                        }, 0);
                    }
                    return null;
                }}
            </Memo>
        </ThemedView>
    );
}); // Note: No props passed here, so we rely on React.memo() with zero props being naturally stable.
// However, we can also add a comparison if we had props.

export default PersonalChatScreen;

// -------- Sub-components to isolate re-renders --------

const MessageItemWrapper = React.memo(({ messageId, chatId, index }: { messageId: string, chatId: string, index: number }) => {
    const message = useValue(() => $chatMessagesState.chats[chatId]?.messagesById[messageId]?.get());
    const chatMetadata = useValue(() => $chatListState.chatsById[chatId]?.get());
    const messageIds = useValue(() => $chatMessagesState.chats[chatId]?.messageIds.get() || []);

    if (!message) return null;

    let status = message.status;
    if (message.is_from_me && chatMetadata?.other_user_last_read_at) {
        const msgTime = new Date(message.created_at).getTime();
        const readTime = new Date(chatMetadata.other_user_last_read_at).getTime();
        if (msgTime <= readTime) {
            status = 'read';
        }
    }

    // Date Header Logic: 
    // Since list is inverted, index N is older than index N-1.
    // We show a header if this message is the first of its date (compared to message at index + 1).
    const renderDateHeader = () => {
        const prevMessageId = messageIds[index + 1];
        const currentMsgDate = new Date(message.created_at).toDateString();

        // If it's the oldest message (last in array), or date changed from older message
        let showHeader = false;
        if (!prevMessageId) {
            showHeader = true;
        } else {
            const prevMessage = $chatMessagesState.chats[chatId]?.messagesById[prevMessageId]?.peek();
            if (prevMessage) {
                const prevMsgDate = new Date(prevMessage.created_at).toDateString();
                if (currentMsgDate !== prevMsgDate) {
                    showHeader = true;
                }
            }
        }

        if (!showHeader) return null;

        const formatDateHeader = (dateStr: string) => {
            const date = new Date(dateStr);
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);

            if (date.toDateString() === today.toDateString()) return 'Today';
            if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

            return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
        };

        return (
            <ThemedView style={styles.dateHeader}>
                <ThemedText style={styles.dateHeaderText}>{formatDateHeader(message.created_at)}</ThemedText>
            </ThemedView>
        );
    };

    const handleLongPress = useCallback((event: import('react-native').GestureResponderEvent) => {
        // Prevent default browser context menu on web
        if (event && 'preventDefault' in event) {
            (event as any).preventDefault();
        }

        const position = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY
        };

        const controllers: any[] = [
            {
                id: 'select',
                label: 'Select',
                onPress: () => {
                    $chatMessagesState.toggleSelectMode(chatId, true);
                    $chatMessagesState.toggleMessageSelection(chatId, messageId);
                }
            },
            {
                id: 'delete',
                label: 'Delete for Me',
                onPress: () => {
                    console.log('[UI] Single Delete initiated for:', messageId);
                    $chatMessagesState.removeMessages(chatId, [messageId]);
                    PersonalChatApi.deleteMessageForMe({
                        message_ids: [messageId]
                    }).then(() => console.log('[UI] Single Delete API success'))
                        .catch(err => console.error('[UI] Delete failed', err));
                }
            }
        ];

        if (message.is_from_me && status !== 'read' && message.message_type !== 'unsent') {
            controllers.unshift({
                id: 'unsend',
                label: 'Unsend',
                onPress: () => {
                    console.log('[UI] Single Unsend initiated for:', messageId);
                    $chatMessagesState.unsendMessages(chatId, [messageId]);
                    PersonalChatApi.unsendMessage({
                        chat_id: chatId,
                        message_ids: [messageId]
                    }).then(() => console.log('[UI] Single Unsend API success'))
                        .catch(err => {
                            console.error('[UI] Unsend failed', err);
                        });
                }
            });
        }

        showControllersModal(controllers, {
            title: 'Message Options',
            position,
            showConfirmButton: false,
            showCancelButton: true,
            closeOnControllerPress: true,
        });
    }, [chatId, messageId, message.is_from_me, status]);

    const handlePress = useCallback(() => {
        const isSelectMode = $chatMessagesState.chats[chatId]?.isSelectMode.peek();
        if (isSelectMode) {
            $chatMessagesState.toggleMessageSelection(chatId, messageId);
        }
    }, [chatId, messageId]);

    const isSelected = useValue(() => {
        const selectedIds = $chatMessagesState.chats[chatId]?.selectedMessageIds.get() || [];
        return selectedIds.includes(messageId);
    });

    return (
        <ThemedView style={{ backgroundColor: 'transparent' }}>
            {renderDateHeader()}
            <MessageBubble
                text={message.content}
                type={message.is_from_me ? 'me' : 'other'}
                messageType={message.message_type}
                status={status}
                delivered={message.delivered_to_recipient}
                createdAt={message.created_at}
                onLongPress={handleLongPress}
                onContextMenu={handleLongPress}
                onPress={handlePress}
                isSelected={isSelected}
            />
        </ThemedView>
    );
});

const ChatContentContainer = React.memo(({
    chat_id,
    recipient_id,
    recipient_name,
    displayName
}: any) => {
    // -------- Initialize chat on focus --------
    useFocusEffect(
        useCallback(() => {
            if (!chat_id) return;

            batch(() => {
                $chatMessagesState.setActiveChatId(chat_id);
                const currentChat = $chatMessagesState.chats[chat_id];
                currentChat.recipientId.set(recipient_id ?? null);

                currentChat.recipientId.set(recipient_id ?? null);

                // 2. To avoid redundant '/ack' calls from ackIncomingMessages,
                // we proactively mark all known messages in this chat as delivered (incoming)
                // or synced-to-primary (outgoing) LOCALLY.
                const msgs = currentChat.messages.peek();
                if (msgs.length > 0) {
                    msgs.forEach(m => {
                        if (!m.is_from_me && !m.delivered_to_recipient) {
                            currentChat.messagesById[m.message_id].delivered_to_recipient.set(true);
                        }
                        // [TESTING] Removed isPrimary check to allow secondary devices to see sync status update locally
                        if (m.is_from_me && !m.synced_to_sender_primary) { // && authState.isPrimary.peek()) {
                            currentChat.messagesById[m.message_id].synced_to_sender_primary.set(true);
                        }
                    });
                }

                // Always fetch latest messages on focus to ensure we don't ACK messages we haven't seen yet.
                // setMessages uses a smart merge, so this is safe and preserves local state.
                loadMessages(chat_id).then(() => {
                    // Mark as read locally and on backend ONLY after we have the latest data
                    void PersonalChatApi.markChatRead({ chat_id }).catch(() => { });
                    $chatListState.markChatRead(chat_id);
                });
            });

            return () => {
                // Optional: cleanup if needed when losing focus
                // $chatMessagesState.activeChatId.set(null); 
                // Note: Clearing activeChatId here might cause flicker on simple background/foreground.
                // kept strictly for unmount or specific logic if needed.
            };
        }, [chat_id, recipient_id])
    );

    // Cleanup on actual unmount
    useEffect(() => {
        return () => {
            $chatMessagesState.activeChatId.set(null);
        };
    }, []);


    const loadMessages = async (chatId: string) => {
        try {
            batch(() => {
                $chatMessagesState.setLoading(chatId, true);
                $chatMessagesState.setError(chatId, null);
            });
            const response = await PersonalChatApi.getMessages({
                chat_id: chatId,
                limit: 50,
                offset: 0,
            });

            // Update chat metadata (Read Receipts) from response to avoid extra API call
            if (response.other_user_last_read_at) {
                batch(() => {
                    const chat$ = $chatListState.chatsById[chatId];
                    const chat = chat$.peek();
                    if (chat) {
                        chat$.other_user_last_read_at.set(response.other_user_last_read_at);

                        // Also update the preview status if the last message is now read
                        if (chat.last_message_created_at && chat.last_message_is_from_me) {
                            const lastMsgTime = new Date(chat.last_message_created_at).getTime();
                            const readTime = new Date(response.other_user_last_read_at).getTime();
                            if (lastMsgTime <= readTime) {
                                chat$.last_message_status.set('read');
                            }
                        }
                    }
                });
            }

            const messagesWithStatus = (response.messages ?? []).map(m => {
                // Delivered does NOT mean Read. It means Sent (Yellow).
                return {
                    ...m,
                    status: 'sent'
                } as MessageEntry;
            });

            batch(() => {
                $chatMessagesState.setMessages(chatId, messagesWithStatus);
                if (messagesWithStatus.length < 50) {
                    $chatMessagesState.chats[chatId].hasMore.set(false);
                }

                // Sync Chat List Preview (Last Message) with latest fetched message
                if (messagesWithStatus.length > 0) {
                    // Sort to find the absolute latest message in this batch
                    const sorted = [...messagesWithStatus].sort((a, b) =>
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    );
                    const latestMsg = sorted[0];
                    const chat$ = $chatListState.chatsById[chatId];
                    const currentChat = chat$.peek();

                    // Only update if this message is newer than what we currently have in preview
                    if (currentChat && (!currentChat.last_message_created_at || new Date(latestMsg.created_at).getTime() > new Date(currentChat.last_message_created_at).getTime())) {
                        chat$.assign({
                            last_message_content: latestMsg.content,
                            last_message_created_at: latestMsg.created_at,
                            last_message_status: latestMsg.status ?? 'sent',
                            last_message_is_from_me: latestMsg.is_from_me,
                            last_message_type: latestMsg.message_type,
                            last_message_id: latestMsg.message_id
                        });
                    }
                }
            });
        } catch (err: unknown) {
            $chatMessagesState.setError(chatId, getChatErrorMessage(err, 'Could not load messages.', { name: recipient_name }));
        } finally {
            $chatMessagesState.setLoading(chatId, false);
        }
    };

    const sendMessage = useCallback(async () => {
        const currentChat = $chatMessagesState.chats[chat_id];
        const chatData = currentChat.peek();
        const trimmed = chatData.inputText.trim();
        const recipId = chatData.recipientId;
        if (!trimmed || !recipId || !chat_id) return;

        const tempId = `temp-${Date.now()}`;
        const now = new Date().toISOString();
        const optimisticMsg: MessageEntry = {
            message_id: tempId,
            chat_id: chat_id as string,
            is_from_me: true,
            recipient_id: recipId,
            content: trimmed,
            message_type: 'text',
            created_at: now,
            expires_at: now,
            status: 'pending',
            delivered_to_recipient: false, // Added Phase 8b/9
            synced_to_sender_primary: true, // Optimistically true as it's created locally
        };

        const existingChat = $chatListState.chatsById[chat_id]?.peek();
        const optimisticChat: ChatEntry = {
            ...existingChat,
            chat_id,
            other_user_id: recipId,
            other_user_name: recipient_name || existingChat?.other_user_name || 'User',
            last_message_content: trimmed,
            last_message_created_at: now,
            last_message_status: 'pending',
            last_message_is_from_me: true,
            unread_count: existingChat?.unread_count || 0,
            other_user_last_read_at: existingChat?.other_user_last_read_at || new Date(0).toISOString(), // Added Phase 9
            updated_at: now,
        } as ChatEntry;

        batch(() => {
            $chatMessagesState.chats[chat_id].inputText.set('');
            $chatMessagesState.addMessage(chat_id, optimisticMsg);
            $chatListState.upsertChat(optimisticChat);
        });

        try {
            const response = await PersonalChatApi.sendMessage({
                recipient_id: recipId,
                content: trimmed,
                message_type: 'text',
            });

            batch(() => {
                $chatMessagesState.removeMessage(chat_id, tempId);
                $chatMessagesState.addMessage(chat_id, {
                    ...response,
                    status: 'sent'
                });

                $chatListState.upsertChat({
                    ...optimisticChat,
                    last_message_content: response.content,
                    last_message_created_at: response.created_at,
                    last_message_status: 'sent',
                    last_message_is_from_me: response.is_from_me,
                    created_at: optimisticChat?.created_at || response.created_at,
                });
            });

        } catch (err: unknown) {
            batch(() => {
                $chatMessagesState.removeMessage(chat_id, tempId);
                $chatMessagesState.chats[chat_id].inputText.set(trimmed);
                $chatMessagesState.setError(chat_id, getChatErrorMessage(err, 'Message could not be sent.', { name: recipient_name }));
            });
        }
    }, [chat_id, recipient_name]);

    const loadMore = useCallback(async () => {
        if (!chat_id) return;
        const currentChat = $chatMessagesState.chats[chat_id];
        const chatData = currentChat.peek();
        const hasMore = chatData.hasMore;
        const isLoading = chatData.loading;
        if (!hasMore || isLoading) return;

        try {
            currentChat.loading.set(true);
            const offset = currentChat.offset.peek();
            const response = await PersonalChatApi.getMessages({
                chat_id,
                limit: 50,
                offset,
            });

            batch(() => {
                const messages = response.messages ?? [];
                if (messages.length < 50) {
                    currentChat.hasMore.set(false);
                }
                const messagesWithStatus = messages.map(m => {
                    // Delivered does NOT mean Read. It means Sent (Yellow).
                    // Read status is calculated dynamically in MessageItemWrapper via timestamps.
                    return {
                        ...m,
                        status: 'sent'
                    } as MessageEntry;
                });
                $chatMessagesState.prependMessages(chat_id, messagesWithStatus);
            });
        } catch {
            // Silently fail for pagination
        } finally {
            currentChat.loading.set(false);
        }
    }, [chat_id]);

    const renderItem = useCallback(
        ({ item: messageId, index }: { item: string, index: number }) => (
            <MessageItemWrapper
                messageId={messageId}
                chatId={chat_id}
                index={index}
            />
        ),
        [chat_id]
    );

    const keyExtractor = useCallback((id: string) => id, []);

    const handleBulkUnsend = useCallback(async () => {
        const selectedIds = $chatMessagesState.chats[chat_id].selectedMessageIds.peek();
        if (selectedIds.length === 0) return;

        console.log('[UI] Requesting Bulk Unsend confirmation');
        const confirmed = await showConfirmDialog(
            `Are you sure you want to unsend ${selectedIds.length} messages?`,
            {
                confirmText: 'Unsend All',
                cancelText: 'Cancel',
                confirmVariant: 'destructive'
            }
        );

        if (confirmed) {
            console.log('[UI] Bulk Unsend confirmed by user');
            console.log('[UI] Bulk Unsend initiated for:', selectedIds);
            $chatMessagesState.unsendMessages(chat_id, selectedIds);
            $chatMessagesState.toggleSelectMode(chat_id, false);
            try {
                await PersonalChatApi.unsendMessage({
                    chat_id: chat_id,
                    message_ids: selectedIds
                });
                console.log('[UI] Bulk Unsend API success');
            } catch (err) {
                console.error('[UI] Bulk Unsend failed', err);
            }
        } else {
            console.log('[UI] Bulk Unsend cancelled by user');
        }
    }, [chat_id]);

    const handleBulkDelete = useCallback(async () => {
        const selectedIds = $chatMessagesState.chats[chat_id].selectedMessageIds.peek();
        if (selectedIds.length === 0) return;

        console.log('[UI] Bulk Delete initiated for:', selectedIds);
        $chatMessagesState.removeMessages(chat_id, selectedIds);
        $chatMessagesState.toggleSelectMode(chat_id, false);
        try {
            await PersonalChatApi.deleteMessageForMe({
                message_ids: selectedIds
            });
            console.log('[UI] Bulk Delete API success');
        } catch (err) {
            console.error('[UI] Bulk Delete failed', err);
        }
    }, [chat_id]);

    const handleCancelSelection = useCallback(() => {
        $chatMessagesState.toggleSelectMode(chat_id, false);
    }, [chat_id]);

    return (
        <Memo>
            {() => (
                <ThemedView
                    style={[
                        styles.content,
                        { transform: [{ translateY: -$uiState.keyboardHeight.get() }] }
                    ]}
                >
                    <Memo>
                        {() => {
                            const messageIds = $chatMessagesState.chats[chat_id]?.messageIds.get() || [];
                            const loading = $chatMessagesState.chats[chat_id]?.loading.get() || false;

                            return (
                                <FlatList
                                    inverted
                                    data={messageIds}
                                    keyExtractor={keyExtractor}
                                    renderItem={renderItem}
                                    initialNumToRender={15}
                                    windowSize={7}
                                    maxToRenderPerBatch={10}
                                    style={styles.list}
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={styles.listContent}
                                    keyboardShouldPersistTaps="handled"
                                    keyboardDismissMode="interactive"
                                    onEndReached={loadMore}
                                    onEndReachedThreshold={0.3}
                                    ListEmptyComponent={
                                        !loading ? (
                                            <ThemedView style={styles.emptyState}>
                                                <ThemedText type="subtitle">No messages yet</ThemedText>
                                                <ThemedText>Send a message to start the conversation</ThemedText>
                                            </ThemedView>
                                        ) : null
                                    }
                                />
                            );
                        }}
                    </Memo>

                    <Memo>
                        {() => {
                            const isSelectMode = $chatMessagesState.chats[chat_id]?.isSelectMode.get();
                            const selectedCount = $chatMessagesState.chats[chat_id]?.selectedMessageIds.get()?.length || 0;

                            // Check if ALL selected messages are from me (to show Unsend)
                            const messagesById = $chatMessagesState.chats[chat_id]?.messagesById.peek() || {};
                            const selectedIds = $chatMessagesState.chats[chat_id]?.selectedMessageIds.peek() || [];
                            const allFromMe = selectedIds.every(id => messagesById[id]?.is_from_me);

                            if (isSelectMode) {
                                return (
                                    <BulkActionBar
                                        selectedCount={selectedCount}
                                        onUnsend={handleBulkUnsend}
                                        onDelete={handleBulkDelete}
                                        onCancel={handleCancelSelection}
                                        showUnsend={allFromMe && selectedCount > 0}
                                    />
                                );
                            }

                            return (
                                <ChatInputBar
                                    chatId={chat_id}
                                    onSend={sendMessage}
                                    sendingObs={$chatMessagesState.chats[chat_id]?.sending}
                                />
                            );
                        }}
                    </Memo>
                </ThemedView>
            )}
        </Memo>
    );
}, (prev, next) => {
    return (
        prev.chat_id === next.chat_id &&
        prev.recipient_id === next.recipient_id &&
        prev.recipient_name === next.recipient_name &&
        prev.displayName === next.displayName
    );
});

const styles = StyleSheet.create((theme, rt) => ({
    headerContainer: {
        paddingTop: rt.insets.top,
    },
    content: {
        flex: 1,
    },
    list: {
        flex: 1,
    },
    listContent: {
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        gap: 8,
    },
    dateHeader: {
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 16,
        backgroundColor: 'transparent',
    },
    dateHeaderText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        backgroundColor: 'transparent',
    },
}));
