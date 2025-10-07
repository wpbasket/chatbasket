import { Post } from '@/model/Post';
import { observable } from '@legendapp/state';

// Create the observable store
export const userPostsStore = observable<{
  posts: Post[];
}>({
  posts: [], // Initialize with an empty array
});

// Export the store as default
export default userPostsStore;