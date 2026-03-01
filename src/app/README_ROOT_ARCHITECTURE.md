# Root Layout & Navigation Architecture

**Core Pattern**: "Smart Layout, dumb Screens"

## `app/_layout.tsx` (The Brain)
This file is the most critical engineering component in the Frontend. It orchestrates user flow, initialization, global guards, and **Keyboard Synchronization**.

### Responsibilities

1.  **Deep Link Handling (The "Race" Fix)**
    *   **Cold Start (Native)**: `+native-intent.tsx` handles initial deep links using Expo Router's `redirectSystemPath()` pattern. It sets AppMode synchronously before navigation.
    *   **Warm Start**: `_layout.tsx` listens to `Linking.addEventListener('url')` for deep links when app is backgrounded.
    *   **Web**: Handled via `getInitialMode()` checking `window.location.pathname` in `state.appMode.ts`.
    *   Logic: "If URL starts with 'public', set AppMode='public' *synchronously*.\"

2.  **App Mode Synchronization**
    *   We use `useSegments()` to listen to navigation changes.
    *   **Optimization**: Mode is only set if it differs from current value (prevents redundant state updates).
    *   **Warm Start Handler**: Uses `useCallback` to memoize the deep link handler, recreating only when mode changes.
    *   Rule: If the Router says we are in `/public`, we sync the State to `public`.
    *   *Safety*: We do NOT redirect based on State manual toggles here to avoid infinite loops.

3.  **Authentication Hydration**
    *   On mount, it pauses rendering (keeps Splash Screen visible).
    *   Calls `restoreAuthState()` to decrypt tokens.
    *   Decides: "Go into App" or "Go to Login".

4.  **Route Guards (Stack.Protected)**
    *   We wrap the `(app)` folder in a `<Stack.Protected>` component.
    *   It checks `authState.isLoggedIn`. If false, it redirects to `/login`.
    *   It checks `appMode`. If user acts in 'personal' but mode is 'public', it blocks access.

## `app/index.tsx` (The Traffic Cop)
*   This file is **NOT** a UI screen. It is a logic controller.
*   **Logic**:
    *   If `segments` exist (Deep Link active) -> Do Nothing (Let Router handle it).
    *   If `segments` empty (Root access) -> Redirect to `/public/home` or `/personal/home` based on preference.

## Directory Structure
*   `(auth)`: Publicly accessible Authentication screens (Login/Signup).
*   `(app)`: Protected application logic.
    *   `public`: Routes for Public Mode.
    *   `personal`: Routes for Personal Mode.
