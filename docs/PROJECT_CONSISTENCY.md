# Project Consistency Guide (Frontend)

This document captures the key patterns, conventions, and interdependencies used across the ChatBasket frontend. Use it to keep new code aligned with existing architecture.

## Architecture & Routing
- **Expo Router groups**: `(auth)` for public flows, `(app)` for protected flows split into `public/` and `personal/` directories.
- **Root brain**: `app/_layout.tsx` handles splash gating, deep links, mode sync, and route guards (`Stack.Protected`).
- **Entry router**: `app/index.tsx` redirects to public/personal home when no deep link segments are present.
- **Deep linking**: `+native-intent.tsx` (native cold start) + `state/appMode` for web path sniffing. Set `appMode` synchronously to avoid flicker/race.

## State Management (Legend-State)
- **authState** mirrors session and user metadata; never store tokens in observables.
- **Reset discipline**: use the provided clear/reset helpers (e.g., `clearSession`, `$contactsState.reset`) to avoid stale observables.
- **Guards**: route protection depends on `authState.isLoggedIn` and `appMode` matching the route segment.

## Authentication Flow
- **OTP-based**: no refresh tokens; backend returns `sessionId`, `sessionExpiry`, `isPrimary`, `primaryDeviceName`.
- **Storage**: web keeps `sessionExpiry` (token in HttpOnly cookie); native stores `sessionId`/`userId`/`sessionExpiry`/`user` in secure MMKV via `setMany`.
- **Navigation**: `(auth)/auth` → OTP send → `(auth)/auth-verify`; `isSentOtp` gates access to verify screen.

## Storage Patterns
- **AppStorage wrapper**: single API across MMKV (native) and AsyncStorage/localStorage (web). Prefer `webBackend: 'sync'` for flicker-free prefs.
- **Safety**: `_safeParse` for legacy strings; `setMany` filters undefined; `clearAll` is namespace-scoped on web.
- **Secure storage**: use `AppStorage.createSecure` for sensitive data; verify initialization in native.

## Networking
- **apiClient** (`lib/constantLib/clients/client.ts`): Expo `fetch` wrapper.
  - Native: adds `Authorization: Bearer <sessionId>:<userId>` except on auth whitelist.
  - Web: relies on HttpOnly cookies, uses `credentials: 'include'`.
  - On `session_invalid`/`missing_auth`, calls `clearSession` to reset state/storage.
- **API modules**: public/personal libs export typed functions; components never call fetch directly.

## UI System
- **Semantic theming** with `react-native-unistyles`; use `ThemedText`/`ThemedView` instead of raw `Text/View`.
- **Fonts**: AstaSans (body) and Gantari (headings/brand).
- **Avoid hardcoded colors**; rely on theme tokens.

## Modal System
- **Imperative promise modals** via `showConfirmDialog`, `showAlert`, etc.; rendered centrally in `AppModal` and wired in `_layout.tsx`.
- Do not instantiate modals per-screen; use the utilities.

## Platform Nuances
- **Web**: prefer sync storage for mode/theme to avoid hydration white flash; cookies carry session token.
- **Native**: secure MMKV for sensitive data; ensure splash stays until hydration completes.

## Contribution Checklist
- Follow existing wrappers: storage via `AppStorage`, network via `apiClient`, modals via utilities, routing via Expo Router groups.
- Add new features with typed APIs (public/personal lib) and avoid direct fetch/AsyncStorage.
- When adding state: provide reset/clear paths and align with guards.
- Keep README docs updated when changing flows (auth, storage, networking, routing).
