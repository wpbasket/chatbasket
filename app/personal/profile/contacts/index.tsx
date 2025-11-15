import Header from '@/components/header/Header';
import { PrivacyAvatar } from '@/components/personal/common/PrivacyAvatar';
import Sidebar from '@/components/sidebar/Sidebar';
import { EmptyState } from '@/components/ui/common/EmptyState';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { UsernameDisplay } from '@/components/ui/common/UsernameDisplay';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { FontAwesome5Icon } from '@/components/ui/fonts/fontAwesome5';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { useLegend$ } from '@/hooks/commonHooks/hooks.useLegend';
import { PersonalContactApi } from '@/lib/personalLib/contactApi/personal.api.contact';
import type { Contact } from '@/lib/personalLib/models/personal.model.contact';
import { authState } from '@/state/auth/state.auth';
import { modalActions } from '@/state/modals/state.modals';
import {
    $contactsState,
    type ContactEntry,
} from '@/state/personalState/contacts/personal.state.contacts';
import { utilGoBack } from '@/utils/commonUtils/util.router';
import { LegendList } from '@legendapp/list';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import CreateContactsFlows from './contacts.flows';

type ContactRowProps = {
  id: string;
  kind: 'contacts' | 'addedYou';
  onOpenActions: (item: ContactEntry, event?: any) => void;
};

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

function ContactRow({ id, kind, onOpenActions }: ContactRowProps) {
  const { handlePressIn } = pressableAnimation();
  const item = useLegend$(
    kind === 'contacts'
      ? $contactsState.contactsById[id]
      : $contactsState.addedYouById[id]
  );

  if (!item) {
    return null;
  }

  const displayName = item.nickname ?? item.name;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.1 : 1 }]}
      onPressIn={handlePressIn}
      onPress={(event) => onOpenActions(item, event)}
    >
      <PrivacyAvatar uri={item.avatarUrl} name={displayName} size={48} />
      <ThemedView style={styles.rowContent}>
        <ThemedText type='semibold' style={styles.rowName} selectable>
          {displayName}
        </ThemedText>
        <ThemedText type='small' style={styles.rowUsername} selectable>
          <UsernameDisplay
            username={item.username}
            lettersStyle={styles.usernameLetters}
            numbersStyle={styles.usernameNumbers}
          />
        </ThemedText>
        {/* Bio intentionally hidden in contact card */}
      </ThemedView>
      {item.isMutual ? (
        <ThemedView style={styles.badge}>
          <FontAwesome5Icon name='account.friends' size={14} />
          <ThemedText type='small' selectable={false}>Mutual</ThemedText>
        </ThemedView>
      ) : null}
    </Pressable>
  );
}

export default function Contacts() {
  const contactsIds = useLegend$($contactsState.contactsIds);
  const addedYouIds = useLegend$($contactsState.addedYouIds);
  const loading = useLegend$($contactsState.loading);
  const error = useLegend$($contactsState.error);

  const [selectedTab, setSelectedTab] = useState<'contacts' | 'addedYou'>('contacts');

  const { handlePressIn: handlePressInModal } = pressableAnimation();

  useEffect(() => {
    return () => {
      authState.isInTheProfileUpdateMode.set(false);
    };
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      $contactsState.setLoading(true);
      $contactsState.setError(null);
      const response = await PersonalContactApi.getContacts();
      const toEntry = (contact: Contact): ContactEntry => ({
        id: contact.id,
        name: contact.name,
        username: contact.username,
        nickname: contact.nickname,
        bio: contact.bio,
        createdAt: contact.created_at,
        updatedAt: contact.updated_at,
        avatarUrl: contact.avatar_url ?? null,
        isMutual: contact.is_mutual,
      });

      $contactsState.setContacts(response.contacts.map(toEntry));
      $contactsState.setAddedYou(response.people_who_added_you.map(toEntry));
      $contactsState.markFetched();
    } catch (error: any) {
      $contactsState.setError(error?.message ?? 'Failed to load contacts.');
    } finally {
      $contactsState.setLoading(false);
    }
  }, []);

  const { openAddContact, openActionsFromContacts, openActionsFromAddedYou } = CreateContactsFlows({
    fetchContacts,
    styles,
    handlePressIn: handlePressInModal,
  });

  useFocusEffect(
    useCallback(() => {
      void fetchContacts();
      return () => {
        modalActions.close();
      };
    }, [fetchContacts])
  );

  const listData = useMemo<ContactsListItem[]>(() => {
    const items: ContactsListItem[] = [];
    if (error) {
      items.push({ kind: 'error', id: 'error' });
    }

    if (selectedTab === 'contacts') {
      if (!loading && contactsIds.length === 0) {
        items.push({ kind: 'emptyContacts', id: 'empty-contacts' });
      } else {
        contactsIds.forEach((contactId, index) => {
          items.push({
            kind: 'contact',
            id: contactId,
            contactId,
            isLastInSection: index === contactsIds.length - 1,
          });
        });
      }
    } else {
      if (!loading && addedYouIds.length === 0) {
        items.push({ kind: 'emptyAddedYou', id: 'empty-addedYou' });
      } else {
        addedYouIds.forEach((contactId, index) => {
          items.push({
            kind: 'addedYou',
            id: contactId,
            contactId,
            isLastInSection: index === addedYouIds.length - 1,
          });
        });
      }
    }
    return items;
  }, [addedYouIds, contactsIds, error, loading, selectedTab]);

  const keyExtractor = useCallback((item: ContactsListItem) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: ContactsListItem }) => {
      switch (item.kind) {
        case 'error':
          return (
            <ThemedText type='small' style={styles.errorText} selectable={false}>
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
    [error, openActionsFromAddedYou, openActionsFromContacts]
  );

  return (
    <ThemedViewWithSidebar>
      <ThemedViewWithSidebar.Sidebar>
        <Sidebar />
      </ThemedViewWithSidebar.Sidebar>
      <ThemedViewWithSidebar.Main>
        <Header
          leftButton={{
            child: <IconSymbol name='arrow.left' />,
            onPress: utilGoBack,
          }}
          centerIcon
          Icon={<ThemedText type='subtitle'>Contacts</ThemedText>}
        />

        <ThemedView style={styles.mainContainer}>
          <ThemedView style={styles.container}>
            <ThemedView style={styles.segmentContainer}>
              {(['contacts', 'addedYou'] as const).map((tab) => {
                const isActive = selectedTab === tab;
                return (
                  <Pressable
                    key={tab}
                    style={({ pressed }) => [
                      { opacity: pressed ? 0.1 : 1 },
                      styles.segmentItem,
                      isActive ? styles.segmentItemActive : undefined,
                    ]}
                    onPress={() => setSelectedTab(tab)}
                  >
                    <ThemedText type='smallBold' selectable={false}>
                      {tab === 'contacts'
                        ? `Your contacts (${contactsIds.length})`
                        : `People who added you (${addedYouIds.length})`}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ThemedView>
            {selectedTab === 'contacts' ? (
              <ThemedView style={styles.addButtonRow}>
                <Pressable
                  onPress={openAddContact}
                  style={({ pressed }) => [
                    styles.addButton,
                    { opacity: pressed ? 0.1 : 1 },
                  ]}
                >
                  <IconSymbol name='account.add' size={24} />
                  <ThemedText type='small' style={styles.addButtonLabel} selectable={false}>
                    Add contact
                  </ThemedText>
                </Pressable>
              </ThemedView>
            ) : null}
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

const styles = StyleSheet.create((theme, rt) => ({
  mainContainer: {
    flex: 1,
    paddingTop: rt.insets.top,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  listContent: {
    paddingVertical: 24,
  },
  addButtonRow: {
    alignItems: 'flex-start',
    marginTop:10,
    marginBottom: 25,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.BackgroundSelect,
    borderRadius: 12,
    padding: 4,
    gap: 8,
    marginBottom: 12,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  segmentItemActive: {
    backgroundColor: theme.colors.neutral0,
  },
  segmentItemPressed: {
    opacity: 0.7,
  },
  listRow: {
    gap: 12,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth:1,
    borderColor: theme.colors.neutral2,
    borderTopRightRadius:30,
    borderTopLeftRadius:20,
    borderBottomRightRadius:10,
    borderBottomLeftRadius:20,
    padding: 8, 
    paddingLeft:12,
    paddingVertical:6,
    paddingRight: 25,
  },
  addButtonPressed: {
    opacity: 0.7,
  },
  addButtonLabel: {
    color: theme.colors.whiteOrBlack,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rowContent: {
    flex: 1,
    gap: 0,
  },
  rowName: {
    // Use semibold type sizing from ThemedText + tighter lineHeight like Postcard
    lineHeight: 16,
    color: theme.colors.title,
  },
  rowUsername: {
    // Do not reduce opacity so colors from usernameLetters/usernameNumbers match profile
    opacity: 1,
  },
  usernameLetters: {
    color: theme.colors.title,
  },
  usernameNumbers: {
    color: theme.colors.primary,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  rowBio: {
    opacity: 0.75,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.neutral0,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.neutral,
    marginVertical: 12,
  },
  // Outer combined container for the add-contact username inputs
  usernameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 'auto',
    borderWidth: 1,
    borderColor: theme.colors.neutral,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 0,
  },
  // Letters part: 4 characters
  usernameLettersInput: {
    width: 60, // ~4 chars
    paddingHorizontal: 0,
    marginRight: 3, 
    letterSpacing: 1,
    height: 32,
    textAlign:'right',
    color: theme.colors.text,
  },
  // Numbers part: 6 digits
  usernameNumbersInput: {
    width: 300,
    paddingHorizontal: 0,
    letterSpacing: 1,
    height: 32,
    color: theme.colors.text,
  },
  // Legacy single input (kept for safety but not used by the new flow)
  addInput: {
    borderWidth: 1,
    borderColor: theme.colors.neutral,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    color: theme.colors.text,
  },
  inputError: {
    color: theme.colors.orange,
    marginTop: 4,
  },
  profileHint: {
    opacity: 0.7,
  },
  actionRow: {
    width: '100%',
    alignItems: 'flex-end',
  },
  actionButton: {
    backgroundColor: theme.colors.icon,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPressed: {
    opacity: 0.1,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: theme.colors.blackOrWhite,
    fontWeight: 'bold',
  },
  errorText: {
    color: theme.colors.orange,
    marginBottom: 12,
  },
}));