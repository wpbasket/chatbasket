# Project Consistency Guide (Frontend)

This document captures the key patterns, conventions, and interdependencies used across the ChatBasket frontend. Use it to keep new code aligned with existing architecture.

## Architecture & Routing
- **Expo Router groups**: `(auth)` for auth flows, `(app)` for protected flows split into `public/` and `personal/` directories.
- **Root orchestrator**: `app/_layout.tsx` handles splash gating, hydration, deep links, notifications, and route guards (`Stack.Protected`).
- **Entry router**: `app/index.tsx` redirects to public/personal home when no deep-link segments are present.
- **Deep linking**:
  - Native cold start: `+native-intent.tsx`
  - Warm start: `Linking.addEventListener('url')` in `_layout.tsx`
  - Web initial mode: `state/appMode.ts` checks `window.location.pathname`

## State Management (Legend-State)
- **authState** mirrors session + user metadata (no tokens in observables).
- **Reset discipline**: use storage/state helpers (e.g., `clearSession`, contact/chat reset helpers).
- **Guards**: route protection depends on `authState.isLoggedIn` and `appMode` matching the route segment.

## Authentication Flow
- **OTP-based**: no refresh tokens; backend returns `sessionId`, `sessionExpiry`, `isPrimary`, `primaryDeviceName`.
- **Storage**:
  - Web keeps `sessionExpiry` (token in HttpOnly cookie).
  - Native stores `sessionId`/`userId`/`sessionExpiry`/`user` in secure MMKV via `setMany`.
- **Navigation**: `(auth)/auth` → OTP send → `(auth)/auth-verify`; `isSentOtp` gates access to verify screen.

## Storage Patterns
- **AppStorage wrapper**: single API across MMKV (native) and LocalStorage/AsyncStorage (web).
- **Sync web storage**: prefer `webBackend: 'sync'` for theme/mode to avoid flicker.
- **Secure storage**: use `AppStorage.createSecure()` for PII.
- **Hydration**: `initializeAppStorage()` in `lib/storage/storage.init.ts` orchestrates auth + personal data restore.

## Networking
- **ApiClient** (`lib/constantLib/clients/client.ts`): Expo fetch wrapper.
  - Native: `Authorization: Bearer <sessionId>:<userId>` (non-whitelisted endpoints).
  - Web: HttpOnly cookies + `credentials: 'include'`.
  - On `session_invalid`/`missing_auth`/`invalid_user_id`/`user_not_found`, it calls `clearSession()`.
- **API modules**: public/personal libs export typed functions; components never call fetch directly.

## UI System
- **Semantic theming** with `react-native-unistyles`.
- Use `ThemedText`, `ThemedView`, `ThemedViewWithSidebar` instead of raw `Text`/`View`.
- **Fonts**: AstaSans (body), Gantari (headings/brand).

## Modal System
- **Promise-based modals** via `util.modal.ts` helpers.
- `AppModal` renders the global modal stack in `_layout.tsx`.

## Keyboard & Zero-Render Patterns
- `KeyboardSync` writes IME height into `$uiState.keyboardHeight`.
- Chat and other IME-sensitive screens read that observable directly to avoid rerenders.

## Performance & Re-renders
- **Prop firewall**: use `React.memo` + ID-based comparisons for heavy containers (chat).
- **ID-driven lists**: pass IDs only to lists, let items observe their own data.

## Platform Nuances
- **Web**: sync storage for theme/mode; cookies carry session token.
- **Native**: secure MMKV for sensitive data; keep splash until hydration completes.

## Contribution Checklist
- Follow wrappers: storage via `AppStorage`, network via `ApiClient`, modals via utilities.
- Add new features with typed APIs (public/personal lib) and avoid direct fetch/AsyncStorage.
- When adding state: provide reset/clear paths and align with guards.
- Keep README docs updated when changing flows (auth, storage, networking, routing).
