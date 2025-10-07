import posts from '@/assets/data/posts';
import React from 'react';
import userPostsStore from './public.state.userPostsStore';

export function initUserPosts() {
  // Set initial posts directly to the observable
  userPostsStore.posts.set(posts);
}

// Add a default export of a React component to satisfy Expo Router requirements
export default function InitUserPostsComponent() {
  // Call the initialization function when the component mounts
  React.useEffect(() => {
    initUserPosts();
  }, []);

  // Return null as this is just a utility component
  return null;
}