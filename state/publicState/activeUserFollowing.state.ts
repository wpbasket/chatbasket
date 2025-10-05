// This module provides a derived state for posts belonging to the current user
import { computed } from '@legendapp/state';
import followerRelations from '@/assets/data/followerRelations';
import users from '@/assets/data/users';
import { User } from '@/model/User';

// Derived state: followers for the current user
const activeUserFollowing = (targetUserId: string ) => computed(() => {
    if (targetUserId.length == 0) {
        return [];
    }

    const userFollowing = followerRelations.filter(
        (relation) => relation.followerId === targetUserId
    );

    return userFollowing.map((relation) => {
        const following = users.find(user => user.id === relation.followedId);
        return {
            id: following?.id,
            username: following?.username,
            first_name: following?.first_name,
            last_name: following?.last_name
        };
    }).filter((following): following is User => following.id !== undefined);
});

export default activeUserFollowing;