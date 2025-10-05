import { User } from '@/model/User';
import { observable } from '@legendapp/state';

// Create the observable store
export const currentUserStore = observable<{
  user: User | null;
}>({
  user: null,
});

// Export the store as default
export default currentUserStore;