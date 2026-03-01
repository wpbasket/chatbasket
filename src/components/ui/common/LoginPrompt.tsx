import Sidebar from "@/components/sidebar/Sidebar";
import { ThemedText } from "@/components/ui/common/ThemedText";
import { ThemedView } from "@/components/ui/common/ThemedView";
import { ThemedViewWithSidebar } from "@/components/ui/common/ThemedViewWithSidebar";
import { FontAwesome5Icon } from "@/components/ui/fonts/fontAwesome5";
import { authState } from "@/state/auth/state.auth";
import { useValue } from "@legendapp/state/react";
import { router } from "expo-router";
import { Platform, Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

interface LoginPromptProps {
    /**
     * If true, renders the children when user is logged in.
     * If false, shows the login prompt when user is not logged in.
     */
    children?: React.ReactNode;
}

/**
 * Reusable component that protects content behind authentication.
 * If user is not logged in, shows a friendly prompt to login/signup.
 * If user is logged in, renders the children.
 */
export function LoginPrompt({ children }: LoginPromptProps) {
    const isLoggedIn = useValue(authState.isLoggedIn);
    const { theme } = useUnistyles();

    // If user is logged in, render children
    if (isLoggedIn && children) {
        return <>{children}</>;
    }

    // If user is not logged in, show login prompt with sidebar
    return (
        <ThemedViewWithSidebar>
            <ThemedViewWithSidebar.Sidebar>
                <Sidebar />
            </ThemedViewWithSidebar.Sidebar>
            <ThemedViewWithSidebar.Main>
                <ThemedView style={styles.container}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.button,
                            { opacity: pressed ? 0.1 : 1 },
                        ]}
                        onPress={() => router.push('/(auth)')}
                    >
                        <FontAwesome5Icon
                            name="account.lock"
                            size={24}
                            color={theme.colors.primary}
                        />
                        <ThemedText type="gantariWithoutColorAndSize" style={styles.buttonText}>
                            Login
                            <ThemedText type="gantariWithoutColorAndSize" style={styles.orText}> / </ThemedText>
                            Signup
                        </ThemedText>
                    </Pressable>
                </ThemedView>
            </ThemedViewWithSidebar.Main>
        </ThemedViewWithSidebar>
    );
}

const styles = StyleSheet.create((theme, rt) => ({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        paddingBottom: {
            xs: 0,
            md: 80
        },
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        paddingLeft: 20,
        paddingVertical: 6,
        paddingRight: 35,
        gap: 12,
        borderWidth: 1,
        borderColor: Platform.OS=='web'?theme.colors.neutral2:theme.colors.neutral5,
        borderTopRightRadius: 45,
        borderTopLeftRadius: 30,
        borderBottomRightRadius: 15,
        borderBottomLeftRadius: 30,
        backgroundColor: 'transparent',
    },
    buttonText: {
        fontSize: 18,
        color: theme.colors.title,
        // fontWeight: 'bold',
    },
    orText: {
        color: theme.colors.title,
        // fontWeight: 'bold',
    },
    icon:{
        color:theme.colors.primary,
    }
}));
