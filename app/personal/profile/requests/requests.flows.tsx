import { PersonalContactApi } from '@/lib/personalLib/contactApi/personal.api.contact';
import {
  $contactRequestsState,
  $contactsState,
  type ContactEntry,
  type PendingRequestEntry,
  type SentRequestEntry,
} from '@/state/personalState/contacts/personal.state.contacts';
import { runWithLoading, showConfirmDialog, showControllersModal } from '@/utils/commonUtils/util.modal';
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
    if (existingContacts.some((entry) => entry.id === request.id)) {
      return;
    }

    const newContact: ContactEntry = {
      id: request.id,
      name: request.name,
      username: request.username,
      bio: request.bio,
      createdAt: request.requestedAt,
      updatedAt: new Date().toISOString(),
      avatarUrl: request.avatarUrl,
      isMutual: true,
    };

    contactsState.setContacts([...existingContacts, newContact]);
    const updatedAddedYou = contactsState.addedYou.get().filter((entry) => entry.id !== request.id);
    contactsState.setAddedYou(updatedAddedYou);
  };

  const handleAccept = async (request: PendingRequestEntry) => {
    try {
      const response = await runWithLoading(() =>
        PersonalContactApi.acceptContactRequest({ contact_user_id: request.id })
      );
      showContactAlert(response.message, 'Request accepted.');
      const pending = contactRequestsState.pending.get();
      contactRequestsState.setPending(pending.filter((entry) => entry.id !== request.id));
      addContactFromPending(request);
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
    const position = event
      ? {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        }
      : undefined;

    await showControllersModal(
      [
        {
          id: 'accept',
          label: 'Accept request',
          onPress: () => handleAccept(request),
        },
        {
          id: 'reject',
          label: 'Decline request',
          onPress: () => handleReject(request),
        },
      ],
      {
        position,
        showConfirmButton: false,
        showCancelButton: false,
        closeOnControllerPress: true,
      }
    );
  };

  const openSentActions = async (request: SentRequestEntry, event?: GestureResponderEvent) => {
    if (request.status?.toLowerCase() === 'declined') {
      return;
    }
    const position = event
      ? {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        }
      : undefined;

    await showControllersModal(
      [
        {
          id: 'undo',
          label: 'Undo request',
          onPress: () => handleUndo(request),
        },
      ],
      {
        position,
        showConfirmButton: false,
        showCancelButton: false,
        closeOnControllerPress: true,
      }
    );
  };

  return { openPendingActions, openSentActions };
}
