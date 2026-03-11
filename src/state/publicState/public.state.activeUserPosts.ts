// This module provides a derived state for posts belonging to the current user
import { computed } from '@legendapp/state';
import type { Post } from '@/model/Post';
import userPostsStore from './public.state.userPostsStore';

// Derived state: posts for the current user
const activeUserPosts = (targetUserId: string) => computed(() => {
    if (targetUserId.length === 0) {
        return [] as Post[];
    }

    const posts = userPostsStore.posts.get();
    return posts.filter((post: Post) => post.user === targetUserId);
});

export default activeUserPosts;
