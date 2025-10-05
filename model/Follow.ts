export type Follow = {
    id: string;
    followerId: string; // the user who follows
    followingId: string; // the user being followed
    isMuted: boolean; // whether the follower has muted the following
    updatedAt: string; // when the follow record was updated
};

export default {} as Follow;