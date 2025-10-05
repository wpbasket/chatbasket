import { observable } from "@legendapp/state";
import * as ImagePicker from 'expo-image-picker';

export const PersonalUpdateProfile$ = observable({
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
        const name = PersonalUpdateProfile$.name.get();
        if (name === null) {
            return true;
        }
        else {
            return name.length !== 0 && name.length <= 70 && /^[a-zA-Z0-9]+(?: [a-zA-Z0-9]+)*$/.test(name);
        }
    },
    isUsernameValid: () => {
        const username = PersonalUpdateProfile$.username.get();
        if (username === null) {
            return true;
        }
        else {
            return username !== null && username.length !== 0 && username.length <= 30 && /^[a-z0-9][a-z0-9._]*$/.test(username);
        }
    },
    isProfileVisibleToValid: () => {
        const profileVisibleTo = PersonalUpdateProfile$.profileVisibleTo.get();
        if (profileVisibleTo === null) {
            return true;
        }
        else {
            return profileVisibleTo !== null;
        }
    },
    isBioValid: () => {
        const bio = PersonalUpdateProfile$.bio.get();
        if (bio === null) {
            return true;
        }
        else {
            return bio !== null && bio.length !== 0 && bio.length <= 200;
        }
    },
    isAvatarValid: () => {
        const avatar = PersonalUpdateProfile$.avatarFile.get();
        if (avatar === null) {
            return true;
        }
        else {
            return avatar !== null;
        }
    },
    isValid: () => {
        return PersonalUpdateProfile$.isNameValid() && PersonalUpdateProfile$.isUsernameChecked() && PersonalUpdateProfile$.isProfileVisibleToValid() && PersonalUpdateProfile$.isBioValid() && PersonalUpdateProfile$.isAvatarChecked();
    },
    submit: () => {
        PersonalUpdateProfile$.submitted.set(true);
    },
    usernameSubmit: () => {
        PersonalUpdateProfile$.usernameSubmitted.set(true);
    },
    avatarSubmit: () => {
        PersonalUpdateProfile$.avatarSubmitted.set(true);
    },
    avatarCheck: () => {
        PersonalUpdateProfile$.avatarChecked.set(true);
    },
    usernameCheck: () => {
        PersonalUpdateProfile$.usernameChecked.set(true);
    },
    isUsernameChecked: () => {
        if (PersonalUpdateProfile$.username.get() === null) {
            return true;
        }
        else {
            return PersonalUpdateProfile$.usernameChecked.get();
        }
    },
    isAvatarChecked: () => {
        if (PersonalUpdateProfile$.avatarFile.get() === null) {
            return true;
        }
        else {
            return PersonalUpdateProfile$.avatarChecked.get();
        }
    },

    isNull: () => {
        return PersonalUpdateProfile$.name.get() === null && PersonalUpdateProfile$.usernameChecked.get() === false && PersonalUpdateProfile$.profileVisibleTo.get() === null && PersonalUpdateProfile$.bio.get() === null && PersonalUpdateProfile$.avatarChecked.get() === false;
    },

    reset: () => {
        PersonalUpdateProfile$.submitted.set(false);
        PersonalUpdateProfile$.usernameSubmitted.set(false);
        PersonalUpdateProfile$.usernameChecked.set(false);
        PersonalUpdateProfile$.name.set(null);
        PersonalUpdateProfile$.username.set(null);
        PersonalUpdateProfile$.profileVisibleTo.set(null);
        PersonalUpdateProfile$.bio.set(null);
        PersonalUpdateProfile$.avatarSubmitted.set(false);
        PersonalUpdateProfile$.avatarChecked.set(false);
        PersonalUpdateProfile$.avatar.set(null);
        PersonalUpdateProfile$.avatarFile.set(null);
        PersonalUpdateProfile$.removeAvatarDone.set(false);
    }
})
