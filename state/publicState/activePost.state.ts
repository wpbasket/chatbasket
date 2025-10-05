import { Post } from '@/model/Post';
import { observable } from '@legendapp/state';

// Create the observable store
export const currentPostStore = observable<{
  post: Post | null;
}>({
  post: null,
});

// Export the store as default
export default currentPostStore;