import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { PersonalContactApi } from '@/lib/personalLib/contactApi/personal.api.contact';
import {
  $contactRequestsState,
  $contactsState,
  type ContactEntry,
} from '@/state/personalState/contacts/personal.state.contacts';
import { hideModal, runWithLoading, showAlert, showConfirmDialog, showControllersModal } from '@/utils/commonUtils/util.modal';
import { showContactAlert } from '@/utils/personalUtils/util.contactMessages';
import { observable } from '@legendapp/state';
import { useValue } from '@legendapp/state/react';
import { useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Pressable, TextInput, View } from 'react-native';
import type { ContactsStyles } from './contacts.styles';

export type ContactsFlowsDeps = {
  fetchContacts: () => Promise<void>;
  styles: ContactsStyles;
  handlePressIn: () => void;
};

const addContact$ = observable({
  username: '',
  isChecking: false,
  recipientId: null as string | null,
  profileType: null as string | null,
  name: null as string | null,
  nickname: '',
  error: null as string | null,
  reset() {
    addContact$.assign({
      username: '',
      isChecking: false,
      recipientId: null,
      profileType: null,
      name: null,
      nickname: '',
      error: null,
    });
  },
});

const editNickname$ = observable({
  value: '',
  isSaving: false,
  reset() {
    editNickname$.value.set('');
    editNickname$.isSaving.set(false);
  },
});

const checkUsername = async () => {
  const username = addContact$.username.get();
  const normalized = username.replace(/\s+/g, '');
  if (!normalized) {
    addContact$.error.set('Enter a username.');
    return;
  }

  // Require full username length before calling API
  if (normalized.length !== 10) {
    addContact$.error.set('Enter full username.');
    return;
  }

  try {
    addContact$.isChecking.set(true);
    addContact$.error.set(null);
    const response = await PersonalContactApi.checkContactExistance({
      contact_username: normalized.toUpperCase(),
    });

    const anyResp: any = response as any;
    const parse = (r: any) => {
      const existsRaw = r?.exists ?? r?.Exists;
      const pTypeRaw = r?.profile_type ?? r?.profileType ?? r?.ProfileType;
      const recipRaw = r?.recipient_user_id ?? r?.recipientUserId ?? r?.RecipientUserId;
      const nameRaw = r?.name ?? r?.Name;
      const existsParsed = typeof existsRaw === 'boolean'
        ? existsRaw
        : typeof existsRaw === 'string'
        ? existsRaw.toLowerCase() === 'true'
        : !!existsRaw;
      const pType = (pTypeRaw ?? null) as string | null;
      const recip = recipRaw ? String(recipRaw) : null;
      const name = typeof nameRaw === 'string' ? nameRaw : null;
      return { existsParsed, pType, recip, name };
    };

    let { existsParsed, pType, recip, name } = parse(anyResp);
    addContact$.profileType.set(pType);
    addContact$.name.set(name);

    if (!existsParsed || pType === null) {
      // Try fallback with lowercase if first (uppercase) attempt failed
      const resp2 = await PersonalContactApi.checkContactExistance({
        contact_username: normalized.toLowerCase(),
      });
      const parsed2 = parse(resp2 as any);
      existsParsed = parsed2.existsParsed;
      pType = parsed2.pType;
      recip = parsed2.recip;
      name = parsed2.name;
      addContact$.profileType.set(pType);
      addContact$.name.set(name);
    }

    const found = !!existsParsed || !!pType || !!recip;

    if (!found) {
      addContact$.error.set('User not found.');
      addContact$.recipientId.set(null);
      addContact$.name.set(null);
      return;
    }

    if (pType === 'private') {
      addContact$.error.set('This profile is private and cannot be added.');
      addContact$.recipientId.set(null);
      return;
    }

    addContact$.recipientId.set(recip);
  } catch (err: any) {
    addContact$.error.set(err?.response?.data?.message ?? err?.message ?? 'Could not verify username.');
    addContact$.recipientId.set(null);
    addContact$.profileType.set(null);
    addContact$.name.set(null);
  } finally {
    addContact$.isChecking.set(false);
  }
};

type AddContactUsernameInputProps = {
  styles: ContactsStyles;
  handlePressIn: () => void;
};

const AddContactUsernameInput = ({ styles: contactStyles, handlePressIn }: AddContactUsernameInputProps) => {
  const usernameValue = useValue(addContact$.username);
  const lettersRef = useRef<TextInput | null>(null);
  const numbersRef = useRef<TextInput | null>(null);
  const lettersValue = (usernameValue ?? '').slice(0, 4);
  const numbersValue = (usernameValue ?? '').slice(4);
  const lettersComplete = lettersValue.length === 4;

  const updateUsername = (nextLetters: string, nextNumbers: string) => {
    const combined = `${nextLetters}${nextNumbers}`;
    addContact$.username.set(combined);
    addContact$.recipientId.set(null);
    addContact$.profileType.set(null);
    addContact$.name.set(null);
    if (addContact$.error.get()) {
      addContact$.error.set(null);
    }
  };

  const handleLettersChange = (text: string) => {
    const raw = text.toUpperCase();
    const lettersOnly = raw.replace(/[^A-Z]/g, '').slice(0, 4);
    // If user pasted full username, extract digits from the same text;
    // otherwise keep existing numbersValue.
    const digitsFromText = raw.replace(/[^0-9]/g, '').slice(0, 6);
    const nextNumbers = digitsFromText.length > 0 ? digitsFromText : numbersValue;

    updateUsername(lettersOnly, nextNumbers);

    if (digitsFromText.length > 0) {
      // Pasted full username: move caret to numbers part
      numbersRef.current?.focus?.();
      return;
    }

    if (lettersOnly.length === 4) {
      // Typed 4 letters: auto-move to numbers
      numbersRef.current?.focus?.();
    }
  };

  const handleNumbersChange = (text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 6);
    updateUsername(lettersValue, digitsOnly);
  };

  return (
    <ThemedView style={contactStyles.usernameInputContainer}>
      <TextInput
        ref={lettersRef}
        value={lettersValue}
        onChangeText={handleLettersChange}
        autoCapitalize='characters'
        autoCorrect={false}
        keyboardType='default'
        maxLength={10}
        style={[contactStyles.usernameLettersInput, { outline: 'none' }]}
        onFocus={handlePressIn}
      />
      <TextInput
        ref={numbersRef}
        value={numbersValue}
        onChangeText={handleNumbersChange}
        keyboardType='numeric'
        maxLength={6}
        inputMode='numeric'
        style={[contactStyles.usernameNumbersInput, { outline: 'none' }]}
        onKeyPress={(e: any) => {
          if (e?.nativeEvent?.key === 'Backspace' && numbersValue.length === 0) {
            // When numbers are empty, backspace should delete from letters part
            if (lettersValue.length > 0) {
              const newLetters = lettersValue.slice(0, -1);
              updateUsername(newLetters, '');
            }
            lettersRef.current?.focus?.();
          }
        }}
        onFocus={() => {
          // Guard using latest username value instead of stale render flag
          const current = addContact$.username.get?.() ?? addContact$.username.get();
          const currentLetters = (current ?? '').slice(0, 4);
          const currentLettersComplete = currentLetters.length === 4;
          if (!currentLettersComplete) {
            lettersRef.current?.focus?.();
            return;
          }
          handlePressIn();
        }}
      />
    </ThemedView>
  );
};

type AddContactNicknameInputProps = {
  styles: ContactsStyles;
};

const AddContactNicknameInput = ({ styles: contactStyles }: AddContactNicknameInputProps) => {
  const profileType = useValue(addContact$.profileType);
  const recipientId = useValue(addContact$.recipientId);
  const nicknameValue = useValue(addContact$.nickname);
  if (!recipientId || (profileType !== 'public' && profileType !== 'personal')) return null;
  const maxLength = 40;
  return (
    <ThemedView style={{ gap: 5 }}>
      <ThemedText type='default' selectable={false}>
        Optional nickname (max 40 characters)
      </ThemedText>
      <TextInput
        value={nicknameValue}
        onChangeText={(text) => {
          const next = text.slice(0, maxLength);
          addContact$.nickname.set(next);
        }}
        style={[contactStyles.addInput, { outline: 'none' }]}
      />
    </ThemedView>
  );
};

type EditNicknameInputProps = {
  styles: ContactsStyles;
};

const EditNicknameInput = ({ styles: contactStyles }: EditNicknameInputProps) => {
  const value = useValue(editNickname$.value);
  const maxLength = 40;
  return (
    <ThemedView style={{ gap: 4 }}>
      <ThemedText type='default' selectable={false} style={contactStyles.profileHint}>
        Nickname (max 40 characters)
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={(text) => {
          const next = (text ?? '').slice(0, maxLength);
          editNickname$.value.set(next);
        }}
        style={[contactStyles.addInput, { outline: 'none' }]}
      />
    </ThemedView>
  );
};

type AddContactErrorLabelProps = {
  styles: ContactsStyles;
};

const AddContactErrorLabel = ({ styles: contactStyles }: AddContactErrorLabelProps) => {
  const errorMessage = useValue(addContact$.error);
  if (!errorMessage) return null;
  return (
    <ThemedText type='default' style={contactStyles.inputError} selectable={false}>
      {errorMessage}
    </ThemedText>
  );
};

type AddContactProfileNoteProps = {
  styles: ContactsStyles;
};

const AddContactProfileNote = ({ styles: contactStyles }: AddContactProfileNoteProps) => {
  const profileType = useValue(addContact$.profileType);
  const name = useValue(addContact$.name);
  if (!profileType && !name) return null;
  return (
    <ThemedView style={{ gap: 4 }}>
      {profileType && (
        <ThemedText type='default' selectable={false} style={contactStyles.profileHint}>
          Profile type: {' '}
          <ThemedText
            type='default'
            selectable={false}
            style={contactStyles.pendingPillTextPrimary}
          >
            {profileType}
          </ThemedText>
        </ThemedText>
      )}
      {name && (
        <ThemedText type='default' selectable={false} style={contactStyles.profileHint}>
          Name: {' '}
          <ThemedText
            type='default'
            selectable={false}
            style={contactStyles.pendingPillTextPrimary}
          >
            {name}
          </ThemedText>
        </ThemedText>
      )}
    </ThemedView>
  );
};

type AddContactActionButtonsProps = {
  styles: ContactsStyles;
  handlePressIn: () => void;
  onCreateContact: () => Promise<void>;
};

const AddContactActionButtons = ({ styles: contactStyles, handlePressIn, onCreateContact }: AddContactActionButtonsProps) => {
  const checking = useValue(addContact$.isChecking);
  const recipientId = useValue(addContact$.recipientId);
  const hasRecipient = !!recipientId;
  const primaryLabel = hasRecipient ? 'Add to contacts' : 'Check username';

  return (
    <ThemedView style={contactStyles.actionRow}>
      <Pressable
        onPress={() => {
          if (hasRecipient) {
            void onCreateContact();
          } else {
            void checkUsername();
          }
        }}
        onPressIn={handlePressIn}
        disabled={checking}
        style={({ pressed }) => [
          contactStyles.actionButton,
          pressed ? contactStyles.actionButtonPressed : null,
          checking ? contactStyles.actionButtonDisabled : null,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ThemedText style={contactStyles.actionButtonText} selectable={false}>
            {primaryLabel}
          </ThemedText>
          <IconSymbol name='arrow.right' color={contactStyles.actionButtonText?.color} size={18} />
        </View>
      </Pressable>
    </ThemedView>
  );
};

type EditNicknameActionButtonsProps = {
  styles: ContactsStyles;
  handlePressIn: () => void;
  onSaveNickname: () => Promise<void>;
};

const EditNicknameActionButtons = ({ styles: contactStyles, handlePressIn, onSaveNickname }: EditNicknameActionButtonsProps) => {
  const saving = useValue(editNickname$.isSaving);
  return (
    <ThemedView style={contactStyles.actionRow}>
      <Pressable
        onPress={() => {
          void onSaveNickname();
        }}
        onPressIn={handlePressIn}
        disabled={saving}
        style={({ pressed }) => [
          contactStyles.actionButton,
          pressed ? contactStyles.actionButtonPressed : null,
          saving ? contactStyles.actionButtonDisabled : null,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ThemedText style={contactStyles.actionButtonText} selectable={false}>
            Save nickname
          </ThemedText>
          <IconSymbol name='arrow.right' color={contactStyles.actionButtonText?.color} size={18} />
        </View>
      </Pressable>
    </ThemedView>
  );
};

export default function CreateContactsFlows({ fetchContacts, styles: contactStyles, handlePressIn }: ContactsFlowsDeps) {
  const openAddContact = async (event?: GestureResponderEvent) => {
    const position = event
      ? {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        }
      : undefined;

    addContact$.reset();

    const handleCreateContact = async () => {
      const recipientId = addContact$.recipientId.get();
      if (!recipientId) {
        addContact$.error.set('Verify a user before sending a request.');
        return;
      }

      try {
        const rawNickname = addContact$.nickname.get();
        const trimmed = (rawNickname ?? '').trim();
        const nickname = trimmed.length > 0 ? trimmed.slice(0, 40) : null;
        const response = await runWithLoading(() =>
          PersonalContactApi.createContact({ contact_user_id: recipientId, nickname })
        );
        hideModal();

        const isMutualAdd =
          response.message === 'public_contact_added' ||
          response.message === 'personal_contact_added';
        const addedYouEntry = $contactsState.addedYouById[recipientId].get();

        if (isMutualAdd && addedYouEntry) {
          const rawDisplayName =
            addedYouEntry.nickname ?? addedYouEntry.name ?? addContact$.name.get();
          const displayName =
            rawDisplayName && rawDisplayName.trim().length > 0
              ? rawDisplayName.trim()
              : 'this contact';
          showAlert(`Contact added. You and ${displayName} are now mutual contacts.`);
        } else {
          showContactAlert(response.message, 'Request sent.');
        }
        if (
          response.message === 'public_contact_added' ||
          response.message === 'personal_contact_added' ||
          response.message === 'already_in_contacts'
        ) {
          await fetchContacts();
        } else if (response.message === 'contact_request_sent' || response.message === 'pending_request_exists') {
          $contactRequestsState.markFetched();
        }
        addContact$.reset();
      } catch (err: any) {
        addContact$.error.set(err?.response?.data?.message ?? 'Could not send request.');
      }
    };

    await showControllersModal(
      [
        { id: 'label', content: <ThemedText selectable={false}>Enter username to add a new contact</ThemedText> },
        {
          id: 'usernameBlock',
          content: (
            <ThemedView style={{ gap: 10 }}>
              <AddContactUsernameInput styles={contactStyles} handlePressIn={handlePressIn} />
              <AddContactProfileNote styles={contactStyles} />
              <AddContactNicknameInput styles={contactStyles} />
              <AddContactErrorLabel styles={contactStyles} />
            </ThemedView>
          ),
        },
        {
          id: 'actions',
          content: (
            <AddContactActionButtons
              styles={contactStyles}
              handlePressIn={handlePressIn}
              onCreateContact={handleCreateContact}
            />
          ),
        },
      ],
      {
        title: 'Add contact',
        position,
        showConfirmButton: false,
        showCancelButton: true,
        closeOnBackgroundTap: false,
        onCancel: () => {
          addContact$.reset();
        },
      }
    );
  };

  const handleRemoveNickname = async (contact: ContactEntry) => {
    try {
      const response = await runWithLoading(() =>
        PersonalContactApi.removeNickname({ contact_user_id: contact.id })
      );

      showContactAlert(response.message, 'Contact updated.');

      const nextContacts = $contactsState.contacts
        .get()
        .map((entry) => (entry.id === contact.id ? { ...entry, nickname: null } : entry));
      $contactsState.setContacts(nextContacts);

      const nextAddedYou = $contactsState.addedYou
        .get()
        .map((entry) => (entry.id === contact.id ? { ...entry, nickname: null } : entry));
      $contactsState.setAddedYou(nextAddedYou);
    } catch (error: any) {
      showContactAlert(error?.response?.data?.message, 'Could not remove nickname.');
    }
  };

  const handleRemoveContact = async (contact: ContactEntry) => {
    const confirmed = await showConfirmDialog(`Remove ${contact.name} from contacts?`, {
      confirmVariant: 'destructive',
      confirmText: 'Remove',
    });
    if (!confirmed) return;

    try {
      const response = await runWithLoading(() =>
        PersonalContactApi.deleteContact({ contact_user_id: [contact.id] })
      );
      showContactAlert(response.message, 'Contact updated.');
      $contactsState.setContacts(
        $contactsState.contacts
          .get()
          .filter((entry) => entry.id !== contact.id)
      );
      const addedYouEntry = $contactsState.addedYouById[contact.id].get();
      if (addedYouEntry) {
        $contactsState.setAddedYouMutual(contact.id, false);
      }
    } catch (error: any) {
      showContactAlert(error?.response?.data?.message, 'Could not remove contact.');
    }
  };

  const handleAddContactQuick = async (contact: ContactEntry) => {
    try {
      const response = await runWithLoading(() =>
        PersonalContactApi.createContact({ contact_user_id: contact.id, nickname: null })
      );
      if (
        response.message === 'public_contact_added' ||
        response.message === 'personal_contact_added'
      ) {
        const rawDisplayName = contact.nickname ?? contact.name;
        const displayName = rawDisplayName && rawDisplayName.trim().length > 0
          ? rawDisplayName.trim()
          : 'this contact';
        showAlert(`Contact added. You and ${displayName} are now mutual contacts.`);
      } else {
        showContactAlert(response.message, 'Contact updated.');
      }

      if (
        response.message === 'public_contact_added' ||
        response.message === 'personal_contact_added' ||
        response.message === 'already_in_contacts'
      ) {
        const existing = $contactsState.contacts.get();
        const exists = existing.some((c) => c.id === contact.id);
        if (!exists) {
          $contactsState.setContacts([...existing, { ...contact, isMutual: true }]);
        }
        const addedYouEntry = $contactsState.addedYouById[contact.id].get();
        if (addedYouEntry) {
          $contactsState.setAddedYouMutual(contact.id, true);
        }
      }

      if (response.message === 'contact_request_sent' || response.message === 'pending_request_exists') {
        $contactRequestsState.markFetched();
      }
    } catch (error: any) {
      showContactAlert(error?.response?.data?.message, 'Could not add contact.');
    }
  };

  const handleEditNickname = async (contact: ContactEntry, position?: { x: number; y: number }) => {
    const hasNickname = !!(contact.nickname && contact.nickname.trim().length > 0);
    const modalTitle = hasNickname ? 'Update nickname' : 'Add nickname';

    editNickname$.value.set(contact.nickname ?? '');

    const saveNickname = async () => {
      try {
        editNickname$.isSaving.set(true);
        const raw = editNickname$.value.get();
        const trimmed = (raw ?? '').trim();
        const nickname = trimmed.length > 0 ? trimmed.slice(0, 40) : null;

        const response = await runWithLoading(() =>
          PersonalContactApi.updateContactNickname({
            contact_user_id: contact.id,
            nickname,
          })
        );

        hideModal();
        showContactAlert(response.message, 'Contact updated.');

        const nextContacts = $contactsState.contacts
          .get()
          .map((entry) => (entry.id === contact.id ? { ...entry, nickname } : entry));
        $contactsState.setContacts(nextContacts);

        const nextAddedYou = $contactsState.addedYou
          .get()
          .map((entry) => (entry.id === contact.id ? { ...entry, nickname } : entry));
        $contactsState.setAddedYou(nextAddedYou);
      } catch (error: any) {
        showContactAlert(error?.response?.data?.message, 'Could not update nickname.');
      } finally {
        editNickname$.reset();
      }
    };

    await showControllersModal(
      [
        {
          id: 'nickname_input',
          content: <EditNicknameInput styles={contactStyles} />,
        },
        {
          id: 'actions',
          content: (
            <EditNicknameActionButtons
              styles={contactStyles}
              handlePressIn={handlePressIn}
              onSaveNickname={saveNickname}
            />
          ),
        },
      ],
      {
        title: modalTitle,
        position,
        showConfirmButton: false,
        showCancelButton: true,
        closeOnBackgroundTap: false,
        onCancel: () => editNickname$.reset(),
      }
    );
  };

  const openActionsFromContacts = async (contact: ContactEntry, event?: GestureResponderEvent) => {
    const position = event
      ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }
      : undefined;

    const controllers = [
      ...(contact.nickname
        ? [
            {
              id: 'remove_nickname' as const,
              label: 'Remove nickname',
              onPress: () => handleRemoveNickname(contact),
            },
          ]
        : []),
      {
        id: 'edit_nickname',
        label: contact.nickname ? 'Edit nickname' : 'Add nickname',
        onPress: () => handleEditNickname(contact, position),
      },
      {
        id: 'remove',
        label: 'Remove contact',
        onPress: () => handleRemoveContact(contact),
      },
    ];

    await showControllersModal(controllers, {
      title: 'Contact actions',
      position,
      showConfirmButton: false,
      showCancelButton: true,
      closeOnControllerPress: true,
    });
  };

  const openActionsFromAddedYou = async (contact: ContactEntry, event?: GestureResponderEvent) => {
    if (contact.isMutual) return;

    // If there is no event (e.g. pressed the inline "Add" button on the row),
    // perform a direct quick-add without opening the actions sheet.
    if (!event) {
      await handleAddContactQuick(contact);
      return;
    }

    const position = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };

    const controllers = [
      {
        id: 'add',
        label: 'Add contact',
        onPress: () => handleAddContactQuick(contact),
      },
    ];

    await showControllersModal(controllers, {
      position,
      showConfirmButton: false,
      showCancelButton: false,
      closeOnControllerPress: true,
    });
  };

  return { openAddContact, openActionsFromContacts, openActionsFromAddedYou };
}
