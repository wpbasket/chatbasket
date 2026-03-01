import { observable } from '@legendapp/state';

export type ContactEntry = {
  id: string;
  name: string;
  username: string;
  nickname: string | null;
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
  nickname: string | null;
  bio: string | null;
  requestedAt: string;
  updatedAt: string;
  avatarUrl: string | null;
  status: string;
};

export type SentRequestEntry = PendingRequestEntry;

export const $contactsState = observable({
  isInContacts: false,
  contacts: [] as ContactEntry[],
  addedYou: [] as ContactEntry[],
  contactsById: {} as Record<string, ContactEntry>,
  addedYouById: {} as Record<string, ContactEntry>,
  contactsIds: [] as string[],
  addedYouIds: [] as string[],
  loading: false,
  error: null as string | null,
  lastFetchedAt: null as number | null,
  selectedTab: 'contacts' as 'contacts' | 'addedYou',
  setLoading(value: boolean) {
    $contactsState.loading.set(value);
  },
  setError(value: string | null) {
    $contactsState.error.set(value);
  },
  setContacts(entries: ContactEntry[]) {
    const sorted = [...entries].sort((a, b) => {
      const aName = ((a.nickname ?? a.name) ?? '').toLowerCase();
      const bName = ((b.nickname ?? b.name) ?? '').toLowerCase();
      if (aName < bName) return -1;
      if (aName > bName) return 1;
      const aUsername = (a.username ?? '').toLowerCase();
      const bUsername = (b.username ?? '').toLowerCase();
      if (aUsername < bUsername) return -1;
      if (aUsername > bUsername) return 1;
      return a.id.localeCompare(b.id);
    });

    $contactsState.contacts.set(sorted);
    const byId: Record<string, ContactEntry> = {};
    for (const entry of sorted) {
      byId[entry.id] = entry;
    }
    $contactsState.contactsById.set(byId);
    $contactsState.contactsIds.set(sorted.map((entry) => entry.id));
  },
  setAddedYou(entries: ContactEntry[]) {
    const sorted = [...entries].sort((a, b) => {
      const aName = ((a.nickname ?? a.name) ?? '').toLowerCase();
      const bName = ((b.nickname ?? b.name) ?? '').toLowerCase();
      if (aName < bName) return -1;
      if (aName > bName) return 1;
      const aUsername = (a.username ?? '').toLowerCase();
      const bUsername = (b.username ?? '').toLowerCase();
      if (aUsername < bUsername) return -1;
      if (aUsername > bUsername) return 1;
      return a.id.localeCompare(b.id);
    });

    $contactsState.addedYou.set(sorted);
    const byId: Record<string, ContactEntry> = {};
    for (const entry of sorted) {
      byId[entry.id] = entry;
    }
    $contactsState.addedYouById.set(byId);
    $contactsState.addedYouIds.set(sorted.map((entry) => entry.id));
  },
  setContactMutual(id: string, isMutual: boolean) {
    const byId = $contactsState.contactsById[id];
    if (byId) {
      byId.isMutual.set(isMutual);
    }

    const contacts = $contactsState.contacts.get();
    const index = contacts.findIndex((entry) => entry.id === id);
    if (index !== -1) {
      $contactsState.contacts[index].isMutual.set(isMutual);
    }
  },
  setAddedYouMutual(id: string, isMutual: boolean) {
    const byId = $contactsState.addedYouById[id];
    if (byId) {
      byId.isMutual.set(isMutual);
    }

    const addedYou = $contactsState.addedYou.get();
    const index = addedYou.findIndex((entry) => entry.id === id);
    if (index !== -1) {
      $contactsState.addedYou[index].isMutual.set(isMutual);
    }
  },
  setSelectedTab(tab: 'contacts' | 'addedYou') {
    $contactsState.selectedTab.set(tab);
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
    $contactsState.selectedTab.set('contacts');
    $contactsState.isInContacts.set(false);
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
    const sorted = [...entries].sort((a, b) => {
      const aName = ((a.nickname ?? a.name) ?? '').toLowerCase();
      const bName = ((b.nickname ?? b.name) ?? '').toLowerCase();
      if (aName < bName) return -1;
      if (aName > bName) return 1;
      const aUsername = (a.username ?? '').toLowerCase();
      const bUsername = (b.username ?? '').toLowerCase();
      if (aUsername < bUsername) return -1;
      if (aUsername > bUsername) return 1;
      return a.id.localeCompare(b.id);
    });

    $contactRequestsState.pending.set(sorted);
    const byId: Record<string, PendingRequestEntry> = {};
    for (const entry of sorted) {
      byId[entry.id] = entry;
    }
    $contactRequestsState.pendingById.set(byId);
    $contactRequestsState.pendingIds.set(sorted.map((entry) => entry.id));
  },
  setSent(entries: SentRequestEntry[]) {
    const sorted = [...entries].sort((a, b) => {
      const aName = ((a.nickname ?? a.name) ?? '').toLowerCase();
      const bName = ((b.nickname ?? b.name) ?? '').toLowerCase();
      if (aName < bName) return -1;
      if (aName > bName) return 1;
      const aUsername = (a.username ?? '').toLowerCase();
      const bUsername = (b.username ?? '').toLowerCase();
      if (aUsername < bUsername) return -1;
      if (aUsername > bUsername) return 1;
      return a.id.localeCompare(b.id);
    });

    $contactRequestsState.sent.set(sorted);
    const byId: Record<string, SentRequestEntry> = {};
    for (const entry of sorted) {
      byId[entry.id] = entry;
    }
    $contactRequestsState.sentById.set(byId);
    $contactRequestsState.sentIds.set(sorted.map((entry) => entry.id));
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
