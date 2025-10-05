export type Post = {
    id: string;
    userId: string; 
    title: string;
    images: string[];
    createdAt: string;
    updatedAt: string;
    content: string
    visibleTo: string;
    views: number;
    likes: number;
    comments: number;
    disableComments: boolean;
    disableLikes: boolean;
}

export default{} as Post;
