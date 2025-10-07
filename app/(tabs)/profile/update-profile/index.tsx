import Header from '@/components/header/Header';
import Sidebar from '@/components/sidebar/Sidebar';
import { Dropdown } from '@/components/ui/common/DropDown';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { IconSymbol } from '@/components/ui/fonts/IconSymbol';
import { MaterialCommunityIcon } from '@/components/ui/fonts/materialCommunityIcons';
import { pressableAnimation } from '@/hooks/commonHooks/hooks.pressableAnimation';
import { useLegend$ } from '@/hooks/commonHooks/hooks.useLegend';
import { ApiError } from '@/lib/constantLib';
import { profileApi } from '@/lib/publicLib/profileApi/public.api.profile';
import { authState } from '@/state/auth/state.auth';
import { modalActions } from '@/state/modals/state.modals';
import { updateProfile$ } from '@/state/publicState/profile/public.state.profile.updateProfile';
import { runWithLoading, showAlert, showControllersModal } from '@/utils/commonUtils/util.modal';
import { buildFormDataFromAsset } from '@/utils/commonUtils/util.upload';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Image, Platform, Pressable, TextInput } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';


export default function UpdateProfile() {

  useEffect(() => {
    // Clean up when component unmounts
    return () => {
      updateProfile$.reset()
      authState.isInTheProfileUpdateMode.set(false)
    };
  }, []);


  const goBack = () => {
    router.back();
  };
  
  const user = useLegend$(authState.user)
  const avatarUri = useLegend$(authState.user.avatarUri)
  const username = useLegend$(updateProfile$.username)
  const name = useLegend$(updateProfile$.name)
  const bio = useLegend$(updateProfile$.bio)
  const profileVisibleTo = useLegend$(updateProfile$.profileVisibleTo)
  const avatar = useLegend$(updateProfile$.avatar)
  const avatarFile = useLegend$(updateProfile$.avatarFile)
  const avatarTokens = useLegend$(updateProfile$.avatarTokens)
  const isAvatarSubmitted = useLegend$(updateProfile$.avatarSubmitted)
  const isAvatarChecked = useLegend$(updateProfile$.isAvatarChecked)
  const isAvatarValid = useLegend$(updateProfile$.isAvatarValid)
  const isSubmitted = useLegend$(updateProfile$.submitted)
  const isUsernameSubmitted = useLegend$(updateProfile$.usernameSubmitted)
  const isUsernameChecked = useLegend$(updateProfile$.usernameChecked)
  const isUsernameCheckedWhileNull = useLegend$(updateProfile$.isUsernameChecked)
  const isNameValid = useLegend$(updateProfile$.isNameValid)
  const isUsernameValid = useLegend$(updateProfile$.isUsernameValid)
  const isProfileVisibleToValid = useLegend$(updateProfile$.isProfileVisibleToValid)
  const isBioValid = useLegend$(updateProfile$.isBioValid)
  const isValid = useLegend$(updateProfile$.isValid)
  const isNull = useLegend$(updateProfile$.isNull)
  const isAvatarRemoved = useLegend$(updateProfile$.removeAvatarDone)
  
  const { theme } = useUnistyles();
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
        updateProfile$.avatarFile.set(result.assets[0]);
        updateProfile$.avatarChecked.set(false);
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
          updateProfile$.avatarFile.set(result.assets[0]);
          updateProfile$.avatarChecked.set(false);
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
        const response: any = await runWithLoading(
          () => profileApi.removeAvatar(),
          { message: 'Removing avatar' }
        );
        if (response.status) {
          authState.user.avatarUri.set(null)
          updateProfile$.removeAvatarDone.set(true);
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
        else{
          showAlert('An unexpected error occurred. Please try again.');
        }
      }
    }

    const performUpload = async () => {
      const currentAvatarFile = updateProfile$.avatarFile.get();
      const currentIsAvatarValid = updateProfile$.isAvatarValid.get();
      if (isAvatarRemoved) {
        showAlert('Profile picture removed')
        return;
      }

      if (!currentIsAvatarValid || !currentAvatarFile) {
        updateProfile$.avatarSubmit()
        showAlert('No avatar selected')
        return
      }

      try {
        const formData = await buildFormDataFromAsset(currentAvatarFile, { fieldName: 'avatar' });

        const response: any = await runWithLoading(
          () => profileApi.uploadAvatar(formData),
          { message: 'Uploading avatar' }
        );

        if (response.fileId.length > 0) {
          updateProfile$.avatar.set(response.fileId)
          updateProfile$.avatarTokens.set(response.avatarTokens)
          updateProfile$.avatarChecked.set(true)
        }
      } catch (error) {
        if (error instanceof ApiError) {
          showAlert(error.message || 'Something went wrong try again');
        } else {
          showAlert('An unexpected error occurred. Please try again.');
        }

        updateProfile$.avatarSubmit()
        updateProfile$.avatarFile.set(null)
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
      if (result && !updateProfile$.removeAvatarDone.get()) {
        performUpload()
      }
    });
  };

  const checkUsername = async () => {
    if (!isUsernameValid) {
      updateProfile$.usernameSubmit()
      showAlert('Username is not valid\nOnly letters, numbers, . and _ are allowed\nMaximum length is 30 characters')
      return;
    }

    try {
      const response: any = await runWithLoading(
        () => profileApi.checkUsername({ username: username! }),
        { message: 'Checking username' }
      );
      if (response.status) {
        updateProfile$.usernameChecked.set(true);
      }
    } catch (error) {
      showAlert('Something went wrong try again')
      updateProfile$.usernameSubmit()
    }
  }



  const handleUpdateProfile = async () => {
    if (isNull && isAvatarRemoved) {
      updateProfile$.reset()
      router.back();
      return;
    }
    if (isNull) {
      showAlert('Nothing to update')
      return;
    }

    if (!isValid) {
      updateProfile$.submit();
      showAlert('Please fill all the fields')
      return;
    }
    try {
      const response: any = await runWithLoading(
        () => profileApi.updateProfile({
        name: name,
        username: username,
        bio: bio,
        profileVisibleTo: profileVisibleTo,
        avatar: avatar,
        avatarTokens: avatarTokens
      }),
      { message: 'Updating profile' }
      )
      if (response) {
        // authState.user.set(response)
        updateProfile$.reset()
        router.back()
      }
    } catch (error) {
      if (error instanceof ApiError) {
        showAlert(error.message || 'Something went wrong try again');
        console.log(error)
      } else {
        console.error('Update profile error:', error);
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
            Icon={<ThemedText type='subtitle'>Update Profile</ThemedText>}
          />
          <ThemedView style={styles.container}>
            <ThemedView style={styles.profilePictureContainer}>
              <Pressable style={({ pressed }) => [
                { opacity: pressed ? 0.1 : 1 },
                styles.profilePicture, (isAvatarSubmitted || isSubmitted) && (!isAvatarChecked || !isAvatarValid) && styles.profileInputError
              ]} >
                {(avatarFile || (user?.avatarUri && user.avatarUri.length > 1)) && (
                  <Image
                    source={{ uri: avatarFile?.uri || avatarUri! }}
                    style={styles.profilePictureImage}
                  />
                )}
              </Pressable>
              <ThemedView style={styles.outerEditIcon}>
                <Pressable
                  onPress={handleAvatarChange}
                  onPressIn={handlePressIn}
                  style={({ pressed }) => [
                    { opacity: pressed ? 0.1 : 1 },
                    styles.editIcon
                  ]}
                >
                  <MaterialCommunityIcon name='image.edit' size={25} />
                  <ThemedText style={[styles.bucketText,]} selectable={false}>Change avatar</ThemedText>
                </Pressable>
              </ThemedView>
            </ThemedView>
            <TextInput
              placeholder="Name"
              inputMode='text'
              maxLength={70}
              value={name ?? user?.name}
              onChangeText={(text) => updateProfile$.name.set(text)}
              textContentType='name'
              placeholderTextColor="gray"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, !isNameValid && isSubmitted && styles.inputError]}
            />


            <ThemedView style={[styles.inputContainer, (!isUsernameValid || !isUsernameCheckedWhileNull) && (isUsernameSubmitted || isSubmitted) && styles.inputError]}>
              <TextInput
                placeholder="Username"
                maxLength={30}
                inputMode='text'
                value={username ?? user?.username}
                onChangeText={(text) => { updateProfile$.username.set(text); updateProfile$.usernameChecked.set(false) }}
                textContentType='username'
                placeholderTextColor="gray"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.inputField, { outline:'none' }]}
              />
              <Pressable
                onPress={checkUsername}
                onPressIn={handlePressIn}
                style={({ pressed }) => [
                  styles.inputButton,
                  { opacity: pressed ? 0.1 : 1 }
                ]}>
                {isUsernameChecked ? (
                  <IconSymbol name="check" size={25} />
                ) : username && username !== user?.username && (
                  <ThemedText selectable={false} color={theme.colors.primary} type='smallBold'>Check</ThemedText>
                )}
              </Pressable>
            </ThemedView>


            <TextInput
              placeholder="Bio"
              inputMode='text'
              value={bio ?? user?.bio}
              onChangeText={(text) => updateProfile$.bio.set(text)}
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
                value={profileVisibleTo ?? user?.profileVisibleTo}
                placeholder="Select profile visibility"
                style={styles.dropdownBorder}
                error={!isProfileVisibleToValid && isSubmitted}
                searchable={false}
                onSelect={(value) => updateProfile$.profileVisibleTo.set(value as 'public' | 'private' | 'follower')}
              />

            </ThemedView>

            <Pressable
              onPress={handleUpdateProfile}
              style={({ pressed }) => [
                styles.submit,
                { opacity: pressed ? 0.1 : 1 }
              ]}

              onPressIn={handlePressIn}
            >
              <ThemedText style={styles.submitText} selectable={false}>Save</ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
  )
}

const styles = StyleSheet.create((theme, rt) => (({
  mainContainer: {
    flex: 1,
    paddingTop: rt.insets.top,
  },
  container: {
    paddingTop: 20,
    width: '100%',
    paddingHorizontal: 20,
    gap: 20,
    // justifyContent: 'center',
    // alignItems: 'center',
    height: '100%',
  },
  input: {
    height: 40,
    width: 350,
    borderWidth: 1,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    borderColor: theme.colors.neutral5,
    paddingHorizontal: 16,
    color: theme.colors.text,
  },
  inputError: {
    borderColor: theme.colors.red,
  },
  profileInputError: {
    borderWidth: 1,
    borderColor: theme.colors.red,
  },

  submit: {
    height: 60,
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 9999,
    backgroundColor: theme.colors.icon,
  },
  submitText: {
    color: theme.colors.background,
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
    borderColor: theme.colors.neutral5,
    paddingRight: 16,
  },
  inputField: {
    flex: 1,
    width: '100%',
    height: '100%',
    color: theme.colors.text,
    paddingHorizontal: 16
  },
  inputButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileVisibleToContainer: {
    width: 350,
    height: 40,
    borderColor: theme.colors.neutral5,
    borderWidth: 1,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
  },
  profilePictureContainer: {
    // height: 240,
    // width: Platform.OS === 'web' ? '20%' : 80,
    // backgroundColor: theme.colors.yellow,
    // gap: 5

    paddingBottom: 20
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
  outerEditIcon: {
    // marginTop: 10,
    // backgroundColor: theme.colors.yellow,
    // marginBottom: 20,
    // paddingLeft: 25,
  },
  editIcon: {

    // width: 125,
    // backgroundColor: theme.colors.background,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  bucketText: {
    color: theme.colors.text,
    fontSize: 13
    // fontWeight: 'bold',
  },
  dropdownBorder: {
    height: 38,
    width: 340,
    borderWidth: 0,
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 8,
    borderTopRightRadius: 25,
    paddingHorizontal: 16,
  }
})));