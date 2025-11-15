import { observable } from '@legendapp/state';

export type ContactEntry = {
  id: string;
  name: string;
  username: string;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
  avatarUrl: string | null;
  isMutual: boolean;
};

export type PendingRequestEntry = {
  id: string;
  name: string;
  username: string;
  bio: string | null;
  requestedAt: string;
  updatedAt: string;
  avatarUrl: string | null;
  status: string;
};

export type SentRequestEntry = PendingRequestEntry;

export const $contactsState = observable({
  contacts: [] as ContactEntry[],
  addedYou: [] as ContactEntry[],
  contactsById: {} as Record<string, ContactEntry>,
  addedYouById: {} as Record<string, ContactEntry>,
  contactsIds: [] as string[],
  addedYouIds: [] as string[],
  loading: false,
  error: null as string | null,
  lastFetchedAt: null as number | null,
  setLoading(value: boolean) {
    $contactsState.loading.set(value);
  },
  setError(value: string | null) {
    $contactsState.error.set(value);
  },
  setContacts(entries: ContactEntry[]) {
    $contactsState.contacts.set(entries);
    const byId: Record<string, ContactEntry> = {};
    for (const entry of entries) {
      byId[entry.id] = entry;
    }
    $contactsState.contactsById.set(byId);
    $contactsState.contactsIds.set(entries.map((entry) => entry.id));
  },
  setAddedYou(entries: ContactEntry[]) {
    $contactsState.addedYou.set(entries);
    const byId: Record<string, ContactEntry> = {};
    for (const entry of entries) {
      byId[entry.id] = entry;
    }
    $contactsState.addedYouById.set(byId);
    $contactsState.addedYouIds.set(entries.map((entry) => entry.id));
  },
  markFetched() {
    $contactsState.lastFetchedAt.set(Date.now());
  },
  reset() {
    $contactsState.contacts.set([]);
    $contactsState.addedYou.set([]);
    $contactsState.contactsById.set({});
    $contactsState.addedYouById.set({});
    $contactsState.contactsIds.set([]);
    $contactsState.addedYouIds.set([]);
    $contactsState.loading.set(false);
    $contactsState.error.set(null);
    $contactsState.lastFetchedAt.set(null);
  },
  hasContacts() {
    return $contactsState.contacts.get().length > 0;
  },
  hasAddedYou() {
    return $contactsState.addedYou.get().length > 0;
  },
});

export const $contactRequestsState = observable({
  pending: [] as PendingRequestEntry[],
  sent: [] as SentRequestEntry[],
  pendingById: {} as Record<string, PendingRequestEntry>,
  sentById: {} as Record<string, SentRequestEntry>,
  pendingIds: [] as string[],
  sentIds: [] as string[],
  loading: false,
  error: null as string | null,
  lastFetchedAt: null as number | null,
  selectedTab: 'pending' as 'pending' | 'sent',
  setLoading(value: boolean) {
    $contactRequestsState.loading.set(value);
  },
  setError(value: string | null) {
    $contactRequestsState.error.set(value);
  },
  setPending(entries: PendingRequestEntry[]) {
    $contactRequestsState.pending.set(entries);
    const byId: Record<string, PendingRequestEntry> = {};
    for (const entry of entries) {
      byId[entry.id] = entry;
    }
    $contactRequestsState.pendingById.set(byId);
    $contactRequestsState.pendingIds.set(entries.map((entry) => entry.id));
  },
  setSent(entries: SentRequestEntry[]) {
    $contactRequestsState.sent.set(entries);
    const byId: Record<string, SentRequestEntry> = {};
    for (const entry of entries) {
      byId[entry.id] = entry;
    }
    $contactRequestsState.sentById.set(byId);
    $contactRequestsState.sentIds.set(entries.map((entry) => entry.id));
  },
  setSelectedTab(tab: 'pending' | 'sent') {
    $contactRequestsState.selectedTab.set(tab);
  },
  markFetched() {
    $contactRequestsState.lastFetchedAt.set(Date.now());
  },
  reset() {
    $contactRequestsState.pending.set([]);
    $contactRequestsState.sent.set([]);
    $contactRequestsState.pendingById.set({});
    $contactRequestsState.sentById.set({});
    $contactRequestsState.pendingIds.set([]);
    $contactRequestsState.sentIds.set([]);
    $contactRequestsState.loading.set(false);
    $contactRequestsState.error.set(null);
    $contactRequestsState.lastFetchedAt.set(null);
    $contactRequestsState.selectedTab.set('pending');
  },
  hasPending() {
    return $contactRequestsState.pending.get().length > 0;
  },
  hasSent() {
    return $contactRequestsState.sent.get().length > 0;
  },
});
