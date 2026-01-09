# Notification System Architecture

**Libraries:** `expo-notifications`, `expo-device`, `expo-constants`
**Backend Integration:** `PersonalProfileApi.registerNotificationToken`

## "Two-Token" Architecture
We handle notifications by generating a native token (FCM for Android, APNs for iOS) and sending it to our backend.

### 1. Registration Flow (`registerFcmOrApn.ts`)
The function `registerForPushNotifications()` implements the following flow:

1.  **Platform Check**:
    *   **Android**: Sets up a High Importance Notification Channel ('default') to ensure heads-up alerts.
    *   **iOS**: Currently disabled in code (`return null` if OS === 'ios'). *TODO: Enable when Apple Developer Account is configured.*
2.  **Permissions**:
    *   Checks `Notifications.getPermissionsAsync`.
    *   If not granted, requests permission via `requestPermissionsAsync`.
3.  **Token Generation**:
    *   Calls `Notifications.getDevicePushTokenAsync()`.
    *   This returns the **Native Push Token** (FCM token on Android).
4.  **Backend Sync**:
    *   Calls `registerTokenWithBackend()`.
    *   Sends payload `{ token: string, type: 'fcm' }` to `/api/v1/...`.

### 2. Notification Listeners
We set up listeners in `setupNotificationListeners()` which runs in `_layout.tsx`.

*   **Foreground Listener**: `addNotificationReceivedListener`
    *   Logs incoming notifications.
    *   Does NOT automatically show UI (managed by `setNotificationHandler`).
*   **Interaction Listener**: `addNotificationResponseReceivedListener`
    *   Triggered when user *taps* a notification.
    *   **Deep Linking**: Checks `data.url` in the payload and executes `router.push(data.url)`.
    *   **Critical Fix**: Contains a check for `expo.modules.notifications.actions.DEFAULT` to ignore "Share Intents" that sometimes masquerade as notification interactions, preventing conflicts with `expo-share-intent`.

### 3. Cold Start Handling
*   Function: `checkInitialNotification()`
*   Logic: Calls `Notifications.getLastNotificationResponseAsync` to see if the app was launched via a notification tap.
*   Action: If URL exists, navigates immediately.

## Troubleshooting
*   **"Permission not granted"**: User must enable notifications in Android Settings.
*   **"Must use physical device"**: Simulators cannot receive push notifications.
