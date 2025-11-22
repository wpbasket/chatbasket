import Header from '@/components/header/Header';
import Sidebar from '@/components/sidebar/Sidebar';
import { EmptyState } from '@/components/ui/common/EmptyState';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { authState } from '@/state/auth/state.auth';
import { modalActions } from '@/state/modals/state.modals';
import {
  $contactRequestsState,
  $contactsState,
} from '@/state/personalState/contacts/personal.state.contacts';
import { utilGoBack } from '@/utils/commonUtils/util.router';
import { PersonalUtilFetchContactRequests } from '@/utils/personalUtils/personal.util.contacts';
import { LegendList } from '@legendapp/list';
import { useValue } from '@legendapp/state/react';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';
import { Platform, RefreshControl } from 'react-native';
import PendingRequestRow from './components/PendingRequestRow';
import RequestsHeaderSummary from './components/RequestsHeaderSummary';
import RequestsSegmentTabs from './components/RequestsSegmentTabs';
import SentRequestRow from './components/SentRequestRow';
import CreateRequestsFlows from './requests.flows';
import styles from './requests.styles';

export default function ContactRequests() {
  const pendingIds = useValue($contactRequestsState.pendingIds);
  const sentIds = useValue($contactRequestsState.sentIds);
  const loading = useValue($contactRequestsState.loading);
  const error = useValue($contactRequestsState.error);
  const selectedTab = useValue($contactRequestsState.selectedTab);
  const lastFetchedAt = useValue($contactRequestsState.lastFetchedAt);

  useEffect(() => {
    return () => {
      authState.isInTheProfileUpdateMode.set(false);
    };
  }, []);

  const fetchRequests = useCallback(async () => {
    await PersonalUtilFetchContactRequests();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (lastFetchedAt == null) {
        void fetchRequests();
      }
      return () => {
        modalActions.close();
      };
    }, [fetchRequests, lastFetchedAt])
  );
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
              <ThemedText type='small' style={styles.errorText} selectable={false}>
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
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
  );
}
