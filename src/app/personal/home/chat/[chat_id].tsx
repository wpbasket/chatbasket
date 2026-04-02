import React, { useCallback, useEffect } from 'react';
import { FlatList, Alert, Platform, Linking, Pressable, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
    ThemedText,
    ThemedView,
    Header,
    router,
    Stack
} from '@/components/ui/basic';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import MessageBubble from './_components/MessageBubble';
import ChatInputBar from './_components/ChatInputBar';
import { BulkActionBar } from './_components/BulkActionBar';
import { $chatMessagesState, $chatListState } from '@/state/personalState/chat/personal.state.chat';
import { $contactsState } from '@/state/personalState/contacts/personal.state.contacts';
import { authState } from '@/state/auth/state.auth';
import { $uiState } from '@/state/ui/state.ui';
import { ChatTransport } from '@/lib/personalLib/chatApi/chat.transport';
import { outboxQueue } from '@/lib/personalLib/chatApi/outbox.queue';
import { getChatErrorMessage, getEligibilityMessage } from '@/utils/personalUtils/util.chatErrors';
import { showAlert, showControllersModal, showConfirmDialog, hideModal } from '@/utils/commonUtils/util.modal';
import type { MessageEntry, ChatEntry } from '@/lib/personalLib';
import { PrivacyAvatar } from '@/components/personal/common/PrivacyAvatar';
import { batch } from '@legendapp/state';
import { useValue, Memo } from '@legendapp/state/react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ChatStorage from '@/lib/storage/personalStorage/chat/chat.storage';
import { getMediaBlob } from '@/lib/storage/personalStorage/chat/chat.storage';
import { getPreviewText } from '@/utils/personalUtils/util.chatPreview';

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
    const otherUserLastReadAt = useValue(() => $chatListState.chatsById[chatId]?.other_user_last_read_at?.get());
    const otherUserLastDeliveredAt = useValue(() => $chatListState.chatsById[chatId]?.other_user_last_delivered_at?.get());
    const messageIds = useValue(() => $chatMessagesState.chats[chatId]?.messageIds.get() || []);

    if (!message) return null;

    let status = message.status;
    let delivered = message.delivered_to_recipient;

    const parseDate = (d: string | null | undefined) => {
        if (!d) return NaN;
        try {
            return new Date(d.replace(' ', 'T')).getTime();
        } catch {
            return NaN;
        }
    };

    if (message.is_from_me) {
        const msgTime = parseDate(message.created_at);

        // SOURCE OF TRUTH: Compare message time against chat-level persistent delivery/read timestamps
        const readTime = parseDate(otherUserLastReadAt);
        if (!isNaN(readTime) && msgTime <= readTime + 10000) {
            status = 'read';
            delivered = true;
        } else {
            const deliveredTime = parseDate(otherUserLastDeliveredAt);
            if (!isNaN(deliveredTime) && msgTime <= deliveredTime + 10000) {
                delivered = true;
            }
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
            }
        ];

        // Only show "Delete for Me" for messages that exist on the server (not temp IDs)
        if (!messageId.startsWith('temp_') && message.status !== 'pending' && message.status !== 'error') {
            controllers.push({
                id: 'delete',
                label: 'Delete for Me',
                onPress: async () => {
                    try {
                        const response = await ChatTransport.deleteMessageForMe({ message_ids: [messageId] });
                        if (!response?.status) {
                            throw new Error(response?.message || 'Delete failed');
                        }

                        $chatMessagesState.removeMessages(chatId, [messageId]);
                        $chatListState.clearPreviewIfLastMessage(chatId, [messageId]);

                        // Phase D: Mark as soft-deleted in local storage so it won't reappear on next load
                        ChatStorage.deleteMessage(messageId)
                            .catch(err => console.warn('[UI] Storage soft-delete failed', err));
                    } catch (err) {
                        console.error('[UI] Delete failed', err);
                        showAlert(getChatErrorMessage(err, 'Could not delete message.'));
                    }
                }
            });
        }

        if (message.is_from_me && status === 'error' && message.message_type !== 'unsent') {
            controllers.unshift({
                id: 'retry',
                label: 'Retry Send',
                onPress: async () => {
                    try {
                        await ChatStorage.updateMessageStatus(messageId, {
                            status: 'pending',
                            retry_count: 0,
                            last_retry_at: null,
                            error_message: null,
                        } as any);

                        $chatMessagesState.updateMessageStatus(chatId, messageId, {
                            status: 'pending',
                            progress: 0,
                        });

                        const chatEntry = $chatListState.chatsById[chatId]?.peek();
                        if (chatEntry?.last_message_id === messageId) {
                            $chatListState.upsertChat({
                                ...chatEntry,
                                last_message_status: 'pending',
                                updated_at: new Date().toISOString(),
                            } as ChatEntry);
                        }

                        void outboxQueue.processQueue();
                    } catch (err) {
                        console.error('[UI] Retry enqueue failed', err);
                        showAlert(getChatErrorMessage(err, 'Could not retry message.'));
                    }
                }
            });
        }

        // Only show "Unsend" for messages that exist on the server (not temp IDs)
        // and have been sent/delivered/read (not pending/error)
        if (message.is_from_me && !messageId.startsWith('temp_') &&
            message.status !== 'pending' && message.status !== 'error' &&
            status !== 'read' && message.message_type !== 'unsent') {
            controllers.unshift({
                id: 'unsend',
                label: 'Unsend',
                onPress: async () => {
                    try {
                        const response = await ChatTransport.unsendMessage({ chat_id: chatId, message_ids: [messageId] });
                        if (!response?.status) {
                            throw new Error(response?.message || 'Unsend failed');
                        }

                        $chatMessagesState.unsendMessages(chatId, [messageId]);

                        // Phase D: Persist unsend to storage immediately (don't wait for WS event)
                        ChatStorage.updateMessageStatus(messageId, { message_type: 'unsent', content: 'Message unsent' } as any)
                            .catch(err => console.warn('[UI] Unsend storage update failed', err));

                        // Phase D: Clean up file data (media blob / local file)
                        ChatStorage.cleanupMessageMedia([messageId])
                            .catch(err => console.warn('[UI] Unsend media cleanup failed', err));
                    } catch (err) {
                        console.error('[UI] Unsend failed', err);
                        showAlert(getChatErrorMessage(err, 'Could not unsend message.'));
                    }
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
        // Phase D: prefer local_uri (persisted file) over server URLs (dead post-ACK)
        const activeUrl = message.local_uri || message.download_url || message.file_url;
        if (message.message_type === 'file' && activeUrl) {
            if (Platform.OS === 'web') {
                // Web: idb:// marker → open blob in new tab
                if (activeUrl.startsWith('idb://')) {
                    const msgId = activeUrl.replace('idb://', '');
                    getMediaBlob(msgId).then((result: { blob: Blob; mime: string } | null) => {
                        if (result) {
                            const blobUrl = URL.createObjectURL(result.blob);
                            window.open(blobUrl, '_blank');
                            // Revoke after a short delay to allow the new tab to load
                            setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                        }
                    }).catch(() => {
                        console.warn('[UI] Failed to read file from local storage');
                    });
                } else {
                    window.open(activeUrl, '_blank');
                }
            } else {
                Linking.openURL(activeUrl).catch(err => {
                    console.error('[UI] Failed to open URL:', err);
                });
            }
        }
    }, [chatId, messageId, message.message_type, message.file_url, message.download_url, message.local_uri]);

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
                delivered={delivered}
                createdAt={message.created_at}
                progress={message.progress}
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
                localUri={message.local_uri}
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
    const { theme } = useUnistyles();
    useFocusEffect(
        useCallback(() => {
            if (!chat_id) return;

            $chatMessagesState.setActiveChatId(chat_id);
            const currentChat = $chatMessagesState.chats[chat_id];
            currentChat.recipientId.set(recipient_id ?? null);

            const unreadCount = $chatListState.chatsById[chat_id]?.unread_count.peek() ?? 0;

            // Always reload from local DB on chat entry — messages can arrive
            // (and be unsent) while the user is on the Home Screen, so the
            // in-memory state may be stale / incomplete.
            void loadMessages(chat_id).then(() => {
                if (unreadCount > 0) {
                    // Delay slightly to ensure UI has rendered new messages before marking read
                    setTimeout(() => {
                        $chatMessagesState.debouncedMarkRead(chat_id);
                    }, 500);
                }
            });

            // Check eligibility on mount/focus to catch any status changes
            if (recipient_id) {
                const chat$ = $chatMessagesState.chats[chat_id];
                ChatTransport.checkEligibility({ recipient_id: recipient_id as string })
                    .then(res => {
                        batch(() => {
                            if (chat$.peek()) {
                                chat$.isEligible.set(res.allowed);
                                chat$.eligibilityReason.set(!res.allowed ? (res.reason || null) : null);
                            }
                        });
                    })
                    .catch(err => {
                        console.error('[Chat] Eligibility check failed', err);
                    });
            }

            return () => {
                $chatMessagesState.activeChatId.set(null);
            };
        }, [chat_id, recipient_id])
    );


    const loadMessages = async (chatId: string) => {
        try {
            batch(() => {
                $chatMessagesState.setLoading(chatId, true);
                $chatMessagesState.setError(chatId, null);
            });

            // ── Phase D: Local-first ── Load from local storage FIRST ─────────
            const localMessages = await ChatStorage.getMessagesByChat(chatId, 50, 0);

            if (localMessages.length > 0) {
                const asEntries = localMessages.map(m => ({
                    ...m,
                    status: m.status || 'sent',
                } as MessageEntry));

                await $chatMessagesState.setMessages(chatId, asEntries);

                batch(() => {
                    if (asEntries.length < 50) {
                        $chatMessagesState.chats[chatId].hasMore.set(false);
                    }
                });
            }

            // ── Background: Sync read/delivered timestamps + any new messages ──
            try {
                const response = await ChatTransport.getMessages({
                    chat_id: chatId,
                    limit: 50,
                    offset: 0,
                });

                if (response.other_user_last_read_at) {
                    let shouldPersist = false;
                    batch(() => {
                        const chat$ = $chatListState.chatsById[chatId];
                        const chat = chat$.peek();
                        if (chat) {
                            chat$.other_user_last_read_at.set(response.other_user_last_read_at);
                            shouldPersist = true;

                            if (chat.last_message_created_at && chat.last_message_is_from_me) {
                                const lastMsgTime = new Date(chat.last_message_created_at).getTime();
                                const readTime = new Date(response.other_user_last_read_at).getTime();
                                if (lastMsgTime <= readTime) {
                                    chat$.last_message_status.set('read');
                                }
                            }
                        }
                    });
                    if (shouldPersist) {
                        $chatListState.persistChat(chatId);
                    }
                }

                if (response.other_user_last_delivered_at) {
                    let shouldPersist = false;
                    batch(() => {
                        const chat$ = $chatListState.chatsById[chatId];
                        const chat = chat$.peek();
                        if (chat) {
                            chat$.other_user_last_delivered_at.set(response.other_user_last_delivered_at);
                            shouldPersist = true;

                            if (chat.last_message_created_at && chat.last_message_is_from_me && chat.last_message_status === 'sent') {
                                const lastMsgTime = new Date(chat.last_message_created_at).getTime();
                                const deliveredTime = new Date(response.other_user_last_delivered_at).getTime();
                                if (lastMsgTime <= deliveredTime) {
                                    chat$.last_message_status.set('delivered');
                                }
                            }
                        }
                    });
                    if (shouldPersist) {
                        $chatListState.persistChat(chatId);
                    }
                }

                // Merge any new server messages not already in local storage
                const serverMessages = (response.messages ?? []).map(m => ({
                    ...m,
                    status: 'sent'
                } as MessageEntry));

                if (serverMessages.length > 0) {
                    await $chatMessagesState.setMessages(chatId, serverMessages);

                    let shouldPersistPreview = false;
                    batch(() => {
                        // Update hasMore based on combined count
                        const totalCount = $chatMessagesState.chats[chatId].messages.peek().length;
                        if (serverMessages.length < 50 && totalCount < 50) {
                            $chatMessagesState.chats[chatId].hasMore.set(false);
                        }

                        const sorted = [...serverMessages].sort((a, b) =>
                            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                        );
                        const latestMsg = sorted[0];
                        const chat$ = $chatListState.chatsById[chatId];
                        const currentChat = chat$.peek();

                        if (currentChat) {
                            const serverPreview = currentChat.last_message_content;
                            if (serverPreview === null || serverPreview === '') {
                                return;
                            }

                            if (!currentChat.last_message_created_at || new Date(latestMsg.created_at).getTime() > new Date(currentChat.last_message_created_at).getTime()) {
                                chat$.assign({
                                    last_message_content: getPreviewText(latestMsg),
                                    last_message_created_at: latestMsg.created_at,
                                    last_message_status: latestMsg.status ?? 'sent',
                                    last_message_is_from_me: latestMsg.is_from_me,
                                    last_message_type: latestMsg.message_type,
                                    last_message_id: latestMsg.message_id,
                                    last_message_is_unsent: latestMsg.message_type === 'unsent',
                                    last_message_sender_id: latestMsg.is_from_me
                                        ? (authState.userId.peek() || null)
                                        : currentChat.other_user_id,
                                });
                                shouldPersistPreview = true;
                            }
                        }
                    });
                    if (shouldPersistPreview) {
                        $chatListState.persistChat(chatId);
                    }
                } else if (localMessages.length === 0) {
                    // No messages anywhere — mark hasMore false
                    $chatMessagesState.chats[chatId].hasMore.set(false);
                }
            } catch (syncErr) {
                // Server sync failed — local data is still shown, log warning only
                console.warn('[Chat] Background server sync failed (offline?):', syncErr);
            }

        } catch (err: unknown) {

            $chatMessagesState.setError(chatId, getChatErrorMessage(err, 'Could not load messages.', { name: recipient_name }));
        } finally {
            $chatMessagesState.setLoading(chatId, false);
        }
    };

    const sendMessage = useCallback(async () => {
        const currentChat = $chatMessagesState.chats[chat_id];
        const chatData = currentChat.peek();

        // Check eligibility before proceeding
        if (!chatData.isEligible) {
            const reason = chatData.eligibilityReason;

            if (reason === 'not_in_contacts') {
                showControllersModal([
                    {
                        id: 'add_contact_redirect',
                        content: (
                            <View style={{ width: '100%', alignItems: 'flex-start', paddingTop: 16 }}>
                                <Pressable
                                    onPress={() => {
                                        $contactsState.setSelectedTab('addedYou');
                                        router.push('/personal/contacts');
                                        hideModal();
                                    }}
                                    style={({ pressed }) => [
                                        styles.addButton,
                                        pressed ? styles.addButtonPressed : null,
                                    ]}
                                >
                                    <IconSymbol name="account.add" size={20} color={theme.colors.whiteOrBlack} />
                                    <ThemedText
                                        type="small"
                                        style={styles.addButtonLabel}
                                        selectable={false}
                                    >
                                        Add to contacts
                                    </ThemedText>
                                </Pressable>
                            </View>
                        )
                    }
                ], {
                    message: (
                        <>You cannot send messages to <ThemedText style={{ color: theme.colors.primary }}>{displayName}</ThemedText> until you add them to your contacts.</>
                    ),
                    showConfirmButton: false,
                    showCancelButton: true,
                    cancelText: 'Dismiss'
                });
            } else {
                // For all other reasons, show the specific error message from eligibility helper
                const errorMsg = getEligibilityMessage(reason as string, { name: displayName });
                showAlert(errorMsg);
            }
            return;
        }

        const trimmed = chatData.inputText.trim();
        const recipId = chatData.recipientId;
        if (!trimmed || !recipId || !chat_id) return;

        try {
            await outboxQueue.enqueueTextMessage({
                chatId: chat_id as string,
                recipientId: recipId,
                recipientName: recipient_name,
                content: trimmed,
            });
        } catch (err: unknown) {
            console.error('[UI] Queue text enqueue failed', err);
            batch(() => {
                $chatMessagesState.chats[chat_id].inputText.set(trimmed);
                $chatMessagesState.setError(chat_id, getChatErrorMessage(err, 'Message could not be sent.', { name: recipient_name }));
            });
        }
    }, [chat_id, recipient_name, displayName, theme]);

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

        try {
            await outboxQueue.enqueueFileMessage({
                chatId: chat_id as string,
                recipientId: recipId,
                recipientName: recipient_name,
                asset,
                messageType: type,
            });
        } catch (err: unknown) {
            console.error('[UI] Queue file enqueue failed', err);
            $chatMessagesState.setError(chat_id, getChatErrorMessage(err, 'File could not be sent.', { name: recipient_name }));
            return;
        }

    }, [chat_id, recipient_name]);
    const handleAttach = useCallback((event: any) => {
        const currentChat = $chatMessagesState.chats[chat_id];
        const chatData = currentChat.peek();

        // Check eligibility before proceeding
        if (!chatData.isEligible) {
            const reason = chatData.eligibilityReason;

            if (reason === 'not_in_contacts') {
                showControllersModal([
                    {
                        id: 'add_contact_redirect',
                        content: (
                            <View style={{ width: '100%', alignItems: 'flex-start', paddingTop: 16 }}>
                                <Pressable
                                    onPress={() => {
                                        $contactsState.setSelectedTab('addedYou');
                                        router.push('/personal/contacts');
                                        hideModal();
                                    }}
                                    style={({ pressed }) => [
                                        styles.addButton,
                                        pressed ? styles.addButtonPressed : null,
                                    ]}
                                >
                                    <IconSymbol name="account.add" size={20} color={theme.colors.whiteOrBlack} />
                                    <ThemedText
                                        type="small"
                                        style={styles.addButtonLabel}
                                        selectable={false}
                                    >
                                        Add to contacts
                                    </ThemedText>
                                </Pressable>
                            </View>
                        )
                    }
                ], {
                    message: (
                        <>You cannot send messages to <ThemedText style={{ color: theme.colors.primary }}>{displayName}</ThemedText> until you add them to your contacts.</>
                    ),
                    showConfirmButton: false,
                    showCancelButton: true,
                    cancelText: 'Dismiss'
                });
            } else {
                // For all other reasons, show the specific error message from eligibility helper
                const errorMsg = getEligibilityMessage(reason as string, { name: displayName });
                showAlert(errorMsg);
            }
            return;
        }

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
    }, [chat_id, displayName, theme, sendFile]);

    const loadMore = useCallback(async () => {
        if (!chat_id) return;
        const currentChat = $chatMessagesState.chats[chat_id];
        const chatData = currentChat.peek();
        if (!chatData.hasMore || chatData.loading) return;

        try {
            currentChat.loading.set(true);
            const offset = currentChat.offset.peek();

            // Phase D: Load older messages from local storage only — all messages
            // are persisted locally, no server round-trip needed for pagination.
            const localMessages = await ChatStorage.getMessagesByChat(chat_id, 50, offset);

            const messagesWithStatus = localMessages.map(m => ({
                ...m, status: m.status || 'sent'
            } as MessageEntry));

            batch(() => {
                if (messagesWithStatus.length < 50) currentChat.hasMore.set(false);
            });
            // prependMessages is async (Phase D persist-before-ACK) — await it outside batch()
            await $chatMessagesState.prependMessages(chat_id, messagesWithStatus);
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

        // Filter out messages with temp IDs (pending/error status) - they only exist locally
        const messagesById = $chatMessagesState.chats[chat_id].messagesById.peek() || {};
        const validIds = selectedIds.filter(id => {
            const msg = messagesById[id];
            // Skip messages with temp IDs (start with 'temp_') or pending/error status
            return msg && !id.startsWith('temp_') && msg.status !== 'pending' && msg.status !== 'error';
        });

        if (validIds.length === 0) {
            $chatMessagesState.toggleSelectMode(chat_id, false);
            $chatMessagesState.chats[chat_id]?.selectedMessageIds.set([]);
            return;
        }

        const confirmed = await showConfirmDialog(
            `Are you sure you want to unsend ${validIds.length} messages?`,
            { confirmText: 'Unsend All', cancelText: 'Cancel', confirmVariant: 'destructive' }
        );

        if (confirmed) {
            try {
                const response = await ChatTransport.unsendMessage({ chat_id, message_ids: validIds });
                if (!response?.status) {
                    throw new Error(response?.message || 'Bulk unsend failed');
                }

                $chatMessagesState.toggleSelectMode(chat_id, false);
                $chatMessagesState.chats[chat_id]?.selectedMessageIds.set([]);
                $chatMessagesState.unsendMessages(chat_id, validIds);

                // Phase D: Persist unsend to storage immediately (don't wait for WS event)
                Promise.all(validIds.map(id =>
                    ChatStorage.updateMessageStatus(id, { message_type: 'unsent', content: 'Message unsent' } as any)
                )).catch(err => console.warn('[UI] Bulk unsend storage update failed', err));

                // Phase D: Clean up file data (media blob / local file)
                ChatStorage.cleanupMessageMedia(validIds)
                    .catch(err => console.warn('[UI] Bulk unsend media cleanup failed', err));
            } catch (err) {
                console.error('[UI] Bulk Unsend failed', err);
                $chatMessagesState.setError(chat_id, getChatErrorMessage(err, 'Could not unsend selected messages.', { name: recipient_name }));
            }
        }
    }, [chat_id, recipient_name]);

    const handleBulkDelete = useCallback(async () => {
        const selectedIds = $chatMessagesState.chats[chat_id].selectedMessageIds.peek();
        if (selectedIds.length === 0) return;

        // Filter out messages with temp IDs (pending/error status) - they only exist locally
        const messagesById = $chatMessagesState.chats[chat_id].messagesById.peek() || {};
        const validIds = selectedIds.filter(id => {
            const msg = messagesById[id];
            // Skip messages with temp IDs (start with 'temp_') or pending/error status
            return msg && !id.startsWith('temp_') && msg.status !== 'pending' && msg.status !== 'error';
        });

        if (validIds.length === 0) {
            $chatMessagesState.toggleSelectMode(chat_id, false);
            $chatMessagesState.chats[chat_id]?.selectedMessageIds.set([]);
            return;
        }

        try {
            const response = await ChatTransport.deleteMessageForMe({ message_ids: validIds });
            if (!response?.status) {
                throw new Error(response?.message || 'Bulk delete failed');
            }

            $chatMessagesState.removeMessages(chat_id, validIds);
            $chatListState.clearPreviewIfLastMessage(chat_id, validIds);
            $chatMessagesState.toggleSelectMode(chat_id, false);
            $chatMessagesState.chats[chat_id]?.selectedMessageIds.set([]);

            // Phase D: Mark as soft-deleted in local storage so they won't reappear on next load
            Promise.all(validIds.map(id => ChatStorage.deleteMessage(id)))
                .catch(err => console.warn('[UI] Storage bulk soft-delete failed', err));
        } catch (err) {
            console.error('[UI] Bulk Delete failed', err);
            $chatMessagesState.setError(chat_id, getChatErrorMessage(err, 'Could not delete selected messages.', { name: recipient_name }));
        }
    }, [chat_id, recipient_name]);

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
                        { transform: [{ translateY: -$uiState.keyboardHeight.get() - 4 }] }
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
                                />
                            );
                        }}
                    </Memo>
                </ThemedView>
            )}
        </Memo>
    );
}, (prev: any, next: any) => {
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
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: theme.colors.neutral2,
        borderTopRightRadius: 30,
        borderTopLeftRadius: 20,
        borderBottomRightRadius: 10,
        borderBottomLeftRadius: 20,
        padding: 8,
        paddingLeft: 10,
        paddingVertical: 2,
        paddingRight: 25,
        alignSelf: 'flex-end',
    },
    addButtonPressed: {
        opacity: 0.6,
    },
    addButtonLabel: {
        color: theme.colors.whiteOrBlack,
    },
}));


