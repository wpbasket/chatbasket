import { StyleSheet, useUnistyles } from "react-native-unistyles"
import { ThemedView } from "@/components/ui/common/ThemedView"
import { ThemedText } from "@/components/ui/common/ThemedText"
import { createProfile$ } from "@/state/publicState/profile/createProfile.state"
import { use$ } from "@legendapp/state/react"
import { Platform, Pressable, TextInput } from "react-native"
import { pressableAnimation } from "@/hooks/pressableAnimation";
import { Dropdown } from "@/components/ui/common/DropDown"
import { showAlert, runWithLoading } from "@/utils/modal.util"
import { IconSymbol } from "@/components/ui/fonts/IconSymbol"
import { profileApi } from "@/lib/publicLib/api/profileApi/api.profile"
import { useEffect } from "react"
import { ApiError } from "@/lib/publicLib/api"
import { router } from "expo-router"
import { authState } from "@/state/auth/auth.state"
import { getUser } from "@/utils/profile.util"
import { ThemedViewWithSidebar } from "@/components/ui/common/ThemedViewWithSidebar"
import Sidebar from "@/components/sidebar/Sidebar"
import Header from "@/components/header/Header"

export default function CreateProfile() {
  // Redirect to profile if user already has a profile
  useEffect(() => {
    if (authState.user.get()) {
      authState.isInTheProfileUpdateMode.set(false)
      router.replace('/profile');
    }
  }, []);

  const goBack = () => {
    router.back();
  };

  // All hooks must be called at the top level
  const userId= use$(authState.userId)
  const name = use$(createProfile$.name)
  const payloadUsername = use$(createProfile$.username)
  const profileVisibleTo = use$(createProfile$.profileVisibleTo)
  const bio = use$(createProfile$.bio)
  const isUsernameSubmitted = use$(createProfile$.usernameSubmitted)
  const isSubmitted = use$(createProfile$.submitted)
  const isUsernameChecked = use$(createProfile$.usernameChecked)
  const isNameValid = use$(createProfile$.isNameValid)
  const isUsernameValid = use$(createProfile$.isUsernameValid)
  const isProfileVisibleToValid = use$(createProfile$.isProfileVisibleToValid)
  const isBioValid = use$(createProfile$.isBioValid)
  const isValid = use$(createProfile$.isValid)
  const { handlePressIn } = pressableAnimation();
  const { theme } = useUnistyles();

  useEffect(() => {
    // Clean up when component unmounts
    return () => {
      createProfile$.reset()
      authState.isInTheProfileUpdateMode.set(false)
    };
  }, []);

  const checkUsername = async () => {
    if (!isUsernameValid) {
      createProfile$.usernameSubmit()
      showAlert('Username is not valid\nOnly letters, numbers, . and _ are allowed\nMaximum length is 30 characters')
      return;
    }

    try {
      const response: any = await runWithLoading(
        () => profileApi.checkUsername({ username: payloadUsername! }),
        { message: 'Checking username' }
      );
      if (response.status) {
        createProfile$.usernameChecked.set(true);
      }
    } catch (error) {
      showAlert('Something went wrong try again')
    }
  }

  const handleProfileCreation = async () => {
    if (!isValid) {
      createProfile$.submit();
      return;
    }

    try {
      const response: any = await runWithLoading(
        () => profileApi.createProfile({
        name: name!,
        username: payloadUsername!,
        profileVisibleTo: profileVisibleTo!,
        bio: bio!
      }),
      { message: 'Creating profile' }
      );

      if (response) {
        // Update the global auth state
        authState.user.set(response);
        createProfile$.userNotFound.set(false);
        // Navigate back to profile screen
        router.back();
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.type === 'conflict') {
          // Profile already exists but user is still on create profile screen
          // Force refresh user data and navigate to profile
          try {
            // getUser returns void, so we'll just refresh the page to sync state
            await getUser();
          } catch (e) {
            console.error('Failed to refresh user data:', e);
            // Even if refresh fails, still navigate to profile to avoid being stuck
          }
          router.back();
          return;
        }
        if (error.type === 'conflict_username') {
          // Username is already taken
          showAlert('Username is already taken. Please choose another one.');
          return;
        }
        // Handle other API errors
        showAlert(error.message || 'Something went wrong. Please try again.');
      } else {
        // Handle non-API errors
        console.error('Profile creation error:', error);
        showAlert('An unexpected error occurred. Please try again.');
      }
    }
  }

  return (
    <ThemedViewWithSidebar>
      <ThemedViewWithSidebar.Sidebar>
        <Sidebar />
      </ThemedViewWithSidebar.Sidebar>
      <ThemedViewWithSidebar.Main>
        <ThemedView style={styles.mainContainer}>
          <Header
          leftButton={{
            child: <IconSymbol name='arrow.left' />,
            onPress: goBack,
          }}
          Icon={<ThemedText type='subtitle'>Create Profile</ThemedText>}
          />
          
        <ThemedView style={styles.container}>
          <ThemedText type="title">Create Profile</ThemedText>


          <TextInput
            placeholder="Name"
            inputMode='text'
            maxLength={70}
            value={name ?? ""}
            onChangeText={(text) => createProfile$.name.set(text)}
            textContentType='name'
            placeholderTextColor="gray"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, !isNameValid && isSubmitted && styles.inputError]}
          />


          <ThemedView style={[styles.inputContainer, (!isUsernameValid || !isUsernameChecked) && (isUsernameSubmitted || isSubmitted) && styles.inputError]}>
            <TextInput
              placeholder="Username"
              maxLength={30}
              inputMode='text'
              value={payloadUsername ?? ""}
              onChangeText={(text) => { createProfile$.username.set(text); createProfile$.usernameChecked.set(false) }}
              textContentType='username'
              placeholderTextColor="gray"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.inputField, { outlineColor: 'none' }]}
            />
            <Pressable onPress={checkUsername} style={({ pressed }) => [
              styles.inputButton,
              { opacity: pressed ? 0.1 : 1 }
            ]}>
              {isUsernameChecked ? (
                <IconSymbol name="check" size={25} />
              ) : (
                <ThemedText selectable={false} color={theme.colors.primary} type='smallBold'>Check</ThemedText>
              )}
            </Pressable>
          </ThemedView>


          <TextInput
            placeholder="Bio"
            inputMode='text'
            value={bio ?? ""}
            onChangeText={(text) => createProfile$.bio.set(text)}
            placeholderTextColor="gray"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={200}
            multiline={true}
            style={[styles.bio, !isBioValid && isSubmitted && styles.inputError]}
          />

          <ThemedView style={[styles.profileVisibleToContainer, { backgroundColor: theme.colors.neutral1 }]} >
            <Dropdown
              options={[
                { label: 'Public', value: 'public' },
                { label: 'Private', value: 'private' },
                { label: 'Follower', value: 'follower' },
              ]}
              value={profileVisibleTo}
              placeholder="Select profile visibility"
              error={!isProfileVisibleToValid && isSubmitted}
              searchable={false}
              style={styles.reverseModalBackground}
              modalStyles={{ container: styles.modalBackground }}
              onSelect={(value) => createProfile$.profileVisibleTo.set(value as 'public' | 'private' | 'follower')}
            />

          </ThemedView>

          <Pressable
            style={({ pressed }) => [
              styles.submit,
              { opacity: pressed ? 0.1 : 1 }
            ]}
            onPress={handleProfileCreation}
            onPressIn={handlePressIn}
          >
            <ThemedText style={styles.submitText} selectable={false}>Create</ThemedText>
          </Pressable>
        </ThemedView>
        </ThemedView>
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
  )
}

const styles = StyleSheet.create((theme, rt) => ({
  mainContainer: {
    flex: 1,
    paddingTop: rt.insets.top,
  },
  container: {
    height: 500,
    padding: 20,
    borderRadius: 20,
    maxWidth: 600,
    backgroundColor: Platform.OS === 'web' ? theme.colors.BackgroundSelect2 : theme.colors.background,
    gap: 20
  },
  input: {
    height: 40,
    width: 350,
    borderColor: theme.colors.neutral2,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    color: theme.colors.text,
  },
  inputError: {
    borderColor: theme.colors.red,
  },
  submit: {
    height: 70,
    width: 70,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 9999,
    backgroundColor: theme.colors.primary,
  },
  submitText: {
    color: theme.colors.lightbackgroundText,
    fontWeight: 'bold',
    fontSize: 16,
  },
  bio: {
    height: 100,
    width: 350,
    borderColor: theme.colors.neutral2,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    color: theme.colors.text,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 350,
    height: 40,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    borderColor: theme.colors.neutral2,
  },
  inputField: {
    flex: 1,
    height: '100%',
    color: theme.colors.text,
    paddingRight: 10,
  },
  inputButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileVisibleToContainer: {
    width: 350,
    height: 40,
    borderRadius: 5,
  },
  reverseModalBackground: {
    backgroundColor: Platform.OS === 'web' ? theme.colors.BackgroundSelect2 : theme.colors.background,
  },
  modalBackground: {
    borderColor: theme.colors.neutral2,
    borderWidth: Platform.OS === 'web' ? 1 : 0,
  }

}))