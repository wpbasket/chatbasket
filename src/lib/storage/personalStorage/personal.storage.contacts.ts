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
export const initializeContactsStorage = async (): Promise<void> => {
  if (!contactsStorage) {
    contactsStorage = await AppStorage.createSecure<ContactsSchema>("personal-contacts");
  }
}

const getStorage = async (): Promise<AppStorage<ContactsSchema>> => {
  if (!contactsStorage) {
    await initializeContactsStorage();
  }
  return contactsStorage!;
};

export const PersonalStorageSetContacts = async (contactsData?: ContactsPayload): Promise<void> => {
  try {
    const storage = await getStorage();
    const data = contactsData || {
      contacts: $contactsState.contacts.get(),
      addedYou: $contactsState.addedYou.get(),
      lastFetchedAt: $contactsState.lastFetchedAt.get(),
    };
    await storage.set(ContactsKey, data);
  } catch (e) {
    console.error('Failed to set personal contacts:', e);
  }
};

export const PersonalStorageLoadContacts = async (): Promise<void> => {
  try {
    const storage = await getStorage();
    const payload = await storage.get(ContactsKey);

    if (!payload) {
      return;
    }

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
    const storage = await getStorage();
    await storage.remove(ContactsKey);
  } catch (e) {
    console.error('Failed to remove personal contacts:', e);
  }
};

export const PersonalStorageSetContactRequests = async (requestsData?: ContactRequestsPayload): Promise<void> => {
  try {
    const storage = await getStorage();
    const data = requestsData || {
      pending: $contactRequestsState.pending.get(),
      sent: $contactRequestsState.sent.get(),
      lastFetchedAt: $contactRequestsState.lastFetchedAt.get(),
    };
    await storage.set(ContactRequestsKey, data);
  } catch (e) {
    console.error('Failed to set personal contact requests:', e);
  }
};

export const PersonalStorageLoadContactRequests = async (): Promise<void> => {
  try {
    const storage = await getStorage();
    const payload = await storage.get(ContactRequestsKey);

    if (!payload) {
      return;
    }

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
    const storage = await getStorage();
    await storage.remove(ContactRequestsKey);
  } catch (e) {
    console.error('Failed to remove personal contact requests:', e);
  }
};
