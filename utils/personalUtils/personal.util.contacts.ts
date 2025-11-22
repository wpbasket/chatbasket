import { PersonalContactApi } from '@/lib/personalLib/contactApi/personal.api.contact';
import type {
  PendingContactRequest,
  SentContactRequest,
} from '@/lib/personalLib/models/personal.model.contact';
import {
  $contactRequestsState,
  $contactsState,
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
  } catch (err: any) {
    $contactRequestsState.setError(err?.message ?? 'Failed to load requests.');
  } finally {
    $contactRequestsState.setLoading(false);
  }
}
