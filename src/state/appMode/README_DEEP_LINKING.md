# Deep Linking & App Mode Architecture

**Date:** 2026-01-09 (Initial implementation) | 2026-01-12 (Performance optimizations)
**Context:** Fixing Native Deep Links redirecting to wrong Mode + optimizing for zero redundant state updates.

## The Problem
On Native platforms (iOS/Android), `state.appMode` initializes from Persistent Storage (e.g., "Personal") *before* Expo Router processes the Deep Link (e.g., "Public").
This caused a race condition where the App would initialize in Personal Mode, render the Personal Home, and blocking the Public Deep Link (via Route Guards or Redirects).

## The Solution
We successfully decoupled **Navigation** (Expo Router) from **State** (Legend State) using Expo Router's modern `+native-intent.tsx` pattern.

### 1. `+native-intent.tsx` (Cold Start Handler)
This file uses Expo Router's `redirectSystemPath()` API to intercept deep links **before** navigation.
*   **Cold Start Only**: Handles links when app is launched from closed state (`initial: true`).
*   **Synchronous Mode Setting**: Sets `appMode` before the navigation stack renders, preventing race conditions.
*   **Platform**: Native (iOS/Android) only.

### 2. `_layout.tsx` (Warm Start Handler & Navigation Sync)
Handles deep links when the app is already running or backgrounded.
*   **Warm Start**: Listens to `Linking.addEventListener('url')` for background → foreground transitions.
    *   Uses `useCallback` to memoize the handler, recreating only when mode changes.
    *   Only sets mode if different from current value (prevents redundant updates).
*   **Segment Sync**: Uses `useEffect` on `segments` to sync mode during client-side navigation (e.g., `router.push`).
    *   Checks mode before setting to avoid unnecessary state updates.
    *   Does **NOT** depend on `mode` in dependency array to prevent infinite loops during manual toggles.
    
### Performance Optimizations
*   **Zero redundant mode changes**: Navigation within same mode triggers no state updates.
*   **Memoized handlers**: Deep link handler only recreates when mode actually changes.
*   **Single mode change on deep links**: Cold start sets mode once, segments sync sees it's correct and skips.

### 2. `index.tsx` (The Passive Gatekeeper)
Previously, `index.tsx` would redirect to `/public/home` or `/personal/home` immediately.
*   **Fix**: It now checks `if (segments.length > 0)`.
*   If Route Segments exist (meaning a Deep Link is valid, e.g. `/public/profile`), `index.tsx` returns `null` and does **NOT** redirect.
*   It only redirects if the user is truly at the Root (`/`).

### Flow Diagram (Public Link, Personal Mode)
1.  **Deep Link**: `chatbasket://public/profile`
2.  **`+native-intent.tsx`**: Intercepts URL → Sets `appMode = 'public'` (Before navigation)
3.  **Expo Router**: Navigates to `/public/profile`
4.  **Route Guard**: Checks `mode === 'public'` → **PASS** (because Step 2 happened first)
5.  **`index.tsx`**: Checks segments → `['public', 'profile']` → **Returns Null** (No Hijack)
6.  **Result**: User sees Public Profile.

## Future Maintenance
*   **Adding New Modes**: Update the logic in both `+native-intent.tsx` (cold start) and `_layout.tsx` (warm start) to detect new path prefixes.
*   **Do NOT**: Re-add redirection logic to `index.tsx` without checking `segments.length`.
*   **Pattern**: `+native-intent.tsx` handles cold starts, `_layout.tsx` handles warm starts and navigation sync.
