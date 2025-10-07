import { observable } from "@legendapp/state";

export const $personalStateCreateProfile = observable({
    userNotFound:false,
    submitted: false,
    name: null as string | null,
    profile_type: null as 'public' | 'private' | 'personal' | null,
    bio: null as string | null,

    isNameValid: () => {
        const name = $personalStateCreateProfile.name.get() ?? '';
        return name.length !== 0 && name.length <= 40;
    },
    isProfileTypeValid: () => {
        const profile_type = $personalStateCreateProfile.profile_type.get();
        return profile_type !== null;
    },
    isBioValid: () => {
        const bio = $personalStateCreateProfile.bio.get() ?? '';
        return bio.length !== 0 && bio.length <= 150;
    },
    isValid: () => {
        return $personalStateCreateProfile.isNameValid() && $personalStateCreateProfile.isProfileTypeValid() && $personalStateCreateProfile.isBioValid();
    },
    submit: () => {
        $personalStateCreateProfile.submitted.set(true);
    },
    reset: () => {
        $personalStateCreateProfile.submitted.set(false);
        $personalStateCreateProfile.name.set(null);
        $personalStateCreateProfile.profile_type.set(null);
        $personalStateCreateProfile.bio.set(null);
        $personalStateCreateProfile.userNotFound.set(false);
    }
})
