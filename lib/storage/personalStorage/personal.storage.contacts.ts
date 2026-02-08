import { $contactRequestsState, $contactsState, type ContactEntry, type PendingRequestEntry, type SentRequestEntry } from "@/state/personalState/contacts/personal.state.contacts";
import { AppStorage } from "../storage.wrapper";

const ContactsKey = "personal-contacts";
const ContactRequestsKey = "personal-contact-requests";

type ContactsPayload = {
  contacts: ContactEntry[];
  addedYou: ContactEntry[];
  lastFetchedAt: number | null;
};

type ContactRequestsPayload = {
  pending: PendingRequestEntry[];
  sent: SentRequestEntry[];
  lastFetchedAt: number | null;
};

type ContactsSchema = {
  [ContactsKey]: ContactsPayload;
  [ContactRequestsKey]: ContactRequestsPayload;
};

let contactsStorage: AppStorage<ContactsSchema> | null = null;
const debugPrefix = '[PersonalContactsStorage]';

export const initializeContactsStorage = async (): Promise<void> => {
  if (!contactsStorage) {
    console.log(debugPrefix, 'initializing secure storage instance');
    contactsStorage = await AppStorage.createSecure<ContactsSchema>("personal-contacts");
  } else {
    console.log(debugPrefix, 'initializeContactsStorage called but storage already set');
  }
}

const getStorage = async (): Promise<AppStorage<ContactsSchema>> => {
  if (!contactsStorage) {
    console.log(debugPrefix, 'getStorage -> storage missing, initializing now');
    await initializeContactsStorage();
  }
  console.log(debugPrefix, 'getStorage -> returning instance');
  return contactsStorage!;
};

export const PersonalStorageSetContacts = async (contactsData?: ContactsPayload): Promise<void> => {
  try {
    console.log(debugPrefix, 'setContacts invoked', { providedPayload: Boolean(contactsData) });
    const storage = await getStorage();
    const data = contactsData || {
      contacts: $contactsState.contacts.get(),
      addedYou: $contactsState.addedYou.get(),
      lastFetchedAt: $contactsState.lastFetchedAt.get(),
    };
    console.log(debugPrefix, 'persisting contacts payload', {
      contacts: data.contacts.length,
      addedYou: data.addedYou.length,
      lastFetchedAt: data.lastFetchedAt,
    });
    await storage.set(ContactsKey, data);
  } catch (e) {
    console.error('Failed to set personal contacts:', e);
  }
};

export const PersonalStorageLoadContacts = async (): Promise<void> => {
  try {
    console.log(debugPrefix, 'loadContacts invoked');
    const storage = await getStorage();
    const payload = await storage.get(ContactsKey);

    if (!payload) {
      console.log(debugPrefix, 'loadContacts -> no payload found');
      return;
    }

    console.log(debugPrefix, 'loadContacts -> payload found', {
      contacts: payload.contacts?.length ?? 0,
      addedYou: payload.addedYou?.length ?? 0,
      lastFetchedAt: payload.lastFetchedAt,
    });

    if (payload.contacts) $contactsState.setContacts(payload.contacts);
    if (payload.addedYou) $contactsState.setAddedYou(payload.addedYou);
    if (typeof payload.lastFetchedAt === "number") {
      $contactsState.lastFetchedAt.set(payload.lastFetchedAt);
    }
  } catch (e) {
    console.error('Failed to load personal contacts:', e);
  }
};

export const PersonalStorageRemoveContacts = async (): Promise<void> => {
  try {
    console.log(debugPrefix, 'removeContacts invoked');
    const storage = await getStorage();
    await storage.remove(ContactsKey);
  } catch (e) {
    console.error('Failed to remove personal contacts:', e);
  }
};

export const PersonalStorageSetContactRequests = async (requestsData?: ContactRequestsPayload): Promise<void> => {
  try {
    console.log(debugPrefix, 'setContactRequests invoked', { providedPayload: Boolean(requestsData) });
    const storage = await getStorage();
    const data = requestsData || {
      pending: $contactRequestsState.pending.get(),
      sent: $contactRequestsState.sent.get(),
      lastFetchedAt: $contactRequestsState.lastFetchedAt.get(),
    };
    console.log(debugPrefix, 'persisting contact requests payload', {
      pending: data.pending.length,
      sent: data.sent.length,
      lastFetchedAt: data.lastFetchedAt,
    });
    await storage.set(ContactRequestsKey, data);
  } catch (e) {
    console.error('Failed to set personal contact requests:', e);
  }
};

export const PersonalStorageLoadContactRequests = async (): Promise<void> => {
  try {
    console.log(debugPrefix, 'loadContactRequests invoked');
    const storage = await getStorage();
    const payload = await storage.get(ContactRequestsKey);

    if (!payload) {
      console.log(debugPrefix, 'loadContactRequests -> no payload found');
      return;
    }

    console.log(debugPrefix, 'loadContactRequests -> payload found', {
      pending: payload.pending?.length ?? 0,
      sent: payload.sent?.length ?? 0,
      lastFetchedAt: payload.lastFetchedAt,
    });

    if (payload.pending) $contactRequestsState.setPending(payload.pending);
    if (payload.sent) $contactRequestsState.setSent(payload.sent);
    if (typeof payload.lastFetchedAt === "number") {
      $contactRequestsState.lastFetchedAt.set(payload.lastFetchedAt);
    }
  } catch (e) {
    console.error('Failed to load personal contact requests:', e);
  }
};

export const PersonalStorageRemoveContactRequests = async (): Promise<void> => {
  try {
    console.log(debugPrefix, 'removeContactRequests invoked');
    const storage = await getStorage();
    await storage.remove(ContactRequestsKey);
  } catch (e) {
    console.error('Failed to remove personal contact requests:', e);
  }
};
