import Header from '@/components/header/Header';
import Sidebar from '@/components/sidebar/Sidebar';
import { EmptyState } from '@/components/ui/common/EmptyState';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { modalActions } from '@/state/modals/state.modals';
import {
  $contactRequestsState,
  $contactsState,
} from '@/state/personalState/contacts/personal.state.contacts';
import { utilGoBack } from '@/utils/commonUtils/util.router';
import {
  PersonalUtilFetchContactRequests,
  PersonalUtilFetchContacts,
} from '@/utils/personalUtils/personal.util.contacts';
import { LegendList } from '@legendapp/list';
import { useValue } from '@legendapp/state/react';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, RefreshControl } from 'react-native';
import ContactRow from './components/ContactRow';
import ContactsHeaderSection from './components/ContactsHeaderSection';
import ContactsSegmentTabs from './components/ContactsSegmentTabs';
import CreateContactsFlows from './contacts.flows';
import styles from './contacts.styles';

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

export default function Contacts() {
  const contactsIds = useValue($contactsState.contactsIds);
  const addedYouIds = useValue($contactsState.addedYouIds);
  console.log('in contact screen')
  const loading = useValue($contactsState.loading);
  const error = useValue($contactsState.error);
  const lastFetchedAt = useValue($contactsState.lastFetchedAt);
  const pendingIds = useValue($contactRequestsState.pendingIds);

  const [selectedTab, setSelectedTab] = useState<'contacts' | 'addedYou'>('contacts');

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

  useFocusEffect(
    useCallback(() => {
      if (lastFetchedAt == null) {
        void fetchContacts();
        void fetchRequests();
      }
      return () => {
        modalActions.close();
      };
    }, [fetchContacts, fetchRequests, lastFetchedAt])
  );

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
    <ThemedViewWithSidebar>
      <ThemedViewWithSidebar.Sidebar>
        <Sidebar />
      </ThemedViewWithSidebar.Sidebar>
      <ThemedViewWithSidebar.Main>
        <ThemedView style={styles.mainContainer}>
          <Header
            leftButton={{
              child: <IconSymbol name='arrow.left' />,
              onPress: utilGoBack,
            }}
            centerIcon
            Icon={<ThemedText type='subtitle'>Contacts</ThemedText>}
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
              onChangeTab={(tab) => setSelectedTab(tab)}
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
                <RefreshControl refreshing={loading} onRefresh={fetchContacts} />
              }
            />
          </ThemedView>
        </ThemedView>
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
  );
}