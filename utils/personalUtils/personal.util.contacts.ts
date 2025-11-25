import { PersonalContactApi } from '@/lib/personalLib/contactApi/personal.api.contact';
import type {
  Contact,
  PendingContactRequest,
  SentContactRequest,
} from '@/lib/personalLib/models/personal.model.contact';
import {
  PersonalStorageLoadContactRequests,
  PersonalStorageLoadContacts,
  PersonalStorageSetContactRequests,
  PersonalStorageSetContacts,
} from '@/lib/storage/personalStorage/personal.storage.contacts';
import {
  $contactRequestsState,
  $contactsState,
  type ContactEntry,
  type PendingRequestEntry,
  type SentRequestEntry,
} from '@/state/personalState/contacts/personal.state.contacts';

export async function PersonalUtilFetchContactRequests() {
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

    const existingContactIds = new Set($contactsState.contactsIds.get());
    const sentFiltered = response.sent_requests
      .map(toSentEntry)
      .filter((s) => !existingContactIds.has(s.id));
    $contactRequestsState.setSent(sentFiltered);
    $contactRequestsState.markFetched();
    await PersonalStorageSetContactRequests();
  } catch (err: any) {
    $contactRequestsState.setError(err?.message ?? 'Failed to load requests.');
    await PersonalStorageLoadContactRequests();
  } finally {
    $contactRequestsState.setLoading(false);
  }
}

export async function PersonalUtilFetchContacts() {
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
    await PersonalStorageSetContacts();
  } catch (err: any) {
    $contactsState.setError(err?.message ?? 'Failed to load contacts.');
    await PersonalStorageLoadContacts();
  } finally {
    $contactsState.setLoading(false);
  }
}
