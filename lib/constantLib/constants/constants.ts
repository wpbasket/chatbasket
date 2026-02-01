import { Platform } from "react-native";

export const Url = {
    BASE_URL: process.env.EXPO_PUBLIC_BACKEND,
    // BASE_URL: Platform.OS === 'web' ? process.env.EXPO_PUBLIC_TEST : process.env.EXPO_PUBLIC_BACKEND,
}

