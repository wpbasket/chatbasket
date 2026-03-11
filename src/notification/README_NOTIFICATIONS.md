# Notification System Architecture

**Libraries:** `expo-notifications`, `expo-device`, `expo-constants`, `expo-intent-launcher`, `expo-linking`
**Backend Integration:** `PersonalSettingApi.updateSessionNotificationToken`

## Token Strategy (Native + Web)
We register a **native push token** on Android and sync it to the backend using the authenticated session. On web, the notification module is a no-op stub (returns `null` / `false`).

## 1) Registration Flow (`registerFcmOrApn.ts`)
The primary entry points are `getPushToken()` and `registerForPushNotifications()`.

1. **Platform Check**:
   - **Android**: Sets up a High Importance notification channel (`default`).
   - **iOS**: Currently disabled in code and returns `null` immediately.
2. **Permissions**:
   - Reads `Notifications.getPermissionsAsync()`.
   - Requests permissions if needed (unless `silent` is `true`).
   - If permissions were denied and the OS cannot ask again, we log and return `null`.
3. **Token Generation**:
   - Calls `Notifications.getDevicePushTokenAsync()`.
   - Returns the **native token** (FCM on Android).
4. **Backend Sync**:
   - `registerTokenWithBackend()` calls `PersonalSettingApi.updateSessionNotificationToken` with `{ token, type, device_name }`.

## 2) Notification Listeners
We register listeners in `setupNotificationListeners()` and call it in the root layout (`app/_layout.tsx`).

- **Foreground Listener**: `Notifications.addNotificationReceivedListener`
  - Logs incoming notifications in development.
  - UI display is handled by the `setNotificationHandler` configuration.
- **Interaction Listener**: `Notifications.addNotificationResponseReceivedListener`
  - Triggered when the user taps a notification.
  - **Deep Linking**: When `data.url` is present, we call `router.push(data.url)`.
  - **Share Intent Guard**: Filters events with `expo.modules.notifications.actions.DEFAULT` + missing trigger to avoid swallowing `expo-share-intent` events.

## 3) Cold Start Handling
`checkInitialNotification()` is called after auth hydration on native:
- Reads `Notifications.getLastNotificationResponseAsync()`.
- If a payload includes `data.url`, it navigates immediately.

## 4) Settings Deep Link
`openNotificationSettingsFromApp()` handles platform-specific routing to OS notification settings:
- **iOS**: `app-settings:`
- **Android**: Intent-based `android.settings.APP_NOTIFICATION_SETTINGS`
- **Other**: `Linking.openSettings()`

## 5) Web Behavior
`registerFcmOrApn.web.ts` implements the same exports but returns `null`/`false` to keep web builds consistent without push tokens.

## Troubleshooting
- **"Permission not granted"**: Enable notifications in OS Settings.
- **"Must use physical device"**: Simulators cannot receive push notifications.
- **iOS**: Push is disabled in code until the iOS/FCM pipeline is enabled.
