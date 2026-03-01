// This module provides a derived state for posts belonging to the current user
import { computed } from '@legendapp/state';
import followerRelations from '@/assets/data/followerRelations';
import users from '@/assets/data/users';
import { User } from '@/model/User';

// Derived state: followers for the current user
const activeUserFollowers = (targetUserId: string ) => computed(() => {
    if (targetUserId.length == 0) {
        return [];
    }

    const userFollowers = followerRelations.filter(
        (relation) => relation.followedId === targetUserId
    );

    return userFollowers.map((relation) => {
        const follower = users.find(user => user.id === relation.followerId);
        return {
            id: follower?.id,
            username: follower?.username,
            first_name: follower?.first_name,
            last_name: follower?.last_name
        };
    }).filter((follower): follower is User => follower.id !== undefined);
});

export default activeUserFollowers;