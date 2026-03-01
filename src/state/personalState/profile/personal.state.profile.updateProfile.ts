import { observable } from "@legendapp/state";
import * as ImagePicker from 'expo-image-picker';

export const $personalStateUpdateProfile = observable({
    submitted: false,
    name: null as string | null,
    profileVisibleTo: null as 'public' | 'private' | 'personal' | null,
    bio: null as string | null,
    avatarSubmitted: false,
    avatarChecked: false,
    avatar: null as string | null,
    avatarTokens: null as string[] | null,
    avatarFile: null as ImagePicker.ImagePickerAsset | null,
    removeAvatarDone: false,

    isNameValid: () => {
        const name = $personalStateUpdateProfile.name.get();
        if (name === null) {
            return true;
        }
        else {
            return name.length !== 0 && name.length <= 40;
        }
    },
    isProfileVisibleToValid: () => {
        const profileVisibleTo = $personalStateUpdateProfile.profileVisibleTo.get();
        if (profileVisibleTo === null) {
            return true;
        }
        else {
            return profileVisibleTo !== null;
        }
    },
    isBioValid: () => {
        const bio = $personalStateUpdateProfile.bio.get();
        if (bio === null) {
            return true;
        }
        else {
            return bio !== null && bio.length !== 0 && bio.length <= 150;
        }
    },
    isAvatarValid: () => {
        const avatar = $personalStateUpdateProfile.avatarFile.get();
        if (avatar === null) {
            return true;
        }
        else {
            return avatar !== null;
        }
    },
    isValid: () => {
        return $personalStateUpdateProfile.isNameValid() && $personalStateUpdateProfile.isProfileVisibleToValid() && $personalStateUpdateProfile.isBioValid() && $personalStateUpdateProfile.isAvatarChecked();
    },
    submit: () => {
        $personalStateUpdateProfile.submitted.set(true);
    },
    avatarSubmit: () => {
        $personalStateUpdateProfile.avatarSubmitted.set(true);
    },
    avatarCheck: () => {
        $personalStateUpdateProfile.avatarChecked.set(true);
    },
    isAvatarChecked: () => {
        if ($personalStateUpdateProfile.avatarFile.get() === null) {
            return true;
        }
        else {
            return $personalStateUpdateProfile.avatarChecked.get();
        }
    },

    isNull: () => {
        return $personalStateUpdateProfile.name.get() === null && $personalStateUpdateProfile.profileVisibleTo.get() === null && $personalStateUpdateProfile.bio.get() === null && $personalStateUpdateProfile.avatarChecked.get() === false;
    },

    reset: () => {
        $personalStateUpdateProfile.submitted.set(false);
        $personalStateUpdateProfile.name.set(null);
        $personalStateUpdateProfile.profileVisibleTo.set(null);
        $personalStateUpdateProfile.bio.set(null);
        $personalStateUpdateProfile.avatarSubmitted.set(false);
        $personalStateUpdateProfile.avatarChecked.set(false);
        $personalStateUpdateProfile.avatar.set(null);
        $personalStateUpdateProfile.avatarFile.set(null);
        $personalStateUpdateProfile.removeAvatarDone.set(false);
    }
})
