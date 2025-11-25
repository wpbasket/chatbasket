import { $contactRequestsState, $contactsState, type ContactEntry, type PendingRequestEntry, type SentRequestEntry } from "@/state/personalState/contacts/personal.state.contacts";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { MMKV } from "react-native-mmkv";
import { getSecureMMKV } from "../commonStorage/storage.secure";

const ContactsKey = "personal-contacts";
const ContactRequestsKey = "personal-contact-requests";
const ENCRYPTION_KEY_NAME = "mmkv-personal-contacts-key";
const isWeb = Platform.OS === "web";
let contactsStorage: MMKV | null = null;

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

const getContactsStorage = async (): Promise<MMKV | null> => {
  if (isWeb) return null;
  if (contactsStorage) return contactsStorage;

  const storage = await getSecureMMKV({
    id: "personal-contacts",
    encryptionKeyName: ENCRYPTION_KEY_NAME,
  });

  if (!storage) {
    return null;
  }

  try {
    storage.set("__mmkv_personal_contacts_check", "ok");
    const val = storage.getString("__mmkv_personal_contacts_check");
    storage.delete("__mmkv_personal_contacts_check");
    if (val !== "ok") {
      throw new Error("MMKV personal contacts verification failed (read mismatch)");
    }
  } catch (err) {
    console.log("Failed to verify personal contacts storage:", err);
    return null;
  }

  contactsStorage = storage;
  return contactsStorage;
};

export const PersonalStorageSetContacts = async (): Promise<void> => {
  const payload: ContactsPayload = {
    contacts: $contactsState.contacts.get(),
    addedYou: $contactsState.addedYou.get(),
    lastFetchedAt: $contactsState.lastFetchedAt.get(),
  };

  try {
    const serialized = JSON.stringify(payload);
    if (isWeb) {
      await AsyncStorage.setItem(ContactsKey, serialized);
    } else {
      const storage = await getContactsStorage();
      if (!storage) return;
      storage.set(ContactsKey, serialized);
    }
  } catch {
  }
};

export const PersonalStorageLoadContacts = async (): Promise<void> => {
  try {
    let raw: string | null | undefined;
    if (isWeb) {
      raw = await AsyncStorage.getItem(ContactsKey);
    } else {
      const storage = await getContactsStorage();
      if (!storage) return;
      raw = storage.getString(ContactsKey);
    }

    if (!raw) return;

    const payload = JSON.parse(raw) as Partial<ContactsPayload>;

    if (payload.contacts) {
      $contactsState.setContacts(payload.contacts);
    }
    if (payload.addedYou) {
      $contactsState.setAddedYou(payload.addedYou);
    }
    if (typeof payload.lastFetchedAt === "number") {
      $contactsState.lastFetchedAt.set(payload.lastFetchedAt);
    }
  } catch {
  }
};

export const PersonalStorageRemoveContacts = async (): Promise<void> => {
  try {
    if (isWeb) {
      await AsyncStorage.removeItem(ContactsKey);
    } else {
      const storage = await getContactsStorage();
      if (!storage) return;
      storage.delete(ContactsKey);
    }
  } catch {
  }
};

export const PersonalStorageSetContactRequests = async (): Promise<void> => {
  const payload: ContactRequestsPayload = {
    pending: $contactRequestsState.pending.get(),
    sent: $contactRequestsState.sent.get(),
    lastFetchedAt: $contactRequestsState.lastFetchedAt.get(),
  };

  try {
    const serialized = JSON.stringify(payload);
    if (isWeb) {
      await AsyncStorage.setItem(ContactRequestsKey, serialized);
    } else {
      const storage = await getContactsStorage();
      if (!storage) return;
      storage.set(ContactRequestsKey, serialized);
    }
  } catch {
  }
};

export const PersonalStorageLoadContactRequests = async (): Promise<void> => {
  try {
    let raw: string | null | undefined;
    if (isWeb) {
      raw = await AsyncStorage.getItem(ContactRequestsKey);
    } else {
      const storage = await getContactsStorage();
      if (!storage) return;
      raw = storage.getString(ContactRequestsKey);
    }

    if (!raw) return;

    const payload = JSON.parse(raw) as Partial<ContactRequestsPayload>;

    if (payload.pending) {
      $contactRequestsState.setPending(payload.pending);
    }
    if (payload.sent) {
      $contactRequestsState.setSent(payload.sent);
    }
    if (typeof payload.lastFetchedAt === "number") {
      $contactRequestsState.lastFetchedAt.set(payload.lastFetchedAt);
    }
  } catch {
  }
};

export const PersonalStorageRemoveContactRequests = async (): Promise<void> => {
  try {
    if (isWeb) {
      await AsyncStorage.removeItem(ContactRequestsKey);
    } else {
      const storage = await getContactsStorage();
      if (!storage) return;
      storage.delete(ContactRequestsKey);
    }
  } catch {
  }
};
