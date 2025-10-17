export interface CreateUserProfilePayload {
    name: string;
    username: string;
    profileVisibleTo: string;
    bio: string;
}

export interface ProfileResponse {
    id: string; 
    name: string;     
    username: string; 
    email: string;     
    bio: string ;  
    avatarUri:string | null;
    followers: number;
    following: number;
    posts: number;
    profileVisibleTo: string; // who can see the profile public private 
    createdAt: string;
    updatedAt: string;
}


export interface UpdateUserProfilePayload {
    name: string | null;
    username: string | null;
    profileVisibleTo: string | null;
    bio: string | null;
    avatarFileId: string | null;
    avatarFileTokens: string[] | null;
}

export interface CheckUsernamePayload {
    username: string;
}


export interface UploadAvatarResponse {
    avatarFileId: string;
    name: string;
    avatarFileTokens: string[] | null;
}

export interface LogoutPayload {
    allSessions: boolean;
}