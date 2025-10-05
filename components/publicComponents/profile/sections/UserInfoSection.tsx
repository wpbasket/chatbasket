import React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { User } from '@/model/User';
import Header from '@/components/header/Header';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { router } from 'expo-router';

type UserInfoSectionProps = {
  user: User | null;
};

const UserInfoSection = React.memo(({ user }: UserInfoSectionProps) => {
  const goBack = () => {
    router.back();
  };

  if (!user) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading user information...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.outerContainer}>
      <Header
        leftButton={{
          child: <IconSymbol name='arrow.left' />,
          onPress: goBack,
        }}
        Icon={
          <ThemedText type='subtitle'>{'DummyUser' + user?.username[0].toUpperCase()}</ThemedText>
        }
        centerIcon={true}
      />
      <ThemedView style={styles.container}>
        {/* Photo column */}
        <ThemedView style={styles.photoColumn}>
          {/* Placeholder for Profile picture */}
          <View style={styles.profilePic}></View>
        </ThemedView>

        {/* User info column */}
        <ThemedView style={styles.userInfoColumn}>
          <ThemedText type='semibold'>@{user.username}</ThemedText>
          <ThemedText style={styles.userBio}>{user.bio}</ThemedText>
        </ThemedView>
      </ThemedView>
    </ThemedView>
  );
});

const styles = StyleSheet.create((theme) => ({
  outerContainer: {
    flex: 1,
  },
  container: {
    flexDirection: 'row',
    height: 200,
  },
  photoColumn: {
    height: '100%',
    width: '25%',
    alignItems: 'center',
    paddingTop: 5,
  },
  profilePic: {
    height: 80,
    width: 80,
    backgroundColor: theme.colors.icon,
    borderRadius: 9999,
  },
  userInfoColumn: {
    height: '100%',
    width: '75%',
    padding: 8,
    paddingTop: 20,
  },
  userBio: {
    fontSize: 13,
  },
}));

export default UserInfoSection;
