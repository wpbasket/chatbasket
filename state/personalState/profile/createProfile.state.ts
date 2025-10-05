import { observable } from "@legendapp/state";

export const PersonalCreateProfile$ = observable({
    userNotFound:false,
    submitted: false,
    usernameSubmitted: false,
    usernameChecked: false,
    name: null as string | null,
    username: null as string | null,
    profileVisibleTo: null as 'public' | 'private' | 'follower' | null,
    bio: null as string | null,
    // avatar: null as string | null,

    isNameValid: () => {
        const name = PersonalCreateProfile$.name.get() ?? '';
        return name.length !== 0 && name.length <= 70 && /^[a-zA-Z0-9]+(?: [a-zA-Z0-9]+)*$/.test(name);
    },
    isUsernameValid: () => {
        const username = PersonalCreateProfile$.username.get() ?? '';
        return username.length !== 0 && username.length <= 30 && /^[a-z0-9][a-z0-9._]*$/.test(username);
    },
    isProfileVisibleToValid: () => {
        const profileVisibleTo = PersonalCreateProfile$.profileVisibleTo.get();
        return profileVisibleTo !== null;
    },
    isBioValid: () => {
        const bio = PersonalCreateProfile$.bio.get() ?? '';
        return bio.length !== 0 && bio.length <= 200;
    },
    // isAvatarValid: () => {
    //     const avatar = createProfile$.avatar.get();
    //     return avatar !== null;
    // },
    isValid: () => {
        return PersonalCreateProfile$.isNameValid() && PersonalCreateProfile$.usernameChecked && PersonalCreateProfile$.isProfileVisibleToValid() && PersonalCreateProfile$.isBioValid();
    },
    submit: () => {
        PersonalCreateProfile$.submitted.set(true);
    },
    usernameSubmit: () => {
        PersonalCreateProfile$.usernameSubmitted.set(true);
    },
    reset: () => {
        PersonalCreateProfile$.submitted.set(false);
        PersonalCreateProfile$.usernameSubmitted.set(false);
        PersonalCreateProfile$.usernameChecked.set(false);
        PersonalCreateProfile$.name.set(null);
        PersonalCreateProfile$.username.set(null);
        PersonalCreateProfile$.profileVisibleTo.set(null);
        PersonalCreateProfile$.bio.set(null);
        PersonalCreateProfile$.userNotFound.set(false);
        // createProfile$.avatar.set(null);
    }
})
