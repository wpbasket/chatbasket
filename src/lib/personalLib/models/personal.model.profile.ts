export interface PersonalProfileResponse {
    id: string; // string
    username: string; // string, format: 6 uppercase letters + 4 digits + 1 uppercase letter
    name: string; // string, min=1, max=40
    email: string; // string
    bio: string | null; // *string, max=150
    avatar_url: string | null; // *string
    avatar_file_id: string | null; // *string
    profile_type: string; // string, oneof=public private personal
    keys_revision: number; // user's current E2EE active-key revision
    createdAt: string; // string (JSON serialized time.Time)
    updatedAt: string; // string (JSON serialized time.Time)
}

export interface PersonalLogoutPayload {
    all_sessions: boolean;
}

export interface PersonalCreateProfilePayload {
    name: string; // string, required, min=1, max=40
    profile_type: string; // string, required, oneof=public private personal
}

export interface PersonalUpdateUserProfilePayload {
    name?: string;        // Optional; omit to not update
    bio?: string;         // Optional; omit to not update
    profile_type?: string;  // Optional; omit to not update
}

export interface PersonalUpdateE2EEKeyPayload {
    e2ee_public_key: string; // string, required, standard Base64 X25519 public key (exactly 44 chars)
}

export interface PersonalUpdateE2EEKeyResponse {
    status: boolean;
    message: string;
    keys_revision: number;
}

export interface PersonalGetE2EEKeyResponse {
    e2ee_public_keys: string[];
    keys_revision: number;
}

export type StaleSide = 'sender' | 'recipient' | 'both';

export interface StaleKeysErrorDetails {
    stale_side: StaleSide;
    sender_keys_revision?: number;
    recipient_keys_revision?: number;
    sender_active_keys?: string[];
    recipient_active_keys?: string[];
}

export interface StaleKeysError {
    code: 409;
    type: 'keys_stale';
    message: string;
    details: StaleKeysErrorDetails;
}

// ============================================================================
// R2 PRESIGN & CONFIRM FLOW PAYLOADS
// ============================================================================

export interface PresignAvatarUploadResponse {
    presigned_url: string;
    file_id: string;
}

export interface ConfirmAvatarUploadPayload {
    file_id: string;
}
