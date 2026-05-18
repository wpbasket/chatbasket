import Header from '@/components/header/Header';
import { AppButton } from '@/components/ui/common/AppButton';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { UsernameDisplay } from '@/components/ui/common/UsernameDisplay';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { EntypoIcon } from '@/components/ui/fonts/entypoIcons';
import { FontAwesome5Icon } from '@/components/ui/fonts/fontAwesome5';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { profileApi } from '@/lib/publicLib/profileApi/public.api.profile';
import { clearSession, resetAuthStateAfterLogout } from '@/lib/storage/commonStorage/storage.auth';
import { authState } from '@/state/auth/state.auth';
import { $personalStateCreateProfile } from '@/state/personalState/profile/personal.state.profile.createProfile';
import { $personalStateUser } from '@/state/personalState/user/personal.state.user';
import { runWithLoading, showConfirmDialog } from '@/utils/commonUtils/util.modal';
import { PersonalUtilGetUser } from '@/utils/personalUtils/personal.util.profile';
import { Memo, Show, useValue } from '@legendapp/state/react';
import { router, Stack } from 'expo-router';
import { useCallback } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { ProfileAvatar } from '@/components/personal/profile/ProfileAvatar';
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
    await runWithLoading(async () => {
      try {
        const response = await commonAuthApi.logout({ all_sessions: false });
        if (response.status) {
          await clearSession({ skipAuthStateReset: true });
        }
      } catch (error) {
        await clearSession({ skipAuthStateReset: true });
      }
    }, {
      message: 'Logging out...',
      cancellable: false,
    });

    resetAuthStateAfterLogout();
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

              {/* ─── Update Profile Button ─────────────────────── */}
              <ThemedView style={styles.outerEditIcon}>
                <AppButton
                  label="Update Profile"
                  icon={<MaterialCommunityIcon name='account.edit' size={20} />}
                  onPress={editProfile}
                  onPressIn={handlePressIn}
                  pressedOpacity={0.1}
                  // textType="default"
                  // labelStyle={[styles.bucketText, styles.bioText]}
                  style={styles.editIcon}
                />
              </ThemedView>

              {/* ─── Profile Info Section (Avatar + User Info) ─── */}
              <ThemedView style={styles.profileInfoSection}>

                {/* Left Column: Avatar + Username */}
                <ThemedView style={styles.avatarColumn}>
                  {/* Avatar */}
                  <Pressable style={({ pressed }) => [
                    { opacity: pressed ? 0.1 : 1 },
                    styles.profilePicture
                  ]}>
                    <ProfileAvatar />
                  </Pressable>

                  {/* Username */}
                  <ThemedView style={styles.usernameContainer}>
                    <ThemedText
                      type='astaSansWithoutColorAndSize'
                      selectable
                    >
                      <UsernameDisplay
                        username={$personalStateUser.user.username.get()}
                        lettersStyle={styles.usernameStrings}
                        numbersStyle={styles.usernameNumbers}
                      />
                    </ThemedText>
                  </ThemedView>
                </ThemedView>

                {/* Right Column: User Info */}
                <ThemedView style={styles.userInfoContainer}>
                  {/* Profile Type Pill */}
                  <Memo>
                    {() => {
                      const profileType = $personalStateUser.user.profile_type.get();
                      const iconName = profileType === 'private' ? 'account.lock' : 'account.unlock';
                      return (
                        <View style={styles.profileTypeBadge}>
                          <FontAwesome5Icon name={iconName} size={18} color={theme.colors.primary} />
                          <ThemedText style={styles.profileTypeBadgeText} selectable={false}>
                            {profileType ? profileType[0].toUpperCase() + profileType.slice(1) : ''}
                          </ThemedText>
                        </View>
                      );
                    }}
                  </Memo>

                  <ThemedText style={styles.bioText} selectable>
                    <Memo>
                      {$personalStateUser.user.bio}
                    </Memo>
                  </ThemedText>
                </ThemedView>

              </ThemedView>

              {/* ─── Menu Section (Settings, Logout) ─── */}
              <ThemedView style={styles.menuSection}>

                {/* Settings */}
                <AppButton
                  label="Settings"
                  icon={
                    <View style={[styles.menuItemIcon, { marginLeft: -1 }]}>
                      <MaterialCommunityIcon name="account.settings" size={25} color={bucketColor} />
                    </View>
                  }
                  onPress={settings}
                  onPressIn={handlePressIn}
                  pressedOpacity={0.1}
                  asymmetric={false}
                  labelStyle={styles.bucketText}
                  style={[styles.menuItem, { justifyContent: 'flex-start', alignSelf: 'flex-start' }]}
                />

                {/* Logout */}
                <AppButton
                  label="Logout"
                  icon={
                    <View style={styles.menuItemIcon}>
                      <EntypoIcon name="account.logout" size={20} color='red' />
                    </View>
                  }
                  onPress={logoutButton}
                  onPressIn={handlePressIn}
                  pressedOpacity={0.1}
                  asymmetric={false}
                  labelStyle={styles.bucketText}
                  style={[styles.menuItem, { justifyContent: 'flex-start', alignSelf: 'flex-start' }]}
                />

              </ThemedView>

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