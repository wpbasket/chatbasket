export type User = {
    id: string; 
    name: string;     
    username: string; 
    email: string;     
    bio: string;  
    avatar: string;
    followers: number;
    following: number;
    posts: number;
    profileVisibleTo: string; // who can see the profile public private 
    createdAt: string;
    updatedAt: string;
}

export default{} as User;