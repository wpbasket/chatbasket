// This module provides a derived state for posts belonging to the current user
import { computed } from '@legendapp/state';
import followerRelations from '@/assets/data/followerRelations';
import users from '@/assets/data/users';
import type { PublicProfileUser } from '@/model/User';

// Derived state: followers for the current user
const activeUserFollowing = (targetUserId: string) => computed(() => {
    if (targetUserId.length === 0) {
        return [] as PublicProfileUser[];
    }

    const userFollowing = followerRelations.filter(
        (relation) => relation.followerId === targetUserId
    );

    return userFollowing.flatMap((relation) => {
        const following = users.find((user) => user.id === relation.followedId);
        return following ? [following] : [];
    });
});

export default activeUserFollowing;