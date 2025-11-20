import Header from '@/components/header/Header';
import Sidebar from '@/components/sidebar/Sidebar';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { EntypoIcon } from '@/components/ui/fonts/entypoIcons';
import { FontAwesome5Icon } from '@/components/ui/fonts/fontAwesome5';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { profileApi } from '@/lib/publicLib/profileApi/public.api.profile';
import { clearSession } from '@/lib/storage/commonStorage/storage.auth';
import { authState } from '@/state/auth/state.auth';
import { createProfile$ } from '@/state/publicState/profile/public.state.profile.createProfile';
import { showConfirmDialog } from '@/utils/commonUtils/util.modal';
import { getUser } from '@/utils/publicUtils/public.util.profile';
import { useValue } from '@legendapp/state/react';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { Image, Pressable } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

// Empty State Component
function ProfileEmptyState() {
  const { handlePressIn } = pressableAnimation();
  const goToCreateProfile = () => {
    authState.isInTheProfileUpdateMode.set(true)
    router.push("/(tabs)/profile/create-profile");
  };

  return (
    <ThemedViewWithSidebar>
      <ThemedViewWithSidebar.Sidebar>
        <Sidebar />
      </ThemedViewWithSidebar.Sidebar>
      <ThemedViewWithSidebar.Main>
        <ThemedView style={styles.emptyStateContainer}>
          <ThemedView style={styles.emptyContent}>
            {/* <IconSymbol name="person.circle" size={80} /> */}
            <ThemedText type="title">Welcome!</ThemedText>
            <ThemedText style={styles.emptyDescription}>
              Create your profile to connect with others and personalize your experience
            </ThemedText>

            <Pressable
              style={({ pressed }) => [
                styles.createProfileButton,
                { opacity: pressed ? 0.7 : 1 }
              ]}
              onPress={goToCreateProfile}
              onPressIn={handlePressIn}
            >
              <ThemedText style={styles.createProfileButtonText}>
                Create Profile
              </ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
  );
}

export default function ProfileScreen() {
  const user = useValue(authState.user);
  const userNotFound = useValue(createProfile$.userNotFound);
  const avatarUrl = useValue(authState.user.avatarUri);
  console.log(avatarUrl);
  const { handlePressIn } = pressableAnimation();



  // Refresh user in background every time profile screen gains focus
  useFocusEffect(
    useCallback(() => {
      void getUser(); // fire-and-forget; state will update UI when ready
    }, [])
  );

  if (userNotFound) {
    return <ProfileEmptyState />;
  }

  const goBack = () => {
    router.push('/(tabs)/home');
  };

  const bucketColor = styles.bucketColor.color.toString();
  const profileVisibleTo = user?.profileVisibleTo;

  const editProfile = () => {
    authState.isInTheProfileUpdateMode.set(true)
    return router.push('/(tabs)/profile/update-profile');
  };

  const settings = () => {
    authState.isInTheProfileUpdateMode.set(true)
    return router.push('/(tabs)/profile/settings');
  };


  const logoutButton = (event: any) => {
    showConfirmDialog('Are you sure you want to logout?', {
      confirmText: 'Logout',
      cancelText: 'Cancel',
      confirmVariant: 'destructive',
      cancelVariant: 'default',
      position: {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY
      }
    }).then((result) => {
      if (result) {
        logout();
      }
    });
  };

  const logout = async () => {
    try {
      const response = await profileApi.logout({ allSessions: false });
      if (response.status) {
        clearSession();
      }
    } catch (error) {
      clearSession();
    }
  };

  return (
    <>

      <ThemedViewWithSidebar>
        <ThemedViewWithSidebar.Sidebar>
          <Sidebar />
        </ThemedViewWithSidebar.Sidebar>
        <ThemedViewWithSidebar.Main>
          <ThemedView style={styles.mainContainer}>

            {/* Header Section */}
            <Header
              Icon={
                <ThemedText type='subtitle'>{user?.name}</ThemedText>
              }
              leftButton={{
                child: <IconSymbol name='arrow.left' />,
                onPress: goBack,
              }}
              centerIcon={true}
            />
            {/* Header Section End */}

            {/* Edit Icon Section */}
            <ThemedView style={styles.outerEditIcon}>
              <Pressable
                onPress={editProfile}
                onPressIn={handlePressIn}
                style={({ pressed }) => [
                  { opacity: pressed ? 0.1 : 1 },
                  styles.editIcon
                ]}
              >
                <MaterialCommunityIcon name='account.edit' size={32} />
                <ThemedText style={[styles.bucketText, styles.bio]} selectable={false}>
                  Update Profile
                </ThemedText>
              </Pressable>
            </ThemedView>
            {/* Edit Icon Section End */}

            {/* Profile Section: flex:row */}
            <ThemedView style={styles.container}>

              {/* Profile Picture Section */}
              <ThemedView style={styles.profilePictureContainer}>

                {/* Profile Picture */}
                <Pressable style={({ pressed }) => [
                  { opacity: pressed ? 0.1 : 1 },
                  styles.profilePicture
                ]}>
                  <Image
                    source={{ uri: avatarUrl || '' }}
                    style={styles.profilePictureImage}
                  />
                </Pressable>
                {/* Profile Picture End */}

                {/* Outer Bucket Section */}
                <ThemedView style={styles.outerBucketContainer}>

                  {/* Profile Mode */}
                  <ThemedView style={styles.bucketContainer}>
                    <FontAwesome5Icon
                      name={profileVisibleTo === 'private' ? 'account.lock' : 'account.unlock'}
                      size={20}
                      color={bucketColor}
                    />
                    <ThemedText type='small' style={styles.bucketText} selectable={false}>
                      {profileVisibleTo}
                    </ThemedText>
                  </ThemedView>
                  {/* Profile Mode End */}

                  {/* Followers */}
                  <Pressable
                    onPressIn={handlePressIn}
                    style={({ pressed }) => [
                      { opacity: pressed ? 0.1 : 1 },
                      styles.bucketContainer, { marginLeft: -4 }
                    ]}>
                    <EntypoIcon name="bucket" size={20} color={bucketColor} />
                    <ThemedText type='small' style={styles.bucketText} selectable={false}>
                      {user?.followers}
                    </ThemedText>
                  </Pressable>
                  {/* Followers End */}

                  {/* Following */}
                  <Pressable
                    onPressIn={handlePressIn}
                    style={({ pressed }) => [
                      { opacity: pressed ? 0.1 : 1 },
                      styles.bucketContainer
                    ]}>
                    <FontAwesome5Icon name="account.friends" size={20} color={bucketColor} />
                    <ThemedText type='small' style={styles.bucketText} selectable={false}>
                      {user?.following}
                    </ThemedText>
                  </Pressable>
                  {/* Following End */}

                  {/* Posts  */}
                  <Pressable
                    onPressIn={handlePressIn}
                    style={({ pressed }) => [
                      { opacity: pressed ? 0.1 : 1 },
                      styles.bucketContainer
                    ]}>
                    <FontAwesome5Icon name="list" size={22} color={bucketColor} />
                    <ThemedText type='small' style={styles.bucketText} selectable={false}>
                      Posts
                    </ThemedText>
                  </Pressable>
                  {/* Posts End */}

                  {/* Settings  */}
                  <Pressable
                    onPress={settings}
                    onPressIn={handlePressIn}
                    style={({ pressed }) => [
                      { opacity: pressed ? 0.1 : 1 },
                      styles.bucketContainer, { marginLeft: -4.1 }
                    ]}>
                    <MaterialCommunityIcon name="account.settings" size={25} color={bucketColor} />
                    <ThemedText type='small' style={styles.bucketText} selectable={false}>
                      Settings
                    </ThemedText>
                  </Pressable>
                  {/* Settings End */}


                  {/* Logout */}
                  <Pressable
                    onPress={logoutButton}
                    onPressIn={handlePressIn}
                    style={({ pressed }) => [
                      { opacity: pressed ? 0.1 : 1 },
                      styles.bucketContainer
                    ]}>
                    <EntypoIcon name="account.logout" size={20} color='red' />
                    <ThemedText type='small' style={styles.bucketText} selectable={false}>
                      Logout
                    </ThemedText>
                  </Pressable>
                  {/* Logout End */}


                </ThemedView>
                {/* Outer Bucket Section End */}

              </ThemedView>
              {/* Profile Picture Section End */}

              {/* User Info Section */}
              <ThemedView style={styles.userInfoContainer}>
                <ThemedText type='semibold'>@{user?.username}</ThemedText>
                <ThemedText style={styles.bio}>{user?.bio}</ThemedText>
              </ThemedView>
              {/* User Info Section End */}

            </ThemedView>
            {/* Profile Section flex:row End */}

          </ThemedView>
          {/* Main Container End */}
        </ThemedViewWithSidebar.Main>
      </ThemedViewWithSidebar>

    </>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  mainContainer: {
    flex: 1,
    paddingTop: rt.insets.top,
  },
  container: {
    height: 290,
    width: '100%',
    flexDirection: 'row',
    padding: 20,
    // backgroundColor:'white',
    paddingLeft: 30,
    paddingTop: 0,
    gap: 20,
  },
  profilePictureContainer: {
    // height: 290,
    width: 80,
    gap: 20
  },
  profilePicture: {
    height: 80,
    width: 80,
    backgroundColor: theme.colors.icon,
    borderRadius: 9999,
  },
  profilePictureImage: {
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    borderRadius: 9999,
  },
  outerBucketContainer: {
    gap: 10

  },
  bucketContainer: {
    flexDirection: 'row',
    width: 70,
    gap: 10,
    alignItems: 'center',
  },
  bucketColor: {
    color: theme.colors.primary,
  },
  bucketText: {
    color: theme.colors.whiteOrBlack,
  },
  userInfoContainer: {
    width: '72%',
    paddingTop: 20,
    gap: 3,
    paddingBottom: 20,
    paddingRight: 15,
  },
  bio: {
    fontSize: 13,
  },
  outerEditIcon: {
    marginBottom: 20,
    paddingLeft: 25,
  },
  editIcon: {
    width: 125,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  // Empty State Styles
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyContent: {
    alignItems: 'center',
    gap: 20,
    maxWidth: 300,
  },
  emptyDescription: {
    textAlign: 'center',
    opacity: 0.7,
    fontSize: 16,
  },
  createProfileButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 10,
  },
  createProfileButtonText: {
    color: theme.colors.lightbackgroundText,
    fontWeight: 'bold',
    fontSize: 16,
  },
}));