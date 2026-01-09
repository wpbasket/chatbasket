# Deep Linking & App Mode Architecture

**Date:** 2026-01-09
**Context:** Fixing Native Deep Links redirecting to wrong Mode.

## The Problem
On Native platforms (iOS/Android), `state.appMode` initializes from Persistent Storage (e.g., "Personal") *before* Expo Router processes the Deep Link (e.g., "Public").
This caused a race condition where the App would initialize in Personal Mode, render the Personal Home, and blocking the Public Deep Link (via Route Guards or Redirects).

## The Solution
We successfully decoupled **Navigation** (Expo Router) from **State** (Legend State) using an Event-Driven architecture in `_layout.tsx`.

### 1. `_layout.tsx` (The Controller)
This is the single source of truth for handling Deep Links.
*   **Cold Start**: Checks `Linking.getInitialURL()` during `init`. If found, it updates `appMode` **synchronously** before the app mounts.
*   **Warm Start**: Listens to `Linking.addEventListener('url')` to handle deep links when the app is in the background.
*   **Segment Sync**: Uses `useEffect` on `segments` to ensure `appMode` stays in sync during internal navigation (e.g. `router.push`).
    *   *Optimization*: Does **NOT** depend on `mode` to prevent infinite loops during manual toggles.

### 2. `index.tsx` (The Passive Gatekeeper)
Previously, `index.tsx` would redirect to `/public/home` or `/personal/home` immediately.
*   **Fix**: It now checks `if (segments.length > 0)`.
*   If Route Segments exist (meaning a Deep Link is valid, e.g. `/public/profile`), `index.tsx` returns `null` and does **NOT** redirect.
*   It only redirects if the user is truly at the Root (`/`).

### Flow Diagram (Public Link, Personal Mode)
1.  **Deep Link**: `chatbasket://public/profile`
2.  **`_layout.tsx`**: Detects URL -> Sets `appMode = 'public'` (Instant)
3.  **Expo Router**: Navigates to `/public/profile`
4.  **Route Guard**: Checks `mode === 'public'` -> **PASS** (because Step 2 happened first)
5.  **`index.tsx`**: Checks segments -> `['public', 'profile']` -> **Returns Null** (No Hijack)
6.  **Result**: User sees Public Profile.

## Future Maintenance
*   **Adding New Modes**: Update the logic in `_layout.tsx` to detect new path prefixes.
*   **Do NOT**: Re-add redirection logic to `index.tsx` without checking `segments.length`.
