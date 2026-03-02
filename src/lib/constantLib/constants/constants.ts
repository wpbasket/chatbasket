import { Platform } from "react-native";

export const Url = {
    BASE_API_URL: process.env.EXPO_PUBLIC_CB_MAIN_API,
    // BASE_API_URL: process.env.CB_MAIN_API,

    // BASE_API_URL: Platform.OS === "web" ? "http://localhost:8080" : "",
}

