// registerFcmOrApn.ts
import { TokenType } from '@/lib/personalLib/models/personal.model.notification';
import { PersonalProfileApi } from '@/lib/personalLib/profileApi/personal.api.profile';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';

export async function openNotificationSettingsFromApp(): Promise<void> {
    if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
        return;
    }

    if (Platform.OS !== 'android') {
        await Linking.openSettings();
        return;
    }

    try {
        const IntentLauncher = require('expo-intent-launcher');
        const Constants: any = require('expo-constants').default;

        const packageName: string | undefined =
            Constants?.expoConfig?.android?.package ??
            Constants?.manifest2?.android?.package ??
            Constants?.manifest?.android?.package;

        await IntentLauncher.startActivityAsync('android.settings.APP_NOTIFICATION_SETTINGS', {
            extra: {
                'android.provider.extra.APP_PACKAGE': packageName,
                'app_package': packageName,
            },
        });
        return;
    } catch (error) {
        await Linking.openSettings();
    }
}

/**
 * Configure notification handler for foreground notifications
 * This defines how notifications behave when the app is in the foreground
 */
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

/**
 * Error handler for registration errors
 * Logs the error without throwing to prevent app crashes
 */
function handleRegistrationError(errorMessage: string): void {
    console.log('⚠️ Push notification registration error:', errorMessage);
}

/**
 * Register for push notifications and get the native device token (FCM/APN)
 * This gets the native token for use with your own backend FCM/APN service
 * @returns Promise<{ token: string, type: TokenType } | null>
 */
export async function registerForPushNotifications(): Promise<{ token: string; type: TokenType } | null> {
    try {
        // Set up Android notification channel (required for Android)
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
        }

        // Check if running on a physical device
        if (!Device.isDevice) {
            handleRegistrationError('Must use physical device for push notifications');
            return null;
        }

        // Check existing permissions
        const { status: existingStatus, canAskAgain } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        // Request permissions if not granted AND can ask again
        if (existingStatus !== 'granted' && canAskAgain) {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        } else if (existingStatus !== 'granted' && !canAskAgain) {
            handleRegistrationError('Notification permission denied (cannot ask again). Enable it from Settings.');
            return null;
        }

        // Check if permissions were granted
        if (finalStatus !== 'granted') {
            handleRegistrationError(`Permission not granted. Status: ${finalStatus}`);
            return null;
        }

        // Get the native device token (FCM for Android, APN for iOS)
        const deviceToken = await Notifications.getDevicePushTokenAsync();
        const token = deviceToken.data;

        // Determine token type based on platform
        const type: TokenType = Platform.OS === 'ios' ? 'apn' : 'fcm';

        return { token, type };
    } catch (error) {
        console.log('❌ Failed to get push token:', error);
        return null;
    }
}

/**
 * Register the device token with your backend
 * This sends the token to your API endpoint for storage
 * @returns Promise<boolean> - Returns true if registration was successful
 */
export async function registerTokenWithBackend(): Promise<boolean> {
    try {
        const tokenData = await registerForPushNotifications();

        if (!tokenData) {
            return false;
        }

        const { token, type } = tokenData;

        // Send token to backend API
        const response = await PersonalProfileApi.registerNotificationToken({
            token,
            type,
        });

        if (response.status) {
            return true;
        } else {
            console.log('❌ Backend token registration failed:', response.message);
            return false;
        }
    } catch (error) {
        console.log('❌ Error registering token with backend:', error);
        return false;
    }
}

/**
 * Setup notification listeners
 * Call this in your app's initialization (e.g., App.tsx or _layout.tsx)
 * @returns Cleanup function to remove listeners
 */
export function setupNotificationListeners(): () => void {
    // Listener for notifications received while app is in foreground
    const notificationListener = Notifications.addNotificationReceivedListener((notification) => {
        console.log('📬 Notification received:', notification);
        // Handle the notification as needed
    });

    // Listener for user interactions with notifications
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;

        // CRITICAL FIX: Ignore events that look like Share Intents
        // Share intents often come as "notifications" with huge payloads or specific mimeTypes
        // If we process it here, it might swallow the event for expo-share-intent
        if (response.actionIdentifier === 'expo.modules.notifications.actions.DEFAULT' && !response.notification.request.trigger) {
            // Share intents often lack a trigger or have specific structure. 
            // However, the best way might be to check for 'mimeType' or 'text' which share intents have.
            // console.log('⚠️ Potential Share Intent detected in Notification Listener. Ignoring...', data);
            return;
        }

        console.log('👆 User interacted with notification:', response);
        // Handle navigation or other actions based on notification data

        // You can navigate to specific screens based on notification data
        if (data?.url) {
            try {
                // Cast to any to bypass strict route typing since the URL comes from a dynamic payload
                router.push(data.url as any);
            } catch (error) {
                console.log('❌ Error navigating to URL:', error);
            }
        }
        console.log('Notification data:', data);
    });

    // Return cleanup function
    return () => {
        notificationListener.remove();
        responseListener.remove();
    };
}

/**
 * Check if the app was opened by a notification (Cold Start)
 * And navigate to the specific screen if a URL is present
 */
export async function checkInitialNotification() {
    try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response) {
            const data = response.notification.request.content.data;
            if (data?.url) {
                console.log('🚀 Cold start notification with URL:', data.url);
                // Cast to any to bypass strict route typing since the URL comes from a dynamic payload
                router.push(data.url as any);
            }
        }
    } catch (error) {
        console.log('❌ Error checking initial notification:', error);
    }
}
