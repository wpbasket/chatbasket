import React, { useCallback, useEffect } from 'react';
import { FlatList } from 'react-native';
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
import { $chatMessagesState, $chatListState } from '@/state/personalState/chat/personal.state.chat';
import { $uiState } from '@/state/ui/state.ui';
import { PersonalChatApi } from '@/lib/personalLib/chatApi/personal.api.chat';
import { getChatErrorMessage } from '@/utils/personalUtils/util.chatErrors';
import { showAlert } from '@/utils/commonUtils/util.modal';
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

const MessageItemWrapper = React.memo(({ messageId, chatId }: { messageId: string, chatId: string }) => {
    const message = useValue(() => $chatMessagesState.chats[chatId]?.messagesById[messageId]?.get());

    // We need to know when the OTHER user last read the chat to mark specific messages as Read.
    // This data is in $chatListState.chatsById[chatId]
    const chatMetadata = useValue(() => $chatListState.chatsById[chatId]?.get());

    if (!message) return null;

    let status = message.status;

    // Logic: If message is older than other user's last read time, it IS read.
    // This allows granular "Green Ticks" even if we don't store "read" on every message row.
    if (message.is_from_me && chatMetadata?.other_user_last_read_at) {
        const msgTime = new Date(message.created_at).getTime();
        const readTime = new Date(chatMetadata.other_user_last_read_at).getTime();
        if (msgTime <= readTime) {
            status = 'read';
        }
    }

    return (
        <MessageBubble
            text={message.content}
            type={message.is_from_me ? 'me' : 'other'}
            messageType={message.message_type}
            status={status}
            delivered={message.delivered_to_recipient}
        />
    );
});

const ChatContentContainer = React.memo(({
    chat_id,
    recipient_id,
    recipient_name,
    displayName
}: any) => {
    // -------- Initialize chat on mount --------
    useEffect(() => {
        if (!chat_id) return;

        batch(() => {
            $chatMessagesState.setActiveChatId(chat_id);
            const currentChat = $chatMessagesState.chats[chat_id];
            currentChat.recipientId.set(recipient_id ?? null);

            if (currentChat.messages.peek().length === 0) {
                void loadMessages(chat_id);
            }

            void PersonalChatApi.markChatRead({ chat_id }).catch(() => { });
            $chatListState.markChatRead(chat_id);
        });

        return () => {
            $chatMessagesState.activeChatId.set(null);
        };
    }, [chat_id, recipient_id]);


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
        ({ item: messageId }: { item: string }) => (
            <MessageItemWrapper
                messageId={messageId}
                chatId={chat_id}
            />
        ),
        [chat_id]
    );

    const keyExtractor = useCallback((id: string) => id, []);

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

                    <ChatInputBar
                        chatId={chat_id}
                        onSend={sendMessage}
                        sendingObs={$chatMessagesState.chats[chat_id]?.sending}
                    />
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
}));
