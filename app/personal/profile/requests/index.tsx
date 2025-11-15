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
import type { PendingContactRequest, SentContactRequest } from '@/lib/personalLib/models/personal.model.contact';
import { authState } from '@/state/auth/state.auth';
import { modalActions } from '@/state/modals/state.modals';
import {
  $contactRequestsState,
  $contactsState,
  type PendingRequestEntry,
  type SentRequestEntry,
} from '@/state/personalState/contacts/personal.state.contacts';
import { formatRelativeTimeShort } from '@/utils/commonUtils/util.date';
import { utilGoBack } from '@/utils/commonUtils/util.router';
import { LegendList } from '@legendapp/list';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo } from 'react';
import { GestureResponderEvent, Platform, Pressable, RefreshControl } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import CreateRequestsFlows from './requests.flows';

type PendingRowProps = {
  id: string;
  onOpenActions: (item: PendingRequestEntry, event?: GestureResponderEvent) => void;
};

type SentRowProps = {
  id: string;
  onOpenActions: (item: SentRequestEntry, event?: GestureResponderEvent) => void;
};

function PendingRequestRow({ id, onOpenActions }: PendingRowProps) {
  const { handlePressIn } = pressableAnimation();
  const item = useLegend$($contactRequestsState.pendingById[id]);

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
        <ThemedText type='small' style={styles.meta} selectable={false}>
          Requested {formatRelativeTimeShort(item.requestedAt)}
        </ThemedText>
        {/* Bio intentionally hidden in pending request card */}
      </ThemedView>
      <FontAwesome5Icon name='account.friends' size={16} />
    </Pressable>
  );
}

function SentRequestRow({ id, onOpenActions }: SentRowProps) {
  const { handlePressIn } = pressableAnimation();
  const item = useLegend$($contactRequestsState.sentById[id]);
  if (!item) {
    return null;
  }

  const status = item.status?.toLowerCase();
  const disabled = status === 'declined';

  const displayName = item.nickname ?? item.name;
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        disabled ? styles.rowDisabled : null,
        { opacity: pressed ? 0.1 : 1 },
      ]}
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
        <ThemedText type='small' style={styles.meta} selectable={false}>
          Sent {formatRelativeTimeShort(item.requestedAt)}
        </ThemedText>
        {/* Bio intentionally hidden in sent request card */}
        {status === 'declined' ? (
          <ThemedView style={[styles.badge, styles.badgeDeclined]}>
            <ThemedText type='small' selectable={false} style={styles.badgeText}>
              Declined
            </ThemedText>
          </ThemedView>
        ) : status === 'accepted' ? (
          <ThemedView style={[styles.badge, styles.badgeAccepted]}>
            <ThemedText type='small' selectable={false} style={styles.badgeText}>
              Accepted
            </ThemedText>
          </ThemedView>
        ) : null}
      </ThemedView>
      <FontAwesome5Icon name='list' size={16} />
    </Pressable>
  );
}
export default function ContactRequests() {
  const pendingIds = useLegend$($contactRequestsState.pendingIds);
  const sentIds = useLegend$($contactRequestsState.sentIds);
  const loading = useLegend$($contactRequestsState.loading);
  const error = useLegend$($contactRequestsState.error);
  const selectedTab = useLegend$($contactRequestsState.selectedTab);

  useEffect(() => {
    return () => {
      authState.isInTheProfileUpdateMode.set(false);
    };
  }, []);

  const fetchRequests = useCallback(async () => {
    try {
      $contactRequestsState.setLoading(true);
      $contactRequestsState.setError(null);
      const response = await PersonalContactApi.getContactRequests();

      const toPendingEntry = (entry: PendingContactRequest): PendingRequestEntry => ({
        id: entry.id,
        name: entry.name,
        username: entry.username,
        nickname: entry.nickname,
        bio: entry.bio,
        requestedAt: entry.requested_at,
        updatedAt: entry.updated_at,
        avatarUrl: entry.avatar_url ?? null,
        status: entry.status,
      });

      const toSentEntry = (entry: SentContactRequest): SentRequestEntry => ({
        id: entry.id,
        name: entry.name,
        username: entry.username,
        nickname: entry.nickname,
        bio: entry.bio,
        requestedAt: entry.requested_at,
        updatedAt: entry.updated_at,
        avatarUrl: entry.avatar_url ?? null,
        status: entry.status,
      });

      $contactRequestsState.setPending(response.pending_requests.map(toPendingEntry));

      const existingContactIds = new Set($contactsState.contacts.get().map((c) => c.id));
      const sentFiltered = response.sent_requests
        .map(toSentEntry)
        .filter((s) => !existingContactIds.has(s.id));
      $contactRequestsState.setSent(sentFiltered);
      $contactRequestsState.markFetched();
    } catch (err: any) {
      $contactRequestsState.setError(err?.message ?? 'Failed to load requests.');
    } finally {
      $contactRequestsState.setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchRequests();
      return () => {
        modalActions.close();
      };
    }, [fetchRequests])
  );
  const { openPendingActions, openSentActions } = CreateRequestsFlows({
    contactRequestsState: $contactRequestsState,
    contactsState: $contactsState,
  });

  const tabCounts = useMemo(
    () => ({
      pending: pendingIds.length,
      sent: sentIds.length,
    }),
    [pendingIds.length, sentIds.length]
  );

  const listData = selectedTab === 'pending' ? pendingIds : sentIds;

  const keyExtractor = useCallback(
    (id: string) => id,
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <ThemedView style={styles.listRow}>
        {selectedTab === 'pending' ? (
          <PendingRequestRow
            id={item}
            onOpenActions={openPendingActions}
          />
        ) : (
          <SentRequestRow
            id={item}
            onOpenActions={openSentActions}
          />
        )}
      </ThemedView>
    ),
    [openPendingActions, openSentActions, selectedTab]
  );

  const ListHeader = useCallback(
    () => (
      <>
        {error ? (
          <ThemedText type='small' style={styles.errorText} selectable={false}>
            {error}
          </ThemedText>
        ) : null}

        <ThemedView style={styles.segmentContainer}>
          {(['pending', 'sent'] as const).map((tab) => {
            const isActive = selectedTab === tab;
            return (
              <Pressable
                key={tab}
                style={({ pressed }) => [
                  { opacity: pressed ? 0.1 : 1 },
                  styles.segmentItem,
                  isActive ? styles.segmentItemActive : undefined,
                ]}
                onPress={() => $contactRequestsState.setSelectedTab(tab)}
              >
                <ThemedText type='smallBold' selectable={false}>
                  {tab === 'pending' ? 'Pending' : 'Sent'} ({tabCounts[tab]})
                </ThemedText>
              </Pressable>
            );
          })}
        </ThemedView>
      </>
    ),
    [error, selectedTab, tabCounts]
  );

  const ListEmptyComponent = useCallback(
    () =>
      !loading ? (
        <ThemedView style={styles.listRow}>
          {selectedTab === 'pending' ? (
            <EmptyState description='When someone adds you, the request will appear here.' />
          ) : (
            <EmptyState description='Send a request to connect with someone.' />
          )}
        </ThemedView>
      ) : null,
    [loading, selectedTab]
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
            Icon={<ThemedText type='subtitle'>Requests</ThemedText>}
          />

          <ThemedView style={styles.container}>
            <LegendList
              data={listData}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              ListHeaderComponent={ListHeader}
              ListEmptyComponent={ListEmptyComponent}
              contentContainerStyle={styles.listContent}
              recycleItems={true}
              maintainVisibleContentPosition={true}
              showsVerticalScrollIndicator={Platform.OS === 'web' ? false : true}
              refreshControl={
                <RefreshControl refreshing={loading} onRefresh={fetchRequests} />
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
  errorText: {
    color: theme.colors.orange,
    marginBottom: 12,
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
    // Use semibold type sizing from ThemedText (same as Postcard)
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
  meta: {
    fontSize: 11,
    opacity: 0.7,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.neutral,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 6,
    backgroundColor: theme.colors.neutral0,
  },
  badgeDeclined: {
    backgroundColor: theme.colors.orange,
  },
  badgeAccepted: {
    backgroundColor: theme.colors.green,
  },
  badgeText: {
    color: theme.colors.white,
    fontWeight: '600',
  },
}));
