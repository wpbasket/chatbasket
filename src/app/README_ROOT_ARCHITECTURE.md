# Root Layout & Navigation Architecture

**Core Pattern**: Smart layout, thin screens.

## `app/_layout.tsx` (The Orchestrator)
The root layout coordinates initialization, routing guards, deep-link handling, notifications, and keyboard sync.

### Responsibilities

1. **Initialization & Hydration**
   - `initializeAppStorage()` in `lib/storage/storage.init.ts` runs once at boot.
   - Hydrates auth state and, if logged in, personal storage (contacts, user, device, chat).
   - Root layout waits for hydration (`authLoaded`) to avoid guard flicker.

2. **Splash + Font Loading**
   - Native: `SplashScreen.preventAutoHideAsync()` until fonts + auth hydration complete.
   - Font bundles are preloaded via `useFonts()` (including icon fonts).

3. **Deep Link Handling**
   - **Cold start (native)**: `+native-intent.tsx` sets `appMode` before navigation.
   - **Warm start**: `_layout.tsx` listens to `Linking.addEventListener('url')`.
   - **Web**: `getInitialMode()` in `state.appMode.ts` checks `window.location.pathname`.
   - Mode updates only when different to avoid redundant state churn.

4. **Route Guarding**
   - `Stack.Protected` guards the `(auth)` and `(app)` stacks.
   - Guards depend on `authState.isLoggedIn` and `appMode`.

5. **Notifications**
   - `setupNotificationListeners()` is registered once on mount.
   - `registerTokenWithBackend()` runs after hydration for logged-in native sessions.
   - `checkInitialNotification()` handles cold-start notification routing.

6. **Keyboard Synchronization**
   - `KeyboardSync` writes IME inset values into `state.ui` for zero-render keyboard animations.

7. **Network Tracking**
   - `initializeGlobalNetworkTracking()` starts once and feeds state/tools tracking.

## `app/index.tsx` (Root Router Gate)
This file is not a UI screen. It only redirects when no deep-link segments exist.

- If `segments.length > 0`: return `null` (do not hijack deep links).
- If root (`/`): redirect to `/public/home` or `/personal/home` based on saved preference.

## Directory Structure
- `(auth)`: Login/signup flows.
- `(app)`: Protected routes.
  - `public`: Public mode screens.
  - `personal`: Personal mode screens.
