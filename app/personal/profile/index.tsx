import Header from '@/components/header/Header';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { UsernameDisplay } from '@/components/ui/common/UsernameDisplay';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { EntypoIcon } from '@/components/ui/fonts/entypoIcons';
import { FontAwesome5Icon } from '@/components/ui/fonts/fontAwesome5';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { profileApi } from '@/lib/publicLib/profileApi/public.api.profile';
import { clearSession } from '@/lib/storage/commonStorage/storage.auth';
import { authState } from '@/state/auth/state.auth';
import { $personalStateCreateProfile } from '@/state/personalState/profile/personal.state.profile.createProfile';
import { $personalStateUser } from '@/state/personalState/user/personal.state.user';
import { showConfirmDialog } from '@/utils/commonUtils/util.modal';
import { PersonalUtilGetUser } from '@/utils/personalUtils/personal.util.profile';
import { Memo, Show, useValue } from '@legendapp/state/react';
import { router, Stack } from 'expo-router';
import { useCallback } from 'react';
import { Image, Pressable, RefreshControl, ScrollView } from 'react-native';
import styles from './profile.styles';
import { commonAuthApi } from '@/lib/commonLib/authApi/common.api.auth';
import { useUnistyles } from 'react-native-unistyles';

// Empty State Component
function ProfileEmptyState() {
  const { handlePressIn } = pressableAnimation();
  const goToCreateProfile = () => {
    authState.isInTheProfileUpdateMode.set(true)
    router.push("/personal/profile/create-profile");
  };

  return (
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
  );
}

export default function ProfileScreen() {
  const { theme, rt } = useUnistyles();
  const { handlePressIn } = pressableAnimation();
  const refreshing = useValue($personalStateUser.refreshing);

  const onRefresh = useCallback(async () => {
    $personalStateUser.refreshing.set(true);
    try {
      await PersonalUtilGetUser();
    } finally {
      $personalStateUser.refreshing.set(false);
    }
  }, []);

  const goBack = () => {
    router.push('/personal/home');
  };

  const bucketColor = styles.bucketColor.color.toString();

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
      const response = await commonAuthApi.logout({ all_sessions: false });
      if (response.status) {
        clearSession();
      }
    } catch (error) {
      clearSession();
    }
  };

  return (<>
    <Stack.Screen
      options={{
        header: () => (
          <ThemedView style={{ paddingTop: rt.insets.top }}>
            <Header
              onBackPress={goBack}
              centerSection={
                <ThemedText type='subtitle'>
                  <Memo>{$personalStateUser.user.name}</Memo>
                </ThemedText>
              }
            />
          </ThemedView>
        )
      }}
    />
    <Show
      if={$personalStateCreateProfile.userNotFound}
      else={() => {
        return (
          <ThemedView style={styles.mainContainer}>
            <ScrollView
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                />
              }
            >

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
                    <Memo>
                      <Image
                        source={{ uri: $personalStateUser.user.avatar_url.get() || '' }}
                        style={styles.profilePictureImage}
                      />
                    </Memo>
                  </Pressable>
                  {/* Profile Picture End */}

                  {/* Outer Bucket Section */}
                  <ThemedView style={styles.outerBucketContainer}>

                    {/* Profile Mode */}
                    <ThemedView style={styles.bucketContainer}>
                      <Memo>
                        {() => {
                          const profileType = $personalStateUser.user.profile_type.get();
                          return (
                            <>
                              <FontAwesome5Icon
                                name={profileType === 'private' ? 'account.lock' : 'account.unlock'}
                                size={20}
                                color={bucketColor}
                              />
                              <ThemedText type='small' style={styles.bucketText} selectable={false}>
                                {profileType ? profileType[0].toUpperCase() + profileType.slice(1) : profileType}
                              </ThemedText>
                            </>
                          );
                        }}
                      </Memo>
                    </ThemedView>
                    {/* Profile Mode End */}


                    {/* Settings  */}
                    <Pressable
                      onPress={settings}
                      onPressIn={handlePressIn}
                      style={({ pressed }) => [
                        { opacity: pressed ? 0.1 : 1 },
                        styles.bucketContainer, { marginLeft: -4.1, marginTop: -3 }
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
                    <ThemedText
                      type='astaSansWithoutColorAndSize'
                      style={styles.usernameStrings}
                      selectable={false}
                    >
                      Username:{'   '}
                      <UsernameDisplay
                        username={$personalStateUser.user.username.get()}
                        lettersStyle={styles.usernameStrings}
                        numbersStyle={styles.usernameNumbers}
                      />
                    </ThemedText>
                  </ThemedView>
                  <ThemedText style={styles.bio}>
                    <ThemedText style={styles.bio} selectable={false}>Bio:{'   '}</ThemedText>

                    <ThemedText style={styles.bio} selectable>
                      <Memo>
                        {$personalStateUser.user.bio}
                      </Memo>
                    </ThemedText>

                  </ThemedText>
                  {/* <ThemedText style={styles.bio}>Created At:   {formatDateTime(user?.createdAt)}</ThemedText> */}
                </ThemedView>
                {/* User Info Section End */}

              </ThemedView>
              {/* Profile Section flex:row End */}

            </ScrollView>
          </ThemedView>
        );
      }}
    >
      {() => <ProfileEmptyState />}
    </Show>
  </>
  );
}