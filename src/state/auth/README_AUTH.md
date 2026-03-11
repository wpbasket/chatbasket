# Authentication State Architecture

**State Library:** `@legendapp/state`
**Primary State:** `state/auth/state.auth.ts`

## Core State Shape
`authState` is the single observable for auth/session metadata:
- `isSentOtp`: gates `(auth)/auth-verify` routing.
- `isLoggedIn`: current session status.
- `sessionId` / `sessionExpiry`: session metadata (native stores sessionId, web typically keeps only expiry).
- `userId` / `user`: cached profile data.
- `isPrimary` / `primaryDeviceName`: primary-device status from backend session responses.
- `name` / `email`: cached identifiers for UI.
- `isInTheProfileUpdateMode`: profile edit guard flag.

## Initialization (Hydration)
Hydration is orchestrated by `initializeAppStorage()` in `lib/storage/storage.init.ts` and is called once in `app/_layout.tsx`.

Sequence:
1. `initializeSecureStorage()` prepares secure storage providers.
2. `restoreAuthState()` reads persisted session data.
3. If logged in, additional personal storage hydration happens (contacts, user, device status, chat storage).
4. Root layout waits on hydration before rendering to avoid route-guard flicker.

### Storage Notes
- **Native**: Session identifiers live in encrypted MMKV and are mirrored into `authState` for request headers.
- **Web**: Session token is expected to live in HttpOnly cookies; `authState.sessionId` is typically `null`, while `sessionExpiry` is persisted.

## Login / Signup (OTP Flow)
1. User submits email + 6-digit numeric password (PIN) → backend sends OTP and sets `authState.isSentOtp = true`.
2. User verifies OTP in `(auth)/auth-verify`.
3. Backend returns session payload and user metadata (`sessionId`, `sessionExpiry`, `isPrimary`, `primaryDeviceName`).
4. Storage and `authState` are updated; `(app)` stack mounts and `(auth)` stack unmounts.

## Logout
`clearSession()` (from `lib/storage/commonStorage/storage.auth.ts`) performs a full teardown:
- Stops the chat connection watcher + outbox queue (prevents in-flight writes after logout)
- Clears secure storage keys (session + user data)
- Clears preferences (theme/mode)
- Clears personal caches (contacts/user/device) and chat storage
- Resets auth observables and sets `appMode` back to `public`
- Resets in-memory domain stores (contacts, chat lists/messages, user cache)

## Guarding & Security
- `Stack.Protected` guards depend on `authState.isLoggedIn` and the current `appMode`.
- `sessionExpiry` is enforced during hydration; expired sessions trigger a cleanup.
- Web security relies on HttpOnly cookies; native uses `Authorization: Bearer <sessionId>:<userId>` headers via the API client.
