// This module provides a derived state for posts belonging to the current user
import { computed } from '@legendapp/state';
import userPostsStore from './public.state.userPostsStore';

// Derived state: posts for the current user
const activeUserPosts = (targetUserId: string ) => computed(() => {
    if (targetUserId.length === 0) {
        return [];
    }

    const posts = userPostsStore.posts.get();
    return posts.filter(post => post.user === targetUserId);
});

export default activeUserPosts;
