import Header from '@/components/header/Header';
import { EmptyState } from '@/components/ui/common/EmptyState';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
// import { chatApi } from '@/lib/personalLib';
import { modalActions } from '@/state/modals/state.modals';
import {
  $contactRequestsState,
  $contactsState,
  type ContactEntry,
} from '@/state/personalState/contacts/personal.state.contacts';
import { utilGoBack } from '@/utils/commonUtils/util.router';
import {
  PersonalUtilFetchContactRequests,
  PersonalUtilFetchContacts,
} from '@/utils/personalUtils/personal.util.contacts';
import { PersonalChatApi } from '@/lib/personalLib/chatApi/personal.api.chat';
import { $chatListState, $chatMessagesState } from '@/state/personalState/chat/personal.state.chat';
import { runWithLoading, showAlert } from '@/utils/commonUtils/util.modal';
import { getChatErrorMessage, getEligibilityMessage } from '@/utils/personalUtils/util.chatErrors';
import { LegendList } from '@legendapp/list';
import { useValue } from '@legendapp/state/react';
import { useFocusEffect } from '@react-navigation/native';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl } from 'react-native';
import ContactRow from './components/ContactRow';
import ContactsHeaderSection from './components/ContactsHeaderSection';
import ContactsSegmentTabs from './components/ContactsSegmentTabs';
import CreateContactsFlows from './contacts.flows';
import styles from './contacts.styles';
import { useUnistyles } from 'react-native-unistyles';

type ContactsListItem =
  | { kind: 'error'; id: string }
  | { kind: 'emptyContacts'; id: string }
  | { kind: 'emptyAddedYou'; id: string }
  | {
    kind: 'contact';
    id: string;
    contactId: string;
    isLastInSection: boolean;
  }
  | {
    kind: 'addedYou';
    id: string;
    contactId: string;
    isLastInSection: boolean;
  };

export default function ContactsScreen() {
  const { rt } = useUnistyles();
  const contactsIds = useValue($contactsState.contactsIds);
  const addedYouIds = useValue($contactsState.addedYouIds);
  const loading = useValue($contactsState.loading);
  const error = useValue($contactsState.error);
  const lastFetchedAt = useValue($contactsState.lastFetchedAt);
  const pendingIds = useValue($contactRequestsState.pendingIds);

  const selectedTab = useValue($contactsState.selectedTab);

  const { handlePressIn: handlePressInModal } = pressableAnimation();

  const fetchContacts = useCallback(async () => {
    await PersonalUtilFetchContacts();
  }, []);

  const fetchRequests = useCallback(async () => {
    await PersonalUtilFetchContactRequests();
  }, []);

  const { openAddContact, openActionsFromContacts, openActionsFromAddedYou } = CreateContactsFlows({
    fetchContacts,
    styles,
    handlePressIn: handlePressInModal,
  });

  const openRequestsFromContacts = () => {
    $contactsState.isInContacts.set(true);
    return router.push('/personal/contacts/requests');
  };


  useEffect(() => {

    void fetchContacts();
    void fetchRequests();
    return () => {
      modalActions.close();
    };
  }, []);


  const contactsItems = useMemo<ContactsListItem[]>(() => {
    return contactsIds.map((contactId, index) => ({
      kind: 'contact',
      id: contactId,
      contactId,
      isLastInSection: index === contactsIds.length - 1,
    }));
  }, [contactsIds]);

  const addedYouItems = useMemo<ContactsListItem[]>(() => {
    return addedYouIds.map((contactId, index) => ({
      kind: 'addedYou',
      id: contactId,
      contactId,
      isLastInSection: index === addedYouIds.length - 1,
    }));
  }, [addedYouIds]);

  const listData = useMemo<ContactsListItem[]>(() => {
    const items: ContactsListItem[] = [];

    if (error) {
      items.push({ kind: 'error', id: 'error' });
    }

    if (selectedTab === 'contacts') {
      if (!loading && !error && contactsItems.length === 0 && lastFetchedAt != null) {
        items.push({ kind: 'emptyContacts', id: 'empty-contacts' });
      } else {
        items.push(...contactsItems);
      }
    } else {
      if (!loading && !error && addedYouItems.length === 0 && lastFetchedAt != null) {
        items.push({ kind: 'emptyAddedYou', id: 'empty-addedYou' });
      } else {
        items.push(...addedYouItems);
      }
    }

    return items;
  }, [addedYouItems, contactsItems, error, lastFetchedAt, loading, selectedTab]);

  const keyExtractor = useCallback((item: ContactsListItem) => item.id, []);

  const handleMessage = useCallback(async (entry: ContactEntry) => {
    // 1. Check local state first for instant routing
    const existingChat = $chatListState.chats.peek().find(c => c.other_user_id === entry.id);
    if (existingChat) {
      $chatMessagesState.isChatOpen.set(true);
      router.push({
        pathname: '/personal/chat/[chat_id]',
        params: {
          chat_id: existingChat.chat_id,
          recipient_id: entry.id,
          recipient_name: entry.nickname ?? entry.name,
        },
      });
      return;
    }

    try {
      // 2. Not found locally, check eligibility
      const eligibility = await runWithLoading(() =>
        PersonalChatApi.checkEligibility({ recipient_id: entry.id })
      );

      if (!eligibility.allowed) {
        showAlert(getEligibilityMessage(eligibility.reason ?? '', { name: entry.nickname ?? entry.name }));
        return;
      }

      // 2. Create or get existing chat
      const chat = await runWithLoading(() =>
        PersonalChatApi.createChat({ recipient_id: entry.id })
      );

      // 3. Navigate to conversation
      $chatMessagesState.isChatOpen.set(true);
      router.push({
        pathname: '/personal/chat/[chat_id]',
        params: {
          chat_id: chat.chat_id,
          recipient_id: entry.id,
          recipient_name: entry.nickname ?? entry.name,
        },
      });
    } catch (err: unknown) {
      showAlert(getChatErrorMessage(err, 'Could not start this conversation.', { name: entry.nickname ?? entry.name }));
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ContactsListItem }) => {
      switch (item.kind) {
        case 'error':
          return (
            <ThemedText style={styles.errorText} selectable={false}>
              {error}
            </ThemedText>
          );
        case 'emptyContacts':
          return (
            <ThemedView style={styles.listRow}>
              <EmptyState description='Add someone to start building your network.' />
            </ThemedView>
          );
        case 'contact':
          return (
            <ThemedView style={styles.listRow}>
              <ContactRow
                id={item.contactId}
                kind='contacts'
                onOpenActions={openActionsFromContacts}
                onMessage={handleMessage}
              />
            </ThemedView>
          );
        case 'emptyAddedYou':
          return (
            <ThemedView style={styles.listRow}>
              <EmptyState description='When someone adds you, you can see them here.' />
            </ThemedView>
          );
        case 'addedYou':
          return (
            <ThemedView style={styles.listRow}>
              <ContactRow
                id={item.contactId}
                kind='addedYou'
                onOpenActions={openActionsFromAddedYou}
              />
            </ThemedView>
          );
        default:
          return null;
      }
    },
    [error, lastFetchedAt, openActionsFromAddedYou, openActionsFromContacts]
  );

  return (
    <ThemedView style={styles.mainContainer}>
      <Stack.Screen
        options={{
          header: () => (
            <ThemedView style={{ paddingTop: rt.insets.top }}>
              <Header
                onBackPress={utilGoBack}
                centerSection={<ThemedText type='subtitle'>Contacts</ThemedText>}
              />
            </ThemedView>
          )
        }}
      />
      <ThemedView style={styles.container}>
        <ContactsHeaderSection
          pendingCount={pendingIds.length}
          selectedTab={selectedTab}
          contactsCount={contactsIds.length}
          addedYouCount={addedYouIds.length}
          error={error}
          lastFetchedAt={lastFetchedAt}
          onPressPending={openRequestsFromContacts}
          onPressAddContact={openAddContact}
        />

        <ContactsSegmentTabs
          selectedTab={selectedTab}
          onChangeTab={(tab) => {
            $contactsState.setSelectedTab(tab);
          }}
        />

        <LegendList
          data={listData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          recycleItems={true}
          maintainVisibleContentPosition={true}
          showsVerticalScrollIndicator={Platform.OS === 'web' ? false : true}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => {
                void fetchContacts();
                void fetchRequests();
              }}
            />
          }
        />
      </ThemedView>
    </ThemedView>
  );
}