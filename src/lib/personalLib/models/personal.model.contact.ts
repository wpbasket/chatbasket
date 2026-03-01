export type ProfileType = "private" | "public" | "personal";

// ============================================================================
// RESPONSE MODELS - Used for API responses
// ============================================================================

/**
 * Contact represents a single contact in the user's contact list
 * Hierarchy: Used in GetContactsResponse.contacts and GetContactsResponse.people_who_added_you
 */
export interface Contact {
    id: string;
    name: string;
    username: string;
    nickname: string | null;
    bio: string | null;
    created_at: string;
    updated_at: string;
    avatar_url?: string | null;
    is_mutual: boolean;
}

/**
 * GetContactsResponse is the response from the GetContacts endpoint
 * Hierarchy: Response container → []Contact (mutual contacts) + []Contact (people who added you)
 */
export interface GetContactsResponse {
    contacts: Contact[];
    people_who_added_you: Contact[];
}

/**
 * CheckContactExistanceResponse is the response from checking if a contact exists (legacy symbol name)
 * Hierarchy: Response container → profile type and optional recipient info
 */
export interface CheckContactExistanceResponse {
    exists: boolean;
    profile_type: string;
    name: string;
    recipient_user_id?: string | null;
}

/**
 * PendingContactRequest represents a contact request received from another user
 * Hierarchy: Used in GetContactRequestsResponse.pending_requests
 */
export interface PendingContactRequest {
    id: string;
    name: string;
    username: string;
    nickname: string | null;
    bio: string | null;
    status: string; // "pending" | "accepted" | "declined"
    requested_at: string;
    updated_at: string;
    avatar_url?: string | null;
}

/**
 * SentContactRequest represents a contact request sent by the current user
 * Hierarchy: Used in GetContactRequestsResponse.sent_requests
 */
export interface SentContactRequest {
    id: string;
    name: string;
    username: string;
    nickname: string | null;
    bio: string | null;
    status: string; // "pending" | "accepted" | "declined"
    requested_at: string;
    updated_at: string;
    avatar_url?: string | null;
}

/**
 * GetContactRequestsResponse is the response from the GetContactRequests endpoint
 * Hierarchy: Response container → []PendingContactRequest (received) + []SentContactRequest (sent)
 */
export interface GetContactRequestsResponse {
    pending_requests: PendingContactRequest[];
    sent_requests: SentContactRequest[];
}

// ============================================================================
// REQUEST PAYLOADS - Used for API requests
// ============================================================================

/**
 * CreateContactPayload is the request payload for creating a new contact
 * Endpoint: POST /contacts/create
 */
export interface CreateContactPayload {
    contact_user_id: string;
    nickname: string | null;
}

/**
 * CheckContactExistancePayload is the request payload for checking if a contact exists (legacy symbol name)
 * Endpoint: POST /personal/contacts/check-existence
 */
export interface CheckContactExistancePayload {
    contact_username: string;
}

/**
 * AcceptContactRequestPayload is the request payload for accepting a contact request
 * Endpoint: POST /contacts/accept
 */
export interface AcceptContactRequestPayload {
    contact_user_id: string;
}

/**
 * RejectContactRequestPayload is the request payload for rejecting a contact request
 * Endpoint: POST /contacts/reject
 */
export interface RejectContactRequestPayload {
    contact_user_id: string;
}

/**
 * UndoContactRequestPayload is the request payload for undoing a sent contact request
 * Endpoint: POST /contacts/undo-request
 */
export interface UndoContactRequestPayload {
    contact_user_id: string;
}

/**
 * DeleteContactPayload is the request payload for deleting one or more contacts
 * Endpoint: POST /contacts/delete
 */
export interface DeleteContactPayload {
    contact_user_id: string[]; // array of user ids to delete
}


/**
 * UpdateContactNicknamePayload is the request payload for updating a contact's nickname
 * Endpoint: POST /contacts/update-nickname
 */
export interface UpdateContactNicknamePayload {
    contact_user_id: string;
    nickname: string | null;
}

/**
 * RemoveNicknamePayload is the request payload for removing a contact's nickname
 * Endpoint: POST /contacts/remove-nickname
 */
export interface RemoveNicknamePayload {
    contact_user_id: string;
}