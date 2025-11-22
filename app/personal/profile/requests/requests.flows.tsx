import { PersonalContactApi } from '@/lib/personalLib/contactApi/personal.api.contact';
import {
  $contactRequestsState,
  $contactsState,
  type ContactEntry,
  type PendingRequestEntry,
  type SentRequestEntry,
} from '@/state/personalState/contacts/personal.state.contacts';
import { runWithLoading, showConfirmDialog } from '@/utils/commonUtils/util.modal';
import { showContactAlert } from '@/utils/personalUtils/util.contactMessages';
import type { GestureResponderEvent } from 'react-native';

export type RequestsFlowsDeps = {
  contactRequestsState: typeof $contactRequestsState;
  contactsState: typeof $contactsState;
};

export default function CreateRequestsFlows({
  contactRequestsState,
  contactsState,
}: RequestsFlowsDeps) {
  const addContactFromPending = (request: PendingRequestEntry) => {
    const existingContacts = contactsState.contacts.get();
    const isAlreadyContact = existingContacts.some((entry) => entry.id === request.id);

    const existingAddedYou = contactsState.addedYou.get();
    const existingIndex = existingAddedYou.findIndex((entry) => entry.id === request.id);

    const baseEntry: ContactEntry =
      existingIndex !== -1
        ? existingAddedYou[existingIndex]
        : {
            id: request.id,
            name: request.name,
            username: request.username,
            nickname: request.nickname,
            bio: request.bio,
            createdAt: request.requestedAt,
            updatedAt: new Date().toISOString(),
            avatarUrl: request.avatarUrl,
            // Accepting a request means they added you; it does not automatically
            // make the contact mutual until you add them back from "People who added you".
            isMutual: false,
          };

    const updatedEntry: ContactEntry = {
      ...baseEntry,
      // If they are already in your contacts list, the relationship is mutual
      // and the UI should show the mutual badge instead of the add button.
      isMutual: isAlreadyContact,
    };

    if (existingIndex !== -1) {
      const next = [...existingAddedYou];
      next[existingIndex] = updatedEntry;
      contactsState.setAddedYou(next);
    } else {
      contactsState.setAddedYou([...existingAddedYou, updatedEntry]);
    }
  };

  const handleAccept = async (request: PendingRequestEntry) => {
    try {
      const existingContacts = contactsState.contacts.get();
      const isAlreadyContact = existingContacts.some((entry) => entry.id === request.id);

      const displayName =
        request.nickname && request.nickname.trim().length > 0
          ? request.nickname
          : request.name;

      await runWithLoading(() =>
        PersonalContactApi.acceptContactRequest({ contact_user_id: request.id })
      );

      const successMessage = isAlreadyContact
        ? `Request accepted. You and ${displayName} are now mutual contacts.`
        : `Request accepted. ${displayName} can now connect with you.`;

      showContactAlert(null, successMessage);
      const pending = contactRequestsState.pending.get();
      contactRequestsState.setPending(pending.filter((entry) => entry.id !== request.id));
      addContactFromPending(request);
      if (isAlreadyContact) {
        contactsState.setContactMutual(request.id, true);
      }
    } catch (err: any) {
      showContactAlert(err?.response?.data?.message, 'Could not accept request.');
    }
  };

  const handleReject = async (request: PendingRequestEntry) => {
    const confirmed = await showConfirmDialog(`Decline request from ${request.name}?`, {
      confirmVariant: 'destructive',
      confirmText: 'Decline',
    });
    if (!confirmed) return;

    try {
      const response = await runWithLoading(() =>
        PersonalContactApi.rejectContactRequest({ contact_user_id: request.id })
      );
      showContactAlert(response.message, 'Request declined.');
      const pending = contactRequestsState.pending.get();
      contactRequestsState.setPending(pending.filter((entry) => entry.id !== request.id));
      const updatedAddedYou = contactsState.addedYou.get().filter((entry) => entry.id !== request.id);
      contactsState.setAddedYou(updatedAddedYou);
    } catch (err: any) {
      showContactAlert(err?.response?.data?.message, 'Could not decline request.');
    }
  };

  const handleUndo = async (request: SentRequestEntry) => {
    const confirmed = await showConfirmDialog(`Undo request to ${request.name}?`, {
      confirmVariant: 'destructive',
      confirmText: 'Undo',
    });
    if (!confirmed) return;

    try {
      const response = await runWithLoading(() =>
        PersonalContactApi.undoContactRequest({ contact_user_id: request.id })
      );
      showContactAlert(response.message, 'Request undone.');
      const sent = contactRequestsState.sent.get();
      contactRequestsState.setSent(sent.filter((entry) => entry.id !== request.id));
    } catch (err: any) {
      showContactAlert(err?.response?.data?.message, 'Could not undo request.');
    }
  };

  const openPendingActions = async (request: PendingRequestEntry, event?: GestureResponderEvent) => {
    // Inline buttons on the row now handle Accept/Decline directly.
    // Keep this function for future extensions, but do nothing for now.
    return;
  };

  const openSentActions = async (request: SentRequestEntry, event?: GestureResponderEvent) => {
    // Inline Undo button on the row now handles undoing sent requests.
    // Keep this function for future extensions, but do nothing for now.
    return;
  };

  return { openPendingActions, openSentActions, handleAccept, handleReject, handleUndo };
}
