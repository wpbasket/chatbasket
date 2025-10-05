import users from '@/assets/data/users';
import { Post } from '@/model/Post';
import { User } from '@/model/User';
import { router } from 'expo-router';
import React from 'react';
import { Pressable } from 'react-native';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import currentPostStore from '@/state/publicState/activePost.state';
import currentUserStore from '@/state/publicState/activeUser.state';
import { StyleSheet } from 'react-native-unistyles';
import { pressableAnimation } from '@/hooks/pressableAnimation';
type Props = {
  post: Post;
  interactive: boolean;
};

export default function Postcard({ post, interactive }: Props) {
  const { handlePressIn } = pressableAnimation();
  const userInfo: User | undefined = users.find((x) => x.id === post.user);

  const goToPostDetails = () => {
    currentPostStore.post.set(post); // Set the current post in Legend State store
    currentUserStore.user.set(userInfo ?? null); // Set the user who made the post
    router.push('/(temp)/post'); // Navigate to post details screen
  };

  const goToUserProfile = () => {
    currentUserStore.user.set(userInfo ?? null);
    router.push('/(temp)/tempprofile');
  };

  return (
    <ThemedView style={styles.postCard}>

      {/* Profile Picture */}
      <ThemedView style={styles.userInfoContainer}>
        <ThemedView style={styles.profilePictureContainer}>
          {/* Placeholder for profile picture */}
          <ThemedView style={styles.profilePicture}>
            <ThemedText type='titleSmall'>{userInfo?.first_name[0]}</ThemedText>
          </ThemedView>
        </ThemedView>
        {/* User Info */}
        <ThemedView style={styles.userDetailsContainer}>
          <ThemedText type='semibold' style={{lineHeight:16}}>
            {userInfo?.first_name} {userInfo?.last_name}
          </ThemedText>
          <Pressable
            onPress={interactive ? goToUserProfile : undefined}
            onPressIn={handlePressIn}
            style={({ pressed }) => [
              { opacity: pressed ? 0.1 : 1 },
            ]}

          >
            <ThemedText type='small'>
              @{userInfo?.username}
            </ThemedText>
          </Pressable>
        </ThemedView>
      </ThemedView>

      {/* Post Content */}
      <Pressable style={({ pressed }) => [
        { opacity: pressed ? 0.1 : 1 }, { flex: 1 },
      ]}
        onPress={goToPostDetails}
        onPressIn={handlePressIn}
      >

        <ThemedView style={[styles.postContainer,]}>

          <ThemedText>{post.content}</ThemedText>
        </ThemedView>
      </Pressable>

      {/* Bottom Container */}
      <ThemedView style={styles.bottomContainer}>
        <ThemedView style={styles.likeContainer}>
          <Pressable onPress={undefined} style={({ pressed }) => [
            { opacity: pressed ? 0.1 : 1 },
          ]}
            onPressIn={handlePressIn}
          >
            <ThemedView style={styles.likeIcon}></ThemedView>
          </Pressable >
          <Pressable onPress={undefined} style={({ pressed }) => [
            { opacity: pressed ? 0.1 : 1 },
          ]}
            onPressIn={handlePressIn}
          >
            <ThemedView style={styles.commentIcon}></ThemedView>
          </Pressable>
          <Pressable onPress={undefined} style={({ pressed }) => [
            { opacity: pressed ? 0.1 : 1 },
          ]}
            onPressIn={handlePressIn}
          >
            <ThemedView style={styles.shareIcon}></ThemedView>
          </Pressable>
        </ThemedView>
      </ThemedView>

    </ThemedView>
  );
};

const styles = StyleSheet.create((theme) => ({
  postCard: {
    height: 370,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral,
  },
  userInfoContainer: {
    height: 50,
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 12
  },
  profilePictureContainer: {
    height: 50,
    width: 35,
    justifyContent: 'center',
    // alignItems: 'center',
  },
  profilePicture: {
    height: 35,
    width: 35,
    backgroundColor: theme.colors.primary,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postContainer: {
    flex: 250,
    paddingLeft: 12,
    // borderBottomColor: theme.colors.neutral,
    // borderBottomWidth: 0.2,
  },
  userDetailsContainer: {
    height: 50,
    justifyContent: 'center',
  },
  bottomContainer: {
    paddingLeft: 12,
    flexDirection: 'row',
    height: 45,
  },
  likeContainer: {
    height: 35,
    width: 180,
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    flexDirection: 'row',
  },
  likeIcon: {
    height: 20,
    width: 40,
    backgroundColor: theme.colors.text,
    borderRadius: 9999,
  },
  commentIcon: {
    height: 20,
    width: 40,
    backgroundColor: theme.colors.text,
    borderRadius: 9999,
  },
  shareIcon: {
    height: 20,
    width: 40,
    backgroundColor: theme.colors.text,
    borderRadius: 9999,
  },
  username: {
    color: theme.colors.whiteOrBlack
  }
}));