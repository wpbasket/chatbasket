import { setAppMode } from '@/state/appMode/state.appMode';

/**
 * Native Intent Handler (Expo Router pattern)
 * 
 * This file handles deep links when the app is launched from a closed state (cold start).
 * It runs BEFORE the navigation tree is rendered, allowing us to set appMode synchronously
 * and avoid race conditions with route guards.
 * 
 * @see https://docs.expo.dev/router/reference/redirects/
 */
export async function redirectSystemPath({
    path,
    initial,
}: {
    path: string;
    initial: boolean;
}): Promise<string> {
    // Only process initial deep links (cold start scenario)
    // Warm starts (app backgrounded -> foregrounded) are handled by Linking.addEventListener in _layout.tsx
    if (initial && path) {
        // Extract the actual path from full URL
        // Deep links can come as:
        // 1. Full URL: "https://chatbasket.live/public/home"
        // 2. App scheme: "chatbasket://public/home"
        // 3. Path only: "public/home"
        let cleanPath = path;

        try {
            // While the parameter is called `path` there is no guarantee that this is a path or a valid URL
            // Use a base URL as fallback for relative paths (Expo best practice)
            if (path.includes('://')) {
                const url = new URL(path);
                cleanPath = url.pathname; // Gets "/public/home" from "https://chatbasket.live/public/home"
                // Remove leading slash if present
                if (cleanPath.startsWith('/')) {
                    cleanPath = cleanPath.substring(1);
                }
            }
        } catch {
            // Do not crash inside this function! Instead redirect users to home or handle gracefully
            // Following Expo's recommendation to never throw errors in redirectSystemPath
            // Return the path as-is and let Expo Router handle it (will likely go to not-found)
            return path;
        }

        if (cleanPath.startsWith('public')) {
            setAppMode('public');
        } else if (cleanPath.startsWith('personal')) {
            setAppMode('personal');
        }
    }

    // Return the path unchanged - let Expo Router handle the actual navigation
    return path;
}
