import { PersonalContactApi } from '@/lib/personalLib/contactApi/personal.api.contact';
import { runWithLoading } from '@/utils/commonUtils/util.modal';
import type { CreateContactResponse } from '@/lib/personalLib/models/personal.model.contact';

export type AddContactByIdOptions = {
  contactUserId: string;
  nickname?: string | null;
  useLoading?: boolean;
};

export const isImmediateContactCode = (code?: string | null): boolean =>
  code === 'public_contact_added' ||
  code === 'personal_contact_added' ||
  code === 'already_in_contacts';

export const isMutualContactAddedCode = (code?: string | null): boolean =>
  code === 'public_contact_added' || code === 'personal_contact_added';

export const isRequestContactCode = (code?: string | null): boolean =>
  code === 'contact_request_sent' || code === 'pending_request_exists';

export const PersonalUtilAddContactById = async ({
  contactUserId,
  nickname = null,
  useLoading = true,
}: AddContactByIdOptions): Promise<CreateContactResponse> => {
  const task = () => PersonalContactApi.createContact({
    contact_user_id: contactUserId,
    nickname,
  });

  return useLoading ? runWithLoading(task) : task();
};
