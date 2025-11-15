import { showAlert } from '@/utils/commonUtils/util.modal';

type MessageDictionary = Record<string, string>;

const successMessages: MessageDictionary = {
  public_contact_added: 'Contact added successfully.',
  contact_request_sent: 'Contact request sent.',
  contact_request_accepted: 'Contact request accepted.',
  contact_request_declined: 'Contact request declined.',
  contact_request_undone: 'Contact request withdrawn.',
  contact_deleted: 'Contact removed.',
  contacts_deleted: 'Contacts removed.',
  contacts_deleted_partial: 'Some contacts could not be removed.',
  already_in_contacts: 'This user is already in your contacts.',
  pending_request_exists: 'A pending request already exists.',
};

const errorMessages: MessageDictionary = {
  self_addition: 'You cannot add yourself.',
  self_admin_blocked: 'Your account is restricted from adding contacts.',
  user_admin_blocked: 'This user is restricted and cannot be added.',
  user_private_profile: 'This profile is private and cannot be added directly.',
  you_blocked_user: 'You have blocked this user.',
  user_blocked_you: 'This user has blocked you.',
  pending_request_not_found: 'No pending request found.',
  request_already_processed: 'This request has already been processed.',
  contact_not_found: 'Contact not found.',
  user_not_found: 'User not found.',
  self_action_not_allowed: 'You cannot perform this action on yourself.',
  unexpected_outcome: 'Unexpected outcome occurred. Please try again.',
  "unexpected outcome": 'Unexpected outcome occurred. Please try again.',
};

export type ContactMessageType = 'success' | 'error';

export function resolveContactMessage(code: string | null | undefined, fallback: string): string {
  if (!code) return fallback;
  const normalized = code.trim().toLowerCase();
  return successMessages[normalized] ?? errorMessages[normalized] ?? fallback;
}

export function showContactAlert(code: string | null | undefined, defaultMessage: string) {
  showAlert(resolveContactMessage(code, defaultMessage));
}

export function isContactSuccess(code: string | null | undefined): boolean {
  if (!code) return false;
  return Object.prototype.hasOwnProperty.call(successMessages, code.trim().toLowerCase());
}
