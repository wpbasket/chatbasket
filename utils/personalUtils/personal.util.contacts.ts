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

    const existingContactIds = new Set($contactsState.contactsIds.get());
    const sentFiltered = response.sent_requests
      .map(toSentEntry)
      .filter((s) => !existingContactIds.has(s.id));

    const requestsPayload = {
      pending: response.pending_requests.map(toPendingEntry),
      sent: sentFiltered,
      lastFetchedAt: Date.now(),
    };
    $contactRequestsState.setPending(requestsPayload.pending);
    $contactRequestsState.setSent(requestsPayload.sent);
    $contactRequestsState.markFetched();
    await PersonalStorageSetContactRequests(requestsPayload);
  } catch (err: any) {
    await PersonalStorageLoadContactRequests();

    const hasPreviousData =
      $contactRequestsState.lastFetchedAt.get() != null ||
      $contactRequestsState.hasPending() ||
      $contactRequestsState.hasSent();

    if (hasPreviousData) {
      $contactRequestsState.setError('Failed to refresh. You are seeing last fetched requests.');
    } else {
      $contactRequestsState.setError(err?.message ?? 'Failed to load requests.');
    }
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

    const contactsPayload = {
      contacts: response.contacts.map(toEntry),
      addedYou: response.people_who_added_you.map(toEntry),
      lastFetchedAt: Date.now(),
    };
    $contactsState.setContacts(contactsPayload.contacts);
    $contactsState.setAddedYou(contactsPayload.addedYou);
    $contactsState.markFetched();
    await PersonalStorageSetContacts(contactsPayload);
  } catch (err: any) {
    await PersonalStorageLoadContacts();

    const hasPreviousData =
      $contactsState.lastFetchedAt.get() != null ||
      $contactsState.hasContacts() ||
      $contactsState.hasAddedYou();

    if (hasPreviousData) {
      $contactsState.setError('Failed to refresh. You are seeing last fetched contacts.');
    } else {
      $contactsState.setError(err?.message ?? 'Failed to load contacts.');
    }
  } finally {
    $contactsState.setLoading(false);
  }
}
