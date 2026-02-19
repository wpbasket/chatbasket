import React, { useCallback, useEffect } from 'react';
import { FlatList, Alert, Platform, Linking } from 'react-native';
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
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { buildFormDataFromAsset } from '@/utils/commonUtils/util.upload';

const PersonalChatScreen = React.memo(() => {

    useFocusEffect(
        useCallback(() => {
            if (!$chatMessagesState.isChatOpen.peek()) {
                router.replace('/personal/home');
                return;
            }

            return () => {
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
});

export default PersonalChatScreen;

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

    const renderDateHeader = () => {
        const prevMessageId = messageIds[index + 1];
        const currentMsgDate = new Date(message.created_at).toDateString();

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
                    $chatMessagesState.removeMessages(chatId, [messageId]);
                    PersonalChatApi.deleteMessageForMe({ message_ids: [messageId] })
                        .catch(err => console.error('[UI] Delete failed', err));
                }
            }
        ];

        if (message.is_from_me && status !== 'read' && message.message_type !== 'unsent') {
            controllers.unshift({
                id: 'unsend',
                label: 'Unsend',
                onPress: () => {
                    $chatMessagesState.unsendMessages(chatId, [messageId]);
                    PersonalChatApi.unsendMessage({ chat_id: chatId, message_ids: [messageId] })
                        .catch(err => console.error('[UI] Unsend failed', err));
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
        // Always check select mode first, regardless of message type.
        const isSelectMode = $chatMessagesState.chats[chatId]?.isSelectMode.peek();
        if (isSelectMode) {
            // Compute the next selectedMessageIds ourselves so we can check the
            // resulting length synchronously — Legend State .peek() after
            // toggleMessageSelection may not reflect the update in the same tick.
            const current = $chatMessagesState.chats[chatId]?.selectedMessageIds.peek() ?? [];
            const alreadySelected = current.includes(messageId);
            const next = alreadySelected
                ? current.filter(id => id !== messageId)
                : [...current, messageId];

            // Apply directly instead of calling toggleMessageSelection
            $chatMessagesState.chats[chatId]?.selectedMessageIds.set(next);

            // If nothing is selected, exit select mode entirely — closes the bar and resets previews
            if (next.length === 0) {
                $chatMessagesState.toggleSelectMode(chatId, false);
            }
            return;
        }

        // Not in select mode — handle file open
        const activeUrl = message.download_url || message.file_url;
        if (message.message_type === 'file' && activeUrl) {
            if (Platform.OS === 'web') {
                window.open(activeUrl, '_blank');
            } else {
                Linking.openURL(activeUrl).catch(err => {
                    console.error('[UI] Failed to open URL:', err);
                });
            }
        }
    }, [chatId, messageId, message.message_type, message.file_url, message.download_url]);

    const isSelected = useValue(() => {
        const selectedIds = $chatMessagesState.chats[chatId]?.selectedMessageIds.get() || [];
        return selectedIds.includes(messageId);
    });

    // FIX: Subscribe to isSelectMode so MessageBubble re-renders when
    // select mode is toggled — allowing it to gate media actions correctly.
    const isSelectMode = useValue(() => {
        return $chatMessagesState.chats[chatId]?.isSelectMode.get() ?? false;
    });

    return (
        <ThemedView style={{ backgroundColor: 'transparent' }}>
            {renderDateHeader()}
            <MessageBubble
                message_id={messageId}
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
                isSelectMode={isSelectMode}
                fileUrl={message.file_url}
                viewUrl={message.view_url}
                downloadUrl={message.download_url}
                fileName={message.file_name}
                fileSize={message.file_size}
                fileMimeType={message.file_mime_type}
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
    useFocusEffect(
        useCallback(() => {
            if (!chat_id) return;

            batch(() => {
                $chatMessagesState.setActiveChatId(chat_id);
                const currentChat = $chatMessagesState.chats[chat_id];
                currentChat.recipientId.set(recipient_id ?? null);

                const msgs = currentChat.messages.peek();
                if (msgs.length > 0) {
                    msgs.forEach(m => {
                        if (!m.is_from_me && !m.delivered_to_recipient) {
                            currentChat.messagesById[m.message_id].delivered_to_recipient.set(true);
                        }
                        if (m.is_from_me && !m.synced_to_sender_primary) {
                            currentChat.messagesById[m.message_id].synced_to_sender_primary.set(true);
                        }
                    });
                }

                loadMessages(chat_id).then(() => {
                    void PersonalChatApi.markChatRead({ chat_id }).catch(() => { });
                    $chatListState.markChatRead(chat_id);
                });
            });
        }, [chat_id, recipient_id])
    );

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

            if (response.other_user_last_read_at) {
                batch(() => {
                    const chat$ = $chatListState.chatsById[chatId];
                    const chat = chat$.peek();
                    if (chat) {
                        chat$.other_user_last_read_at.set(response.other_user_last_read_at);

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

            const messagesWithStatus = (response.messages ?? []).map(m => ({
                ...m,
                status: 'sent'
            } as MessageEntry));

            batch(() => {
                $chatMessagesState.setMessages(chatId, messagesWithStatus);
                if (messagesWithStatus.length < 50) {
                    $chatMessagesState.chats[chatId].hasMore.set(false);
                }

                if (messagesWithStatus.length > 0) {
                    const sorted = [...messagesWithStatus].sort((a, b) =>
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    );
                    const latestMsg = sorted[0];
                    const chat$ = $chatListState.chatsById[chatId];
                    const currentChat = chat$.peek();

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
            delivered_to_recipient: false,
            synced_to_sender_primary: true,
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
            other_user_last_read_at: existingChat?.other_user_last_read_at || new Date(0).toISOString(),
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
                $chatMessagesState.addMessage(chat_id, { ...response, status: 'sent' });

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

    const sendFile = useCallback(async (asset: any, type: 'image' | 'video' | 'audio' | 'file') => {
        const currentChat = $chatMessagesState.chats[chat_id];
        const recipId = currentChat.recipientId.peek();
        if (!recipId || !chat_id) return;

        const fileSize = (asset as any).size || (asset as any).fileSize || 0;
        const fileName = (asset as any).name || (asset as any).fileName || 'file';
        const fileMimeType = (asset as any).mimeType || (asset as any).type || (type === 'image' ? 'image/jpeg' : type === 'video' ? 'video/mp4' : type === 'audio' ? 'audio/mpeg' : null);

        if (fileSize > 100 * 1024 * 1024) {
            showAlert(`File "${fileName}" is too large. Max 100MB allowed.`);
            return;
        }

        const tempId = `temp-${Date.now()}`;
        const now = new Date().toISOString();

        const optimisticMsg: MessageEntry = {
            message_id: tempId,
            chat_id,
            is_from_me: true,
            recipient_id: recipId,
            content: '',
            message_type: type,
            file_mime_type: fileMimeType,
            created_at: now,
            expires_at: now,
            status: 'pending',
            delivered_to_recipient: false,
            synced_to_sender_primary: true,
            // @ts-ignore
            file_url: asset.uri,
            file_name: fileName,
            file_size: fileSize,
            progress: 0,
        };

        batch(() => {
            $chatMessagesState.addMessage(chat_id, optimisticMsg);
        });

        try {
            const formData = await buildFormDataFromAsset(asset, { fieldName: 'file' });
            formData.append('recipient_id', recipId);
            formData.append('message_type', type);
            formData.append('caption', '');

            const response = await PersonalChatApi.uploadFileWithProgress(formData, (progress) => {
                $chatMessagesState.updateMessageStatus(chat_id, tempId, { progress });
            });

            batch(() => {
                $chatMessagesState.removeMessage(chat_id, tempId);
                const finalMsg: MessageEntry = {
                    ...response as any,
                    view_url: response.view_url || asset.uri,
                    download_url: response.download_url,
                    file_mime_type: response.file_mime_type || fileMimeType,
                    chat_id,
                    recipient_id: recipId,
                    is_from_me: true,
                    message_type: type,
                    content: '',
                    status: 'sent',
                    delivered_to_recipient: false,
                    synced_to_sender_primary: true,
                    progress: 100,
                };
                $chatMessagesState.addMessage(chat_id, finalMsg);

                $chatListState.upsertChat({
                    ...$chatListState.chatsById[chat_id].peek(),
                    last_message_content: type === 'image' ? 'Sent an image' : `Sent a file: ${fileName}`,
                    last_message_created_at: response.created_at,
                    last_message_status: 'sent',
                    last_message_is_from_me: true,
                    last_message_type: type,
                    last_message_id: response.message_id,
                } as ChatEntry);
            });
        } catch (err: unknown) {
            batch(() => {
                $chatMessagesState.removeMessage(chat_id, tempId);
                $chatMessagesState.setError(chat_id, getChatErrorMessage(err, 'File could not be sent.', { name: recipient_name }));
            });
        }
    }, [chat_id, recipient_name]);

    const handleAttach = useCallback((event: any) => {
        const position = {
            x: event?.nativeEvent?.pageX ?? 0,
            y: event?.nativeEvent?.pageY ?? 0,
        };

        const pickMedia = async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images', 'videos'],
                quality: 1,
            });
            if (!result.canceled && result.assets && result.assets[0]) {
                const asset = result.assets[0];
                const type = (asset.type === 'video' ? 'video' : 'image') as 'image' | 'video' | 'audio' | 'file';
                sendFile(asset, type);
            }
        };

        const pickDocument = async () => {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
            });
            if (!result.canceled && result.assets && result.assets[0]) {
                sendFile(result.assets[0], 'file');
            }
        };

        showControllersModal([
            { id: 'media', label: 'Photo & Video', onPress: pickMedia },
            { id: 'doc', label: 'Document', onPress: pickDocument },
        ], {
            title: 'Attach',
            position,
            showConfirmButton: false,
            showCancelButton: true,
            closeOnControllerPress: true,
        });
    }, [sendFile]);

    const loadMore = useCallback(async () => {
        if (!chat_id) return;
        const currentChat = $chatMessagesState.chats[chat_id];
        const chatData = currentChat.peek();
        if (!chatData.hasMore || chatData.loading) return;

        try {
            currentChat.loading.set(true);
            const offset = currentChat.offset.peek();
            const response = await PersonalChatApi.getMessages({ chat_id, limit: 50, offset });

            const messagesWithStatus = (response.messages ?? []).map(m => ({
                ...m, status: 'sent'
            } as MessageEntry));

            batch(() => {
                if (messagesWithStatus.length < 50) currentChat.hasMore.set(false);
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
            <MessageItemWrapper messageId={messageId} chatId={chat_id} index={index} />
        ),
        [chat_id]
    );

    const keyExtractor = useCallback((id: string) => id, []);

    const handleBulkUnsend = useCallback(async () => {
        const selectedIds = $chatMessagesState.chats[chat_id].selectedMessageIds.peek();
        if (selectedIds.length === 0) return;

        const confirmed = await showConfirmDialog(
            `Are you sure you want to unsend ${selectedIds.length} messages?`,
            { confirmText: 'Unsend All', cancelText: 'Cancel', confirmVariant: 'destructive' }
        );

        if (confirmed) {
            $chatMessagesState.unsendMessages(chat_id, selectedIds);
            $chatMessagesState.toggleSelectMode(chat_id, false);
            $chatMessagesState.chats[chat_id]?.selectedMessageIds.set([]);
            try {
                await PersonalChatApi.unsendMessage({ chat_id, message_ids: selectedIds });
            } catch (err) {
                console.error('[UI] Bulk Unsend failed', err);
            }
        }
    }, [chat_id]);

    const handleBulkDelete = useCallback(async () => {
        const selectedIds = $chatMessagesState.chats[chat_id].selectedMessageIds.peek();
        if (selectedIds.length === 0) return;

        $chatMessagesState.removeMessages(chat_id, selectedIds);
        $chatMessagesState.toggleSelectMode(chat_id, false);
        $chatMessagesState.chats[chat_id]?.selectedMessageIds.set([]);
        try {
            await PersonalChatApi.deleteMessageForMe({ message_ids: selectedIds });
        } catch (err) {
            console.error('[UI] Bulk Delete failed', err);
        }
    }, [chat_id]);

    const handleCancelSelection = useCallback(() => {
        // toggleSelectMode should clear selectedMessageIds internally,
        // but explicitly clear them here too so the media preview state
        // in MessageBubble (isSelectMode -> isSelected) fully resets.
        $chatMessagesState.toggleSelectMode(chat_id, false);
        $chatMessagesState.chats[chat_id]?.selectedMessageIds.set([]);
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
                                    onAttach={handleAttach}
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