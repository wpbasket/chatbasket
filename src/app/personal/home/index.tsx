import React, { useCallback, useEffect } from 'react';
import { batch } from '@legendapp/state';
import { FlatList, Pressable } from 'react-native';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { FontAwesome5Icon } from '@/components/ui/fonts/fontAwesome5';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { appMode$, setAppMode } from '@/state/appMode/state.appMode';
import { $chatListState, $chatMessagesState } from '@/state/personalState/chat/personal.state.chat';
import { $contactsState, type ContactEntry } from '@/state/personalState/contacts/personal.state.contacts';
import { PersonalChatApi } from '@/lib/personalLib/chatApi/personal.api.chat';
import { getChatErrorMessage } from '@/utils/personalUtils/util.chatErrors';
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
      pathname: '/personal/chat/[chat_id]',
      params: {
        chat_id: chat.chat_id,
        recipient_id: chat.other_user_id,
        recipient_name: displayName,
      },
    });
  }, [router]);

  const handleNewChat = useCallback(() => {
    router.push('/personal/contacts');
  }, [router]);

  const fetchChats = useCallback(async () => {
    $chatListState.setLoading(true);
    try {
      const response = await PersonalChatApi.getUserChats();
      batch(() => {
        $chatListState.setChats(response?.chats ?? []);
        $chatListState.markFetched();
        $chatListState.setLoading(false);
      });
    } catch (err: any) {
      batch(() => {
        $chatListState.setError(getChatErrorMessage(err, 'Could not load conversations.'));
        $chatListState.setLoading(false);
      });
    }
  }, []);

  const renderItem = useCallback(
    ({ item: chatId }: { item: string }) => (
      <ChatListItem chatId={chatId} onPress={handleChatPress} />
    ),
    [handleChatPress]
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
        <Pressable
          onPress={handleNewChat}
          onPressIn={handlePressIn}
          style={({ pressed }) => [
            styles.newChatButton,
            pressed && { opacity: 0.1 },
          ]}
        >
          <FontAwesome5Icon name="plus" size={14} />
          <ThemedText style={styles.newChatText} selectable={false}>New Chat</ThemedText>
        </Pressable>
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

const HomeLogic = React.memo(({ fetchChats }: { fetchChats: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchChats();
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
    paddingHorizontal: 10,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 8,
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
    paddingLeft: 12,
    paddingVertical: 2,
    paddingRight: 25,
  },
  newChatText: {
    fontSize: 14,
    color: theme.colors.whiteOrBlack,
    fontWeight: '700',
  },
  list: {
    flex: 1,
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
