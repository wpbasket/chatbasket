import Postcard from '@/components/publicComponents/post/Postcard';
import FollowerCard from '@/components/publicComponents/profile/FollowerCard';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { useLegend$ } from '@/hooks/commonHooks/hooks.useLegend';
import { Post } from '@/model/Post';
import { User } from '@/model/User';
import activeUserFollowers from '@/state/publicState/public.state.activeUserFollowers';
import activeUserFollowing from '@/state/publicState/public.state.activeUserFollowing';
import activeUserPosts from '@/state/publicState/public.state.activeUserPosts';
import { LegendList } from '@legendapp/list';
import React, { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import TabsSection from './sections/TabsSection';
import UserInfoSection from './sections/UserInfoSection';

type TABS = 'Posts' | 'Followers' | 'Following';

// Define a type for the simplified user structure returned by activeUserFollowers/Following
type SimplifiedUser = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
};

// Union type for content items
type ContentItem = Post | SimplifiedUser;

// Define a type for list items, including the optional _isEmpty property
type ListItem = (ContentItem | { id: string; _isEmpty?: true }) & { _isEmpty?: boolean };

type ProfileListProps = {
  user: User | null;
  activeTab: TABS;
  onTabPress: (tab: TABS) => void;
};

const ProfileList = React.memo(({ user, activeTab, onTabPress }: ProfileListProps) => {
  // Move hook calls to the top level of the component
  const postsData = useLegend$(user?.id ? activeUserPosts(user.id) : []);
  const followersData = useLegend$(user?.id ? activeUserFollowers(user.id) : []);
  const followingData = useLegend$(user?.id ? activeUserFollowing(user.id) : []);
  
  // Get content data based on active tab
  const contentData = useMemo((): ListItem[] => {
    if (!user?.id) return [{ id: 'empty-user', _isEmpty: true }]; // Return dummy item if no user
    
    let data: ContentItem[] = [];
    switch (activeTab) {
      case 'Posts':
        data = postsData;
        break;
      case 'Followers':
        data = followersData;
        break;
      case 'Following':
        data = followingData;
        break;
    }
    
    // If there's no data, add a dummy item to ensure ListHeaderComponent is rendered
    if (data.length === 0) {
      return [{ id: 'empty-content', _isEmpty: true }];
    }
    
    return data as ListItem[];
  }, [user?.id, activeTab, postsData, followersData, followingData]);

  // Render header components (user info and tabs)
  const ListHeader = useCallback(() => {
    return (
      <>
        <UserInfoSection user={user} />
        <TabsSection activeTab={activeTab} onTabPress={onTabPress} />
      </>
    );
  }, [user, activeTab, onTabPress]);

  // Render content items
  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    // Handle the dummy empty item
    if (item._isEmpty) {
      return (
        <ThemedView style={styles.emptyContainer}>
          <ThemedText type='semibold'>
            {activeTab === 'Posts' 
              ? 'No posts available' 
              : activeTab === 'Followers' 
                ? 'No followers available' 
                : 'No following available'}
          </ThemedText>
        </ThemedView>
      );
    }
    
    switch (activeTab) {
      case 'Posts':
        return <Postcard post={item as Post} interactive={false} />;
      case 'Followers':
      case 'Following':
        return <FollowerCard follower={item as SimplifiedUser} interactive={true} />;
      default:
        return null;
    }
  }, [activeTab]);

  // We don't need a separate ListEmptyComponent anymore
  // as we're handling empty states in renderItem with the dummy item

  // Key extractor for list items
  const keyExtractor = useCallback((item: any) => {
    // Ensure the id is string-safe (handle undefined, null, or other non-string values)
    return item?.id?.toString() || String(Math.random());
  }, []);

  return (
    <ThemedView style={styles.container}>
      <LegendList
        data={contentData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        recycleItems={true}
        maintainVisibleContentPosition={true}
        showsVerticalScrollIndicator={Platform.OS === 'web' ? false : true}
        contentContainerStyle={{paddingBottom:150}}
      />
    </ThemedView>
  );
});

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 200,
  },
}));

export default ProfileList;
