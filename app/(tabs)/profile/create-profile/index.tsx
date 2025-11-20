import Header from "@/components/header/Header"
import Sidebar from "@/components/sidebar/Sidebar"
import { Dropdown } from "@/components/ui/common/DropDown"
import { ThemedText } from "@/components/ui/common/ThemedText"
import { ThemedView } from "@/components/ui/common/ThemedView"
import { ThemedViewWithSidebar } from "@/components/ui/common/ThemedViewWithSidebar"
import { IconSymbol } from "@/components/ui/fonts/IconSymbol"
import { pressableAnimation } from "@/hooks/commonHooks/hooks.pressableAnimation"
import { ApiError } from "@/lib/constantLib"
import { profileApi } from "@/lib/publicLib/profileApi/public.api.profile"
import { authState } from "@/state/auth/state.auth"
import { createProfile$ } from "@/state/publicState/profile/public.state.profile.createProfile"
import { runWithLoading, showAlert } from "@/utils/commonUtils/util.modal"
import { getUser } from "@/utils/publicUtils/public.util.profile"
import { useValue } from "@legendapp/state/react"
import { router } from "expo-router"
import { useEffect } from "react"
import { Platform, Pressable, TextInput } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"

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
  const userId= useValue(authState.userId)
  const name = useValue(createProfile$.name)
  const payloadUsername = useValue(createProfile$.username)
  const profileVisibleTo = useValue(createProfile$.profileVisibleTo)
  const bio = useValue(createProfile$.bio)
  const isUsernameSubmitted = useValue(createProfile$.usernameSubmitted)
  const isSubmitted = useValue(createProfile$.submitted)
  const isUsernameChecked = useValue(createProfile$.usernameChecked)
  const isNameValid = useValue(createProfile$.isNameValid)
  const isUsernameValid = useValue(createProfile$.isUsernameValid)
  const isProfileVisibleToValid = useValue(createProfile$.isProfileVisibleToValid)
  const isBioValid = useValue(createProfile$.isBioValid)
  const isValid = useValue(createProfile$.isValid)
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
      const response = await runWithLoading(
        () => profileApi.checkUsername({ username: payloadUsername! }),
        { message: 'Checking username' }
      );
      if (response.status) {
        console.log('Username is available');
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
              style={[styles.inputField, { outline:'none' }]}
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

          <ThemedView style={[styles.profileVisibleToContainer]} >
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
    borderColor: theme.colors.neutral5,
    borderWidth: 1,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    paddingHorizontal: 16,
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
    borderWidth: 1,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    borderColor: theme.colors.neutral5,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: theme.colors.text,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 350,
    height: 40,
    borderWidth: 1,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    paddingHorizontal: 16,
    borderColor: theme.colors.neutral5,
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
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    borderColor: theme.colors.neutral5,
    borderWidth: 1,
  },
  reverseModalBackground: {
    height: 38,
    width: 340,
    borderWidth: 0,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 8,
    borderTopRightRadius: 25,
    paddingHorizontal: 16,
  }
}))