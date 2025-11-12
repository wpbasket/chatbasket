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
import { useLegend$ } from '@/hooks/commonHooks/hooks.useLegend';
import { profileApi } from '@/lib/publicLib/profileApi/public.api.profile';
import { clearSession } from '@/lib/storage/commonStorage/storage.auth';
import { authState } from '@/state/auth/state.auth';
import { $personalStateCreateProfile } from '@/state/personalState/profile/personal.state.profile.createProfile';
import { $personalStateUser } from '@/state/personalState/user/personal.state.user';
import { showConfirmDialog } from '@/utils/commonUtils/util.modal';
import { PersonalUtilGetUser } from '@/utils/personalUtils/personal.util.profile';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { Image, Pressable } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

// Helper function to format username with colored numbers
const formatUsername = (username: string | undefined): { letters: string; numbers: string } | null => {
  if (!username || username.length !== 10) return null;

  // New format: 4 letters + 6 numbers
  return {
    letters: username.slice(0, 4),
    numbers: username.slice(4, 10),
  };
};

// Empty State Component
function ProfileEmptyState() {
  const { handlePressIn } = pressableAnimation();
  const goToCreateProfile = () => {
    authState.isInTheProfileUpdateMode.set(true)
    router.push("/personal/profile/create-profile");
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
  const user = useLegend$($personalStateUser.user);
  const avatarUrl = useLegend$($personalStateUser.user.avatar_url);
  console.log(avatarUrl)
  const userNotFound = useLegend$($personalStateCreateProfile.userNotFound);
  const { handlePressIn } = pressableAnimation();

  // Format username parts
  const usernameParts = formatUsername(user?.username);

  // Refresh user in background every time profile screen gains focus
  useFocusEffect(
    useCallback(() => {
      void PersonalUtilGetUser(); // fire-and-forget; state will update UI when ready
    }, [])
  );

  if (userNotFound) {
    return <ProfileEmptyState />;
  }

  const goBack = () => {
    router.push('/personal/home');
  };

  const bucketColor = styles.bucketColor.color.toString();
  const profileType = user?.profile_type;

  const editProfile = () => {
    authState.isInTheProfileUpdateMode.set(true)
    return router.push('/personal/profile/update-profile');
  };

  const settings = () => {
    authState.isInTheProfileUpdateMode.set(true)
    return router.push('/personal/profile/settings');
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
                      name={profileType === 'private' ? 'account.lock' : 'account.unlock'}
                      size={20}
                      color={bucketColor}
                    />
                    <ThemedText type='small' style={styles.bucketText} selectable={false}>
                      {profileType ? profileType[0].toUpperCase() + profileType.slice(1) : profileType}
                    </ThemedText>
                  </ThemedView>
                  {/* Profile Mode End */}

                  {/* Contacts */}
                  <Pressable
                    onPress={() => router.push('/personal/profile/contacts')}
                    onPressIn={handlePressIn}
                    style={({ pressed }) => [
                      { opacity: pressed ? 0.1 : 1 },
                      styles.bucketContainer
                    ]}>
                    <FontAwesome5Icon name="account.friends" size={20} color={bucketColor} />
                    <ThemedText type='small' style={styles.bucketText} selectable={false}>
                      Contacts
                    </ThemedText>
                  </Pressable>
                  {/* Contacts End */}

                  {/* Settings  */}
                  <Pressable
                    onPress={settings}
                    onPressIn={handlePressIn}
                    style={({ pressed }) => [
                      { opacity: pressed ? 0.1 : 1 },
                      styles.bucketContainer, { marginLeft: -4.1 ,marginTop:-3}
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
                <ThemedView style={styles.usernameContainer}>
                  <ThemedText type='astaSansWithoutColorAndSize' style={styles.usernameStrings}>
                    <ThemedText
                      type='astaSansWithoutColorAndSize'
                      style={styles.usernameStrings}
                      selectable={false}
                    >
                      Username:{'   '}
                    </ThemedText>
                    <ThemedText type='astaSansWithoutColorAndSize' style={styles.usernameStrings} selectable>
                      {usernameParts?.letters}
                    </ThemedText>
                    <ThemedText type='astaSansWithoutColorAndSize' style={styles.usernameNumbers} selectable>
                      {usernameParts?.numbers}
                    </ThemedText>
                  </ThemedText>
                </ThemedView>
                <ThemedText style={styles.bio}>
                  <ThemedText style={styles.bio} selectable={false}>Bio:{'   '}</ThemedText>
                  <ThemedText style={styles.bio} selectable>{user?.bio}</ThemedText>
                </ThemedText>
                {/* <ThemedText style={styles.bio}>Created At:   {formatDateTime(user?.createdAt)}</ThemedText> */}
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
  usernameContainer: {
    flexDirection: 'row',
  },
  usernameStrings:{
    color:theme.colors.title,
  },
  usernameNumbers: {
    color: theme.colors.primary,
    fontWeight:'bold',
    letterSpacing:0.5
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