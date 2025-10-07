export interface PersonalProfileResponse {
    id:             string; 
    name:           string;     
    username:       string;
    email:          string;     
    bio:            string;  
    avatar:         string | null;
    avatar_tokens:  string[] | null;
    contacts:       number;
    profile_type:   string;     // public | private | personal 
    createdAt:      string;
    updatedAt:      string;
}

export interface PersonalLogoutPayload {
    all_sessions: boolean;
}

export interface PersonalCreateProfilePayload {
    name: string;
    bio: string;
    profile_type: string;
}