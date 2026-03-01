import Header from '@/components/header/Header';
import { ThemedText } from "@/components/ui/common/ThemedText"
import { ThemedView } from "@/components/ui/common/ThemedView"
import { IconSymbol } from "@/components/ui/fonts/IconSymbol"
import { pressableAnimation } from "@/hooks/commonHooks/hooks.pressableAnimation"
import { ApiError } from "@/lib/constantLib"
import { PersonalProfileApi } from "@/lib/personalLib/profileApi/personal.api.profile"
import { authState } from "@/state/auth/state.auth"
import { $personalStateCreateProfile } from "@/state/personalState/profile/personal.state.profile.createProfile"
import { $personalStateUser } from "@/state/personalState/user/personal.state.user"
import { runWithLoading, showAlert } from "@/utils/commonUtils/util.modal"
import { PersonalUtilGetUser } from "@/utils/personalUtils/personal.util.profile"
import { useValue } from "@legendapp/state/react"
import { router, Stack } from "expo-router"
import { useEffect } from "react"
import { Pressable } from "react-native"
import CreateProfileForm from "./components/CreateProfileForm"
import styles from "./create-profile.styles"
import { useUnistyles } from "react-native-unistyles"

export default function PersonalCreateProfile() {
  const { rt } = useUnistyles();
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
  const name = useValue($personalStateCreateProfile.name)
  const profileType = useValue($personalStateCreateProfile.profile_type)
  const isSubmitted = useValue($personalStateCreateProfile.submitted)
  const isNameValid = useValue($personalStateCreateProfile.isNameValid)
  const isProfileTypeValid = useValue($personalStateCreateProfile.isProfileTypeValid)
  const isValid = useValue($personalStateCreateProfile.isValid)
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
    <ThemedView style={styles.mainContainer}>
      <Stack.Screen
        options={{
          // The header prop was removed as per instructions
        }}
      />
      <ThemedView style={{ paddingTop: rt.insets.top }}>
        <Header
          onBackPress={goBack}
          centerSection={<ThemedText type='subtitle'>Create Profile</ThemedText>}
        />
      </ThemedView>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Create Profile</ThemedText>

        <CreateProfileForm
          nameValue={name ?? ""}
          profileTypeValue={profileType}
          showNameError={!isNameValid && isSubmitted}
          showProfileTypeError={!isProfileTypeValid && isSubmitted}
          onChangeName={(text) => $personalStateCreateProfile.name.set(text)}
          onSelectProfileType={(value) => $personalStateCreateProfile.profile_type.set(value)}
          onSubmit={handleProfileCreation}
          onPressInSubmit={handlePressIn}
        />
      </ThemedView>
    </ThemedView>
  );
}