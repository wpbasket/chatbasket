import React, { useCallback, useEffect } from 'react';
import { FlatList, Pressable } from 'react-native';
import { AppButton } from '@/components/ui/common/AppButton';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { FontAwesome5Icon } from '@/components/ui/fonts/fontAwesome5';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { appMode$, setAppMode } from '@/state/appMode/state.appMode';
import { $chatListState, $chatMessagesState } from '@/state/personalState/chat/personal.state.chat';
import { $contactsState, type ContactEntry } from '@/state/personalState/contacts/personal.state.contacts';
import { $personalStateUser } from '@/state/personalState/user/personal.state.user';
import { ChatTransport } from '@/lib/personalLib/chatApi/chat.transport';
import { getChatErrorMessage } from '@/utils/personalUtils/util.chatErrors';
import { showAlert, showConfirmDialog, showControllersModal } from '@/utils/commonUtils/util.modal';
import * as ChatStorage from '@/lib/storage/personalStorage/chat/chat.storage';
import { PersonalStorageGetUser } from '@/lib/storage/personalStorage/profile/personal.storage.user';
import { useValue, Memo } from '@legendapp/state/react';
import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import ChatListItem from './_components/ChatListItem';
import type { ChatEntry } from '@/lib/personalLib';

const PersonalHome = React.memo(() => {
  const router = useRouter();
  const { handlePressIn } = React.useMemo(() => pressableAnimation(), []);

  const toggleMode = useCallback(() => {
    const current = appMode$.mode.peek();
    const next = current === 'public' ? 'personal' : 'public';
    setAppMode(next);
    router.push(next === 'public' ? '/public/home' : '/personal/home');
  }, [router]);

  const handleChatPress = useCallback((chat: ChatEntry) => {
    const contact = $contactsState.contactsById[chat.other_user_id].peek();
    const displayName = (contact?.nickname ?? chat.other_user_name) || chat.other_user_username || 'User';

    $chatMessagesState.isChatOpen.set(true);
    router.push({
      pathname: '/personal/home/chat/[chat_id]',
      params: {
        chat_id: chat.chat_id,
        recipient_id: chat.other_user_id,
        recipient_name: displayName,
      },
    });
  }, [router]);

  const handleChatLongPress = useCallback((chat: ChatEntry, event: import('react-native').GestureResponderEvent) => {
    if (event && 'preventDefault' in event) {
      (event as any).preventDefault();
    }

    const position = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };

    const controllers: any[] = [
      {
        id: 'delete_chat',
        label: 'Delete Chat',
        onPress: async () => {
          const confirmed = await showConfirmDialog(
            'Are you sure you want to delete this chat?',
            { confirmText: 'Delete', confirmVariant: 'destructive' }
          );
          if (!confirmed) return;

          const chatId = chat.chat_id;
          try {
            // 1. Drop in-memory conversation state first so the chat screen
            //    unmounts immediately. clearChat() resets activeChatId/isChatOpen,
            //    which triggers the useFocusEffect in [chat_id].tsx to navigate
            //    back Home if this chat was currently open.
            $chatMessagesState.clearChat(chatId);

            // 2. Reset the chat list entry: zero message/unread counts and null
            //    last_message_* preview fields. The chat row itself is kept in
            //    $chatListState.chatsById so the conversation is still known to
            //    the client — it disappears from the Home list via the
            //    `local_message_count > 0` filter and auto‑rehydrates on the
            //    next incoming message (WhatsApp‑style clear semantics).
            $chatListState.clearChatMessages(chatId);

            // 3. Persist: delete all local messages + media for this chat.
            //    Chat row is intentionally preserved in storage.
            await ChatStorage.clearChatMessages(chatId);
          } catch (err) {
            console.error('[ChatList] Delete Chat failed', err);
            showAlert(getChatErrorMessage(err, 'Could not delete chat messages.'));
          }
        },
      },
    ];

    showControllersModal(controllers, {
      title: 'Chat Options',
      position,
      showConfirmButton: false,
      showCancelButton: true,
      closeOnControllerPress: true,
    });
  }, []);

  const handleNewChat = useCallback(async () => {
    let user = $personalStateUser.user.peek();
    // If state is still empty, reload from secure storage before deciding
    if (!user) {
      try {
        await PersonalStorageGetUser();
        user = $personalStateUser.user.peek();
      } catch (err) {
        console.error('[Home] Failed to reload user from storage', err);
      }
    }
    if (!user) {
      router.replace('/personal/profile');
    } else {
      router.push('/personal/contacts');
    }
  }, [router]);

  const fetchChats = useCallback(async () => {
    $chatListState.setLoading(true);
    try {
      const response = await ChatTransport.getUserChats();
      await $chatListState.setChats(response?.chats ?? []);
      $chatListState.markFetched();
    } catch (err: any) {
      $chatListState.setError(getChatErrorMessage(err, 'Could not load conversations.'));
    } finally {
      $chatListState.setLoading(false);
    }
  }, []);

  const renderItem = useCallback(
    ({ item: chatId }: { item: string }) => (
      <ChatListItem
        chatId={chatId}
        onPress={handleChatPress}
        onLongPress={handleChatLongPress}
        onContextMenu={handleChatLongPress}
      />
    ),
    [handleChatPress, handleChatLongPress]
  );

  const keyExtractor = useCallback((chatId: string) => chatId, []);

  return (
    <ThemedView style={styles.container}>
      {/* Logic Boundary */}
      <HomeLogic fetchChats={fetchChats} />

      {/* Top Bar - Isolated reactivity for Mode toggle */}
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="logo" style={styles.logo} selectable={false}>ChatBasket</ThemedText>
        <ThemedView style={styles.topActions}>
          <Pressable
            onPress={toggleMode}
            onPressIn={handlePressIn}
            style={({ pressed }) => [
              pressed && { opacity: 0.1 },
              styles.modeToggle
            ]}
          >
            <Memo>
              {() => (
                <ThemedText type="default" style={styles.modeText} selectable={false}>
                  {appMode$.mode.get() === 'public' ? 'Public' : 'Personal'}
                </ThemedText>
              )}
            </Memo>
          </Pressable>
        </ThemedView>
      </ThemedView>

      {/* New Chat Section */}
      <ThemedView style={styles.newChatSection}>
        <AppButton
          label="New Chat"
          icon={<FontAwesome5Icon name="plus" size={14} />}
          onPress={handleNewChat}
          onPressIn={handlePressIn}
          pressedOpacity={0.1}
          textType="default"
          labelStyle={styles.newChatText}
          style={styles.newChatButton}
        />
      </ThemedView>

      {/* Chat List - Isolated in Memo and driven by IDs */}
      <Memo>
        {() => {
          const chatIds = $chatListState.chatIds.get();
          const loading = $chatListState.loading.get();

          return (
            <FlatList
              data={chatIds}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              refreshing={loading}
              onRefresh={fetchChats}
              style={styles.list}
              contentContainerStyle={
                chatIds.length === 0 ? styles.emptyContainer : undefined
              }
              ListEmptyComponent={
                !loading ? (
                  <ThemedView style={styles.emptyState}>
                    <ThemedText type="subtitle" style={styles.emptyTitle}>
                      No conversations yet
                    </ThemedText>
                    <ThemedText style={styles.emptySubtitle}>
                      Tap "+ New" to start a chat with a contact
                    </ThemedText>
                  </ThemedView>
                ) : null
              }
            />
          );
        }}
      </Memo>
    </ThemedView>
  );
});

export default PersonalHome;

// -------- Sub-components to isolate logic --------

const HomeLogic = React.memo(({ fetchChats }: { fetchChats: () => Promise<void> }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchChats();
    }, 1000);
    return () => clearTimeout(timer);
  }, [fetchChats]);
  return null;
});

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    paddingTop: {
      xs: rt.insets.top,
      sm: rt.insets.top,
      md: rt.insets.top,
      lg: 11
    }
  },
  titleContainer: {
    display: {
      xs: 'flex',
      sm: 'flex',
      md: 'flex',
      lg: 'none'
    },
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingBottom: 11,
    paddingTop: 11,
    paddingRight: 15,
    justifyContent: 'space-between',
    gap: 8,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    fontSize: 25,
    color: theme.colors.primary,
  },
  modeToggle: {
    // padding: 8,
    paddingLeft: 12,
    // paddingVertical: 0,
    paddingRight: 25,
    ...theme.radii.asymmetric,
    backgroundColor: theme.colors.primaryDark,
  },
  modeText: {
    fontSize: 14,
    color: theme.colors.reverseText,
    fontWeight: 'bold',
  },
  newChatSection: {
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  newChatButton: {
    alignSelf: 'flex-end',
  },
  newChatText: {
    fontSize: 14,
    color: theme.colors.whiteOrBlack,
    fontWeight: '700',
  },
  list: {
    flex: 1,
    paddingHorizontal: 3,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    color: theme.colors.icon,
  },
  emptySubtitle: {
    color: theme.colors.icon,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
}));
