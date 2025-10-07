import Header from "@/components/header/Header"
import Sidebar from "@/components/sidebar/Sidebar"
import { Dropdown } from "@/components/ui/common/DropDown"
import { ThemedText } from "@/components/ui/common/ThemedText"
import { ThemedView } from "@/components/ui/common/ThemedView"
import { ThemedViewWithSidebar } from "@/components/ui/common/ThemedViewWithSidebar"
import { IconSymbol } from "@/components/ui/fonts/IconSymbol"
import { pressableAnimation } from "@/hooks/commonHooks/hooks.pressableAnimation"
import { useLegend$ } from "@/hooks/commonHooks/hooks.useLegend"
import { ApiError } from "@/lib/constantLib"
import { PersonalProfileApi } from "@/lib/personalLib/profileApi/personal.api.profile"
import { authState } from "@/state/auth/state.auth"
import { $personalStateCreateProfile } from "@/state/personalState/profile/personal.state.profile.createProfile"
import { $personalStateUser } from "@/state/personalState/user/personal.state.user"
import { runWithLoading, showAlert } from "@/utils/commonUtils/util.modal"
import { PersonalUtilGetUser } from "@/utils/personalUtils/personal.util.profile"
import { router } from "expo-router"
import { useEffect } from "react"
import { Platform, Pressable, TextInput } from "react-native"
import { StyleSheet, useUnistyles } from "react-native-unistyles"

export default function PersonalCreateProfile() {
  // Redirect to profile if user already has a profile
  useEffect(() => {
    if ($personalStateUser.user.get()) {
      authState.isInTheProfileUpdateMode.set(false)
      router.replace('/personal/profile');
    }
  }, []);

  const goBack = () => {
    router.back();
  };

  // All hooks must be called at the top level
  const name = useLegend$($personalStateCreateProfile.name)
  const profileType = useLegend$($personalStateCreateProfile.profile_type)
  const bio = useLegend$($personalStateCreateProfile.bio)
  const isSubmitted = useLegend$($personalStateCreateProfile.submitted)
  const isNameValid = useLegend$($personalStateCreateProfile.isNameValid)
  const isProfileTypeValid = useLegend$($personalStateCreateProfile.isProfileTypeValid)
  const isBioValid = useLegend$($personalStateCreateProfile.isBioValid)
  const isValid = useLegend$($personalStateCreateProfile.isValid)
  const { handlePressIn } = pressableAnimation();

  useEffect(() => {
    // Clean up when component unmounts
    return () => {
      $personalStateCreateProfile.reset()
      authState.isInTheProfileUpdateMode.set(false)
    };
  }, []);


  const handleProfileCreation = async () => {
    if (!isValid) {
      $personalStateCreateProfile.submit();
      return;
    }

    try {
      const response: any = await runWithLoading(
        () => PersonalProfileApi.createProfile({
        name: name!,
        profile_type: profileType!,
        bio: bio!
      }),
      { message: 'Creating profile' }
      );

      if (response) {
        // Update the global user state
        $personalStateUser.user.set(response);
        $personalStateCreateProfile.userNotFound.set(false);
        // Navigate back to profile screen
        router.back();
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.type === 'conflict') {
          // Profile already exists but user is still on create profile screen
          // Force refresh user data and navigate to profile
          void PersonalUtilGetUser();
          router.back();
          return;
        }
        showAlert(error.message || 'Something went wrong. Please try again.');
      } else {
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
            maxLength={40}
            value={name ?? ""}
            onChangeText={(text) => $personalStateCreateProfile.name.set(text)}
            textContentType='name'
            placeholderTextColor="gray"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, !isNameValid && isSubmitted && styles.inputError]}
          />

          <TextInput
            placeholder="Bio"
            inputMode='text'
            value={bio ?? ""}
            onChangeText={(text) => $personalStateCreateProfile.bio.set(text)}
            placeholderTextColor="gray"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={150}
            multiline={true}
            style={[styles.bio, !isBioValid && isSubmitted && styles.inputError]}
          />

          <ThemedView style={[styles.profileVisibleToContainer]} >
            <Dropdown
              options={[
                { label: 'Public', value: 'public' },
                { label: 'Private', value: 'private' },
                { label: 'Personal', value: 'Personal' },
              ]}
              value={profileType}
              placeholder="Select profile visibility"
              error={!isProfileTypeValid && isSubmitted}
              searchable={false}
              style={styles.reverseModalBackground}
              onSelect={(value) => $personalStateCreateProfile.profile_type.set(value as 'public' | 'private' | 'personal')}
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