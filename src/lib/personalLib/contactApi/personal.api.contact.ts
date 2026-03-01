import { apiClient, BooleanResponse } from "@/lib/constantLib";
import { GetContactsResponse,
     CheckContactExistanceResponse,
     CheckContactExistancePayload,
     AcceptContactRequestPayload,
     RejectContactRequestPayload,
     UndoContactRequestPayload,
     DeleteContactPayload,
     CreateContactPayload,
     GetContactRequestsResponse, 
     UpdateContactNicknamePayload,
     RemoveNicknamePayload} from "@/lib/personalLib";


/**
 * Handles getting contacts.
 * @returns Contact: id:string; name:string; username:string; bio:string|null; created_at:string; updated_at:string; avatar_url?:string; is_mutual:boolean;
 * @returns contacts: Contact[]; people_who_added_you: Contact[];
 */
async function getContacts(): Promise<GetContactsResponse> {
    return apiClient.get<GetContactsResponse>('/personal/contacts/get');
}


/**
 * Handles checking contact existence.
 * @param payload contact_username: string;
 * @returns exists: boolean; profile_type?: string("private" | "public" | "personal"); name: string; recipient_user_id?: string | null;
 */
async function checkContactExistance(payload: CheckContactExistancePayload): Promise<CheckContactExistanceResponse> {
    return apiClient.post<CheckContactExistanceResponse>('/personal/contacts/check-existence', payload);
}


/**
 * Handles creating a contact.
 * @param payload contact_user_id: string;
 * @returns status: boolean; message: string;
 */
async function createContact(payload: CreateContactPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/personal/contacts/create', payload);
}

/**
 * Handles deleting a contact.
 * @param payload contact_user_id: string;
 * @returns status: boolean; message: string;
 */
async function deleteContact(payload: DeleteContactPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/personal/contacts/delete', payload);
}


/**
 * Handles getting contact requests.
 * @returns PendingContactRequest: id: string; name: string; username: string; bio: string | null; requested_at: string; updated_at: string; avatar_url?: string | null;
 * @returns SentContactRequest: id: string; name: string; username: string; bio: string | null; requested_at: string; updated_at: string; avatar_url?: string | null;
 * @returns pending_requests: PendingContactRequest[]; sent_requests: SentContactRequest[];
 */
async function getContactRequests(): Promise<GetContactRequestsResponse> {
    return apiClient.get<GetContactRequestsResponse>('/personal/contacts/requests/get');
}


/**
 * Handles accepting a contact request.
 * @param payload contact_user_id: string;
 * @returns status: boolean; message: string;
 */
async function acceptContactRequest(payload: AcceptContactRequestPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/personal/contacts/requests/accept', payload);
}

/**
 * Handles rejecting a contact request.
 * @param payload contact_user_id: string;
 * @returns status: boolean; message: string;
 */
async function rejectContactRequest(payload: RejectContactRequestPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/personal/contacts/requests/reject', payload);
}

/**
 * Handles undoing a sent contact request.
 * @param payload contact_user_id: string;
 * @returns status: boolean; message: string;
 */
async function undoContactRequest(payload: UndoContactRequestPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/personal/contacts/requests/undo', payload);
}


/**
 * Handles updating a contact's nickname.
 * @param payload contact_user_id: string; nickname: string | null;
 * @returns status: boolean; message: string;
 */
async function updateContactNickname(payload: UpdateContactNicknamePayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/personal/contacts/update-nickname', payload);
}


/**
 * Handles removing a contact's nickname.
 * @param payload contact_user_id: string;
 * @returns status: boolean; message: string;
 */
async function removeNickname(payload: RemoveNicknamePayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/personal/contacts/remove-nickname', payload);
}


export const PersonalContactApi = {
    getContacts,
    checkContactExistance,
    createContact,
    acceptContactRequest,
    rejectContactRequest,
    undoContactRequest,
    deleteContact,
    getContactRequests,
    updateContactNickname,
    removeNickname
}
