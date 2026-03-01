import { observable } from "@legendapp/state";
import * as ImagePicker from 'expo-image-picker';

export const updateProfile$ = observable({
    submitted: false,
    usernameSubmitted: false,
    usernameChecked: false,
    username: null as string | null,
    name: null as string | null,
    profileVisibleTo: null as 'public' | 'private' | 'follower' | null,
    bio: null as string | null,
    avatarSubmitted: false,
    avatarChecked: false,
    avatar: null as string | null,
    avatarTokens: null as string[] | null,
    avatarFile: null as ImagePicker.ImagePickerAsset | null,
    removeAvatarDone: false,

    isNameValid: () => {
        const name = updateProfile$.name.get();
        if (name === null) {
            return true;
        }
        else {
            return name.length !== 0 && name.length <= 70 && /^[a-zA-Z0-9]+(?: [a-zA-Z0-9]+)*$/.test(name);
        }
    },
    isUsernameValid: () => {
        const username = updateProfile$.username.get();
        if (username === null) {
            return true;
        }
        else {
            return username !== null && username.length !== 0 && username.length <= 30 && /^[a-z0-9][a-z0-9._]*$/.test(username);
        }
    },
    isProfileVisibleToValid: () => {
        const profileVisibleTo = updateProfile$.profileVisibleTo.get();
        if (profileVisibleTo === null) {
            return true;
        }
        else {
            return profileVisibleTo !== null;
        }
    },
    isBioValid: () => {
        const bio = updateProfile$.bio.get();
        if (bio === null) {
            return true;
        }
        else {
            return bio !== null && bio.length !== 0 && bio.length <= 200;
        }
    },
    isAvatarValid: () => {
        const avatar = updateProfile$.avatarFile.get();
        if (avatar === null) {
            return true;
        }
        else {
            return avatar !== null;
        }
    },
    isValid: () => {
        return updateProfile$.isNameValid() && updateProfile$.isUsernameChecked() && updateProfile$.isProfileVisibleToValid() && updateProfile$.isBioValid() && updateProfile$.isAvatarChecked();
    },
    submit: () => {
        updateProfile$.submitted.set(true);
    },
    usernameSubmit: () => {
        updateProfile$.usernameSubmitted.set(true);
    },
    avatarSubmit: () => {
        updateProfile$.avatarSubmitted.set(true);
    },
    avatarCheck: () => {
        updateProfile$.avatarChecked.set(true);
    },
    usernameCheck: () => {
        updateProfile$.usernameChecked.set(true);
    },
    isUsernameChecked: () => {
        if (updateProfile$.username.get() === null) {
            return true;
        }
        else {
            return updateProfile$.usernameChecked.get();
        }
    },
    isAvatarChecked: () => {
        if (updateProfile$.avatarFile.get() === null) {
            return true;
        }
        else {
            return updateProfile$.avatarChecked.get();
        }
    },

    isNull: () => {
        return updateProfile$.name.get() === null && updateProfile$.usernameChecked.get() === false && updateProfile$.profileVisibleTo.get() === null && updateProfile$.bio.get() === null && updateProfile$.avatarChecked.get() === false;
    },

    reset: () => {
        updateProfile$.submitted.set(false);
        updateProfile$.usernameSubmitted.set(false);
        updateProfile$.usernameChecked.set(false);
        updateProfile$.name.set(null);
        updateProfile$.username.set(null);
        updateProfile$.profileVisibleTo.set(null);
        updateProfile$.bio.set(null);
        updateProfile$.avatarSubmitted.set(false);
        updateProfile$.avatarChecked.set(false);
        updateProfile$.avatar.set(null);
        updateProfile$.avatarFile.set(null);
        updateProfile$.removeAvatarDone.set(false);
    }
})
