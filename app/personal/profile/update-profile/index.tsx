import Header from '@/components/header/Header';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { ApiError } from '@/lib/constantLib';
import { PersonalProfileApi } from '@/lib/personalLib/profileApi/personal.api.profile';
import { authState } from '@/state/auth/state.auth';
import { modalActions } from '@/state/modals/state.modals';
import { $personalStateUpdateProfile } from '@/state/personalState/profile/personal.state.profile.updateProfile';
import { $personalStateUser } from '@/state/personalState/user/personal.state.user';
import { runWithLoading, showAlert, showControllersModal } from '@/utils/commonUtils/util.modal';
import { utilGoBack } from '@/utils/commonUtils/util.router';
import { buildFormDataFromAsset } from '@/utils/commonUtils/util.upload';
import { PersonalUtilGetUser } from '@/utils/personalUtils/personal.util.profile';
import { useValue } from '@legendapp/state/react';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable } from 'react-native';
import UpdateProfileAvatarSection from './components/UpdateProfileAvatarSection';
import UpdateProfileForm from './components/UpdateProfileForm';
import styles from './update-profile.styles';
import { useUnistyles } from 'react-native-unistyles';


export default function PersonalUpdateProfile() {
  const { rt } = useUnistyles();

  useEffect(() => {
    // Clean up when component unmounts
    return () => {
      $personalStateUpdateProfile.reset()
      authState.isInTheProfileUpdateMode.set(false)
      void PersonalUtilGetUser();
    };
  }, []);

  const user = useValue($personalStateUser.user)
  const avatarUri = useValue($personalStateUser.user.avatar_url)
  const name = useValue($personalStateUpdateProfile.name)
  const bio = useValue($personalStateUpdateProfile.bio)
  const profileVisibleTo = useValue($personalStateUpdateProfile.profileVisibleTo)
  const avatarFile = useValue($personalStateUpdateProfile.avatarFile)
  const isAvatarSubmitted = useValue($personalStateUpdateProfile.avatarSubmitted)
  const isAvatarChecked = useValue($personalStateUpdateProfile.isAvatarChecked)
  const isAvatarValid = useValue($personalStateUpdateProfile.isAvatarValid)
  const isSubmitted = useValue($personalStateUpdateProfile.submitted)
  const isNameValid = useValue($personalStateUpdateProfile.isNameValid)
  const isProfileVisibleToValid = useValue($personalStateUpdateProfile.isProfileVisibleToValid)
  const isBioValid = useValue($personalStateUpdateProfile.isBioValid)
  const isValid = useValue($personalStateUpdateProfile.isValid)
  const isNull = useValue($personalStateUpdateProfile.isNull)
  const isAvatarRemoved = useValue($personalStateUpdateProfile.removeAvatarDone)


  const { handlePressIn } = pressableAnimation();


  const handleAvatarChange = async (event: any) => {
    const position = {
      x: event?.nativeEvent?.pageX ?? 0,
      y: event?.nativeEvent?.pageY ?? 0,
    };

    const chooseFromGalary = async () => {
      const permissionResult = await ImagePicker.getMediaLibraryPermissionsAsync();

      if (permissionResult.status !== 'granted') {
        showAlert('Media library permission is required to access images.');
        return;
      }

      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        aspect: [4, 3],
        quality: 1,
        allowsEditing: true
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        $personalStateUpdateProfile.avatarFile.set(result.assets[0]);
        $personalStateUpdateProfile.avatarChecked.set(false);
        // Enable Apply dynamically once an avatar is chosen
        modalActions.update({ confirmDisabled: false });
      }
    }

    const takePhoto = async () => {
      try {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

        if (permissionResult.status !== 'granted') {
          showAlert('Camera permission is required to take photos.');
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          aspect: [4, 3],
          quality: 1,
          allowsEditing: true,
        });

        if (!result.canceled && result.assets && result.assets[0]) {
          $personalStateUpdateProfile.avatarFile.set(result.assets[0]);
          $personalStateUpdateProfile.avatarChecked.set(false);
          // Enable Apply dynamically once a photo is taken
          modalActions.update({ confirmDisabled: false });
        }
      } catch (error) {
        showAlert('Error accessing camera. Please try again.');
      }
    };

    const removeAvatar = async () => {
      if (avatarUri === '') {
        showAlert("No profile picture to remove")
        // Keep Apply disabled when no actionable change
        modalActions.update({ confirmDisabled: true })
        return;
      }
      try {
        const response = await runWithLoading(
          () => PersonalProfileApi.removeAvatar(),
          { message: 'Removing avatar' }
        );
        if (response.status) {
          $personalStateUser.user.avatar_url.set(null)
          $personalStateUpdateProfile.removeAvatarDone.set(true);
          modalActions.update({ confirmDisabled: false })
          showAlert('Profile picture removed')
          // After a successful removal, disable Apply; nothing left to apply here

          // return;
        }
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.type === 'not_found') {
            showAlert('No profile picture in the server to remove')
            modalActions.update({ confirmDisabled: true })
          }
          else {
            showAlert('Something went wrong try again')
          }
        }
        else {
          showAlert('An unexpected error occurred. Please try again.');
        }
      }
    }

    const performUpload = async () => {
      const currentAvatarFile = $personalStateUpdateProfile.avatarFile.get();
      const currentIsAvatarValid = $personalStateUpdateProfile.isAvatarValid.get();
      if (isAvatarRemoved) {
        showAlert('Profile picture removed')
        return;
      }

      if (!currentIsAvatarValid || !currentAvatarFile) {
        $personalStateUpdateProfile.avatarSubmit()
        showAlert('No avatar selected')
        return
      }

      try {
        const formData = await buildFormDataFromAsset(currentAvatarFile, { fieldName: 'avatar' });

        const response = await runWithLoading(
          () => PersonalProfileApi.uploadAvatar(formData),
          { message: 'Uploading avatar' }
        );

        if (response) {
          $personalStateUpdateProfile.avatarChecked.set(true)
        }
      } catch (error) {
        if (error instanceof ApiError) {
          showAlert(error.message || 'Something went wrong try again');
        } else {
          showAlert('An unexpected error occurred. Please try again.');
        }

        $personalStateUpdateProfile.avatarSubmit()
        $personalStateUpdateProfile.avatarFile.set(null)
      }
    }

    await showControllersModal(
      [
        ...(Platform.OS !== 'web' ? [{ id: 'take-photo', label: 'Take Photo', onPress: takePhoto }] : []),
        { id: 'choose-gallery', label: 'Choose from Gallery', onPress: chooseFromGalary },
        { id: 'remove', label: 'Remove Avatar', onPress: removeAvatar },
      ],
      {
        title: 'Change avatar',
        confirmText: 'Apply',
        cancelText: 'Cancel',
        position,
        // Start disabled; will be enabled via modalActions.update when a valid avatar is selected
        confirmDisabled: true,
        closeOnBackgroundTap: false,
      },
    ).then((result) => {
      // Only perform upload if result is true AND we're not in a removed state
      // AND we actually have a file to upload
      if (result && !$personalStateUpdateProfile.removeAvatarDone.get()) {
        performUpload()
      }
    });
  };



  const handleUpdateProfile = async () => {
    if (isNull && isAvatarRemoved) {
      $personalStateUpdateProfile.reset()
      router.back();
      return;
    }
    if (isNull) {
      showAlert('Nothing to update')
      return;
    }

    if (!isValid) {
      $personalStateUpdateProfile.submit();
      showAlert('Please fill all the fields')
      return;
    }
    try {
      const response = await runWithLoading(
        () => PersonalProfileApi.updateProfile({
          name: name ?? undefined,
          bio: bio ?? undefined,
          profile_type: profileVisibleTo ?? undefined,
        }),
        { message: 'Updating profile' }
      )
      if (response) {
        // authState.user.set(response)
        $personalStateUpdateProfile.reset()
        router.back()
      }
    } catch (error) {
      if (error instanceof ApiError) {
        showAlert(error.message || 'Something went wrong try again');
      } else {
        console.error('Update profile error:', error);
        showAlert('An unexpected error occurred. Please try again.');
      }
    }
  }

  return (
    <ThemedView style={styles.mainContainer}>
      <ThemedView style={{ paddingTop: rt.insets.top }}>
        <Header
          onBackPress={utilGoBack}
          centerSection={<ThemedText type='subtitle'>Update Profile</ThemedText>}
        />
      </ThemedView>
      <ThemedView style={styles.container}>
        <UpdateProfileAvatarSection
          avatarUri={avatarFile?.uri || avatarUri || null}
          hasAvatar={!!(avatarFile || (user?.avatar_url && user?.avatar_url.length > 0))}
          showAvatarError={(isAvatarSubmitted || isSubmitted) && (!isAvatarChecked || !isAvatarValid)}
          onChangeAvatar={handleAvatarChange}
          onPressInChangeAvatar={handlePressIn}
        />

        <UpdateProfileForm
          nameValue={name ?? user?.name ?? ''}
          bioValue={bio ?? user?.bio ?? ''}
          profileVisibleToValue={profileVisibleTo ?? (user?.profile_type as 'public' | 'private' | 'personal' | null)}
          showNameError={!isNameValid && isSubmitted}
          showBioError={!isBioValid && isSubmitted}
          showProfileVisibleToError={!isProfileVisibleToValid && isSubmitted}
          onChangeName={(text) => $personalStateUpdateProfile.name.set(text)}
          onChangeBio={(text) => $personalStateUpdateProfile.bio.set(text)}
          onSelectProfileVisibleTo={(value) => $personalStateUpdateProfile.profileVisibleTo.set(value)}
          onSubmit={handleUpdateProfile}
          onPressInSubmit={handlePressIn}
        />
      </ThemedView>
    </ThemedView>
  );
}