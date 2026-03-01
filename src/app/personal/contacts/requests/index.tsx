import Header from '@/components/header/Header';
import { EmptyState } from '@/components/ui/common/EmptyState';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
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
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, RefreshControl } from 'react-native';
import PendingRequestRow from './components/PendingRequestRow';
import RequestsHeaderSummary from './components/RequestsHeaderSummary';
import RequestsSegmentTabs from './components/RequestsSegmentTabs';
import SentRequestRow from './components/SentRequestRow';
import CreateRequestsFlows from './requests.flows';
import styles from './requests.styles';
import { useUnistyles } from 'react-native-unistyles';

export default function ContactRequests() {
  const { rt } = useUnistyles();
  const pendingIds = useValue($contactRequestsState.pendingIds);
  const sentIds = useValue($contactRequestsState.sentIds);
  const loading = useValue($contactRequestsState.loading);
  const error = useValue($contactRequestsState.error);
  const selectedTab = useValue($contactRequestsState.selectedTab);
  const lastFetchedAt = useValue($contactRequestsState.lastFetchedAt);

  useEffect(() => {
    return () => {
      $contactsState.isInContacts.set(false);
    };
  }, []);

  const fetchRequests = useCallback(async () => {
    await Promise.all([
      PersonalUtilFetchContactRequests(),
      PersonalUtilFetchContacts(),
    ]);
  }, []);

  useEffect(() => {
    void fetchRequests();
    return () => {
      modalActions.close();
    };
  }, []);
  const { openPendingActions, openSentActions, handleAccept, handleReject, handleUndo } = CreateRequestsFlows({
    contactRequestsState: $contactRequestsState,
    contactsState: $contactsState,
  });

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
            onAccept={handleAccept}
            onReject={handleReject}
          />
        ) : (
          <SentRequestRow
            id={item}
            onOpenActions={openSentActions}
            onUndo={handleUndo}
          />
        )}
      </ThemedView>
    ),
    [openPendingActions, openSentActions, handleAccept, handleReject, handleUndo, selectedTab]
  );

  const ListEmptyComponent = useCallback(
    () =>
      !loading && !error && lastFetchedAt != null ? (
        <ThemedView style={styles.listRow}>
          {selectedTab === 'pending' ? (
            <EmptyState description='When someone adds you, the request will appear here.' />
          ) : (
            <EmptyState description='Send a request to connect with someone.' />
          )}
        </ThemedView>
      ) : null,
    [error, lastFetchedAt, loading, selectedTab]
  );

  return (
    <ThemedView style={styles.mainContainer}>
      <ThemedView style={{ paddingTop: rt.insets.top }}>
        <Header
          onBackPress={utilGoBack}
          centerSection={<ThemedText type='subtitle'>Requests</ThemedText>}
        />
      </ThemedView>
      <ThemedView style={styles.container}>
        <RequestsHeaderSummary
          pendingCount={pendingIds.length}
          sentCount={sentIds.length}
          error={error}
          lastFetchedAt={lastFetchedAt}
        />

        <RequestsSegmentTabs
          selectedTab={selectedTab}
          onChangeTab={(tab) => $contactRequestsState.setSelectedTab(tab)}
        />

        {error ? (
          <ThemedText style={styles.errorText} selectable={false}>
            {error}
          </ThemedText>
        ) : null}

        <LegendList
          data={listData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
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
  );
}
