// This module provides a derived state for posts belonging to the current user
import { computed } from '@legendapp/state';
import followerRelations from '@/assets/data/followerRelations';
import users from '@/assets/data/users';
import type { PublicProfileUser } from '@/model/User';

// Derived state: followers for the current user
const activeUserFollowers = (targetUserId: string) => computed(() => {
    if (targetUserId.length === 0) {
        return [] as PublicProfileUser[];
    }

    const userFollowers = followerRelations.filter(
        (relation) => relation.followedId === targetUserId
    );

    return userFollowers.flatMap((relation) => {
        const follower = users.find((user) => user.id === relation.followerId);
        return follower ? [follower] : [];
    });
});

export default activeUserFollowers;