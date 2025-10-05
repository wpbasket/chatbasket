import { observable } from "@legendapp/state";

export const createProfile$ = observable({
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
        const name = createProfile$.name.get() ?? '';
        return name.length !== 0 && name.length <= 70 && /^[a-zA-Z0-9]+(?: [a-zA-Z0-9]+)*$/.test(name);
    },
    isUsernameValid: () => {
        const username = createProfile$.username.get() ?? '';
        return username.length !== 0 && username.length <= 30 && /^[a-z0-9][a-z0-9._]*$/.test(username);
    },
    isProfileVisibleToValid: () => {
        const profileVisibleTo = createProfile$.profileVisibleTo.get();
        return profileVisibleTo !== null;
    },
    isBioValid: () => {
        const bio = createProfile$.bio.get() ?? '';
        return bio.length !== 0 && bio.length <= 200;
    },
    // isAvatarValid: () => {
    //     const avatar = createProfile$.avatar.get();
    //     return avatar !== null;
    // },
    isValid: () => {
        return createProfile$.isNameValid() && createProfile$.usernameChecked && createProfile$.isProfileVisibleToValid() && createProfile$.isBioValid();
    },
    submit: () => {
        createProfile$.submitted.set(true);
    },
    usernameSubmit: () => {
        createProfile$.usernameSubmitted.set(true);
    },
    reset: () => {
        createProfile$.submitted.set(false);
        createProfile$.usernameSubmitted.set(false);
        createProfile$.usernameChecked.set(false);
        createProfile$.name.set(null);
        createProfile$.username.set(null);
        createProfile$.profileVisibleTo.set(null);
        createProfile$.bio.set(null);
        createProfile$.userNotFound.set(false);
        // createProfile$.avatar.set(null);
    }
})
