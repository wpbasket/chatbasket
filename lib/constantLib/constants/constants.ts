import { Platform } from "react-native";

export const Url = {
    // BASE_API_URL: "https://api.chatbasket.live",
    BASE_API_URL: Platform.OS === "web" ? "http://localhost:8080" : "https://api.chatbasket.live",
}

