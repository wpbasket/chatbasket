import { Platform } from "react-native";

export const Url = {
    BASE_URL: process.env.EXPO_PUBLIC_BACKEND,
    // BASE_URL: Platform.OS === 'web' ? process.env.EXPO_PUBLIC_TEST : process.env.EXPO_PUBLIC_BACKEND,
    //    BASE_URL: "https://feof-mac-childrens-abilities.trycloudflare.com",
    //    BASE_URL: Platform.OS === 'web' ? "http://localhost:8080" : "https://uniform-soil-jvc-judge.trycloudflare.com",
}

