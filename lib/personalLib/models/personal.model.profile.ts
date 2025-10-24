export interface PersonalProfileResponse {
    id: string; // string
    username: string; // string, format: 6 uppercase letters + 4 digits + 1 uppercase letter
    name: string; // string, min=1, max=40
    email: string; // string
    bio: string | null; // *string, max=150
    avatar_url: string | null; // *string
    profile_type: string; // string, oneof=public private personal
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

