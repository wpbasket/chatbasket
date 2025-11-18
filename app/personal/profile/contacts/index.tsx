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
  $contactRequestsState,
  $contactsState,
  type ContactEntry,
} from '@/state/personalState/contacts/personal.state.contacts';
import { utilGoBack } from '@/utils/commonUtils/util.router';
import { PersonalUtilFetchContactRequests } from '@/utils/personalUtils/personal.util.contacts';
import { LegendList } from '@legendapp/list';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
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
  const lastFetchedAt = useLegend$($contactsState.lastFetchedAt);
  const pendingIds = useLegend$($contactRequestsState.pendingIds);

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

  const fetchRequests = useCallback(async () => {
    await PersonalUtilFetchContactRequests();
  }, []);

  const { openAddContact, openActionsFromContacts, openActionsFromAddedYou } = CreateContactsFlows({
    fetchContacts,
    styles,
    handlePressIn: handlePressInModal,
  });

  const openRequestsFromContacts = () => {
    authState.isInTheProfileUpdateMode.set(true);
    return router.push('/personal/profile/requests');
  };

  useFocusEffect(
    useCallback(() => {
      void fetchContacts();
      void fetchRequests();
      return () => {
        modalActions.close();
      };
    }, [fetchContacts, fetchRequests])
  );

  const listData = useMemo<ContactsListItem[]>(() => {
    const items: ContactsListItem[] = [];
    if (error) {
      items.push({ kind: 'error', id: 'error' });
    }

    if (selectedTab === 'contacts') {
      if (!loading && !error && contactsIds.length === 0 && lastFetchedAt != null) {
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
      if (!loading && !error && addedYouIds.length === 0 && lastFetchedAt != null) {
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
  }, [addedYouIds, contactsIds, error, lastFetchedAt, loading, selectedTab]);

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
            <ThemedView style={styles.headerSection}>
              <ThemedView style={styles.headerText}>
                <Pressable
                  onPress={openRequestsFromContacts}
                  style={({ pressed }) => [
                    styles.pendingPill,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <ThemedText
                    type='small'
                    style={styles.pendingPillText}
                    selectable={false}
                  >
                    {'Pending requests: '}
                    <ThemedText
                      type='small'
                      style={
                        pendingIds.length === 0
                          ? styles.pendingPillTextPrimary
                          : styles.pendingPillTextWarning
                      }
                      selectable={false}
                    >
                      {pendingIds.length}{'  '}
                    </ThemedText>
                  </ThemedText>
                </Pressable>

                <ThemedText type='small' style={styles.headerSubtitle} selectable={false}>
                  {lastFetchedAt != null && !error
                    ? selectedTab === 'contacts'
                      ? contactsIds.length === 0
                        ? "You haven't added anyone yet."
                        : `${contactsIds.length} saved contact${contactsIds.length === 1 ? '' : 's'}.`
                      : addedYouIds.length === 0
                        ? 'No one has added you yet.'
                        : `${addedYouIds.length} person${addedYouIds.length === 1 ? '' : 's'} added you.`
                    : ''}
                </ThemedText>
              </ThemedView>
              <ThemedView style={styles.addButtonRow}>
                {selectedTab === 'contacts' ? (
                  <Pressable
                    onPress={openAddContact}
                    style={({ pressed }) => [
                      styles.addButton,
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <IconSymbol name='account.add' size={20} />
                    <ThemedText
                      type='small'
                      style={styles.addButtonLabel}
                      selectable={false}
                    >
                      Add contact
                    </ThemedText>
                  </Pressable>
                ) : null}
              </ThemedView>
            </ThemedView>

            <ThemedView style={styles.segmentContainer}>
              {(['contacts', 'addedYou'] as const).map((tab) => {
                const isActive = selectedTab === tab;
                return (
                  <Pressable
                    key={tab}
                    style={({ pressed }) => [
                      { opacity: pressed ? 0.6 : 1 },
                      styles.segmentItem,
                      isActive ? styles.segmentItemActive : undefined,
                    ]}
                    onPress={() => setSelectedTab(tab)}
                  >
                    <ThemedText
                      type='smallBold'
                      style={[
                        styles.segmentLabel,
                        isActive ? styles.segmentLabelActive : undefined,
                      ]}
                      selectable={false}
                    >
                      {tab === 'contacts' ? 'Contacts' : 'People who added you'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ThemedView>
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
  },
  listContent: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 8,
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: theme.colors.title,
    marginBottom: 4,
  },
  headerSubtitle: {
    color: theme.colors.text,
    fontSize: 14,
    paddingLeft: 1,
    opacity: 0.8,
  },
  pendingPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.neutral2,
    borderTopRightRadius: 30,
    borderTopLeftRadius: 20,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginBottom: 4,
  },
  pendingPillText: {
    color: theme.colors.whiteOrBlack,
  },
  pendingPillTextPrimary: {
    color: theme.colors.primary,
  },
  pendingPillTextWarning: {
    color: theme.colors.yellow,
  },
  addButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 36,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.BackgroundSelect,
    borderRadius: 999,
    padding: 4,
    gap: 8,
    marginBottom: 16,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
  },
  segmentItemActive: {
    backgroundColor: theme.colors.neutral0,
  },
  segmentItemPressed: {
    opacity: 0.7,
  },
  segmentLabel: {
    color: theme.colors.text,
    opacity: 0.8,
  },
  segmentLabelActive: {
    color: theme.colors.title,
    opacity: 1,
  },
  segmentCount: {
    color: theme.colors.text,
    opacity: 0.7,
  },
  segmentCountActive: {
    color: theme.colors.primary,
    opacity: 1,
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
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    paddingHorizontal: 8,
    gap: 0,
  },
  // Letters part: 4 characters
  usernameLettersInput: {
    width: 70, // ~4 chars
    paddingHorizontal: 0,
    marginRight: 3,
    letterSpacing: 1,
    height: 40,
    textAlign: 'right',
    color: theme.colors.text,
  },
  // Numbers part: 6 digits
  usernameNumbersInput: {
    width: 300,
    paddingHorizontal: 0,
    letterSpacing: 1,
    height: 40,
    color: theme.colors.primary,
  },
  // Legacy single input (kept for safety but not used by the new flow)
  addInput: {
    borderWidth: 1,
    borderColor: theme.colors.neutral,
    paddingHorizontal: 16,
    // paddingVertical: 10,
    height:40,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
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