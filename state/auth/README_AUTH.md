# Authentication State Architecture

**State Library:** Legend-State
**File:** `state/auth/state.auth.ts`

## Core Components
* `authState`: The main observable object containing:
  * `isSentOtp`: OTP step flag to gate `(auth)/auth-verify` routing.
  * `isLoggedIn`: Boolean indicating active session.
  * `sessionId` / `sessionExpiry`: Session token + expiry (OTP-based, no refresh token).
  * `userId` / `user`: Profile data (`ProfileResponse`).
  * `isPrimary` / `primaryDeviceName`: Primary device status from backend session response.
  * `name` / `email`: Cached identifiers for UI.
  * `isInTheProfileUpdateMode`: Tracks profile edit mode (navigation guards/UI states).

## Key Workflows

### 1. Initialization (Hydration)
* **Location**: `app/_layout.tsx` → `restoreAuthState()`
* **Logic (current implementation)**:
  1. Pause Splash Screen.
  2. Initialize secure storage (`initializeSecureStorage`).
     * **Web**: Uses `WebVault` with non-extractable keys in IndexedDB.
     * **Native**: Uses hardware-backed keys via `expo-secure-store`.
  3. Read session from storage via `getSession()`:
     * **Web**: only `sessionExpiry` (no sessionId persisted) plus optional cached user (now encrypted).
     * **Native**: `sessionId`, `userId`, `sessionExpiry`, `user`.
  4. Validate expiry; if valid, set `authState` (and fetch device status). Otherwise, `clearSession()` resets storage and state.
  5. Resume rendering once guards run.

### 2. Login / Signup Flow (OTP-based)
* **Screens**: `(auth)/auth` → `(auth)/auth-verify`
* **Logic**:
  1. User submits email/password (login) or signup form; server sends OTP and sets `isSentOtp` → guards allow `/auth-verify`.
  2. On successful OTP verification, backend returns `sessionId`, `sessionExpiry`, user info, `isPrimary`, `primaryDeviceName`.
  3. Storage handling:
     * **Web**: persist only `sessionExpiry` (cookies carry session token); skip `sessionId`.
     * **Native**: persist `sessionId`, `userId`, `sessionExpiry`, and optional `user` atomically via `setMany` in secure MMKV.
  4. `authState` is updated; `(auth)` stack unmounts and `(app)` stack mounts.

### 3. Logout
* Clears all auth-related keys from secure storage (`clearAll`), preferences (theme/mode), personal caches (user, contacts, device status), and resets observables (`authState`, `appMode`, contact/user stores).
* Server-side: call session invalidation endpoint (see service layer) to revoke the `sessionId`.

## Security & Storage Notes
* Session tokens are not stored in observable state; they live in secure storage (native) or cookies (web).
* **Cross-Platform Security**:
    * **Web**: PII (User, Contacts, Expiry) is encrypted using AES-256-GCM. The encryption key is marked as **non-extractable** in IndexedDB, preventing theft via XSS.
    * **Native**: Uses hardware-backed AES-128 via MMKV + Keychain/Keystore.
* `sessionExpiry` gates hydration; expired sessions trigger `clearSession()` to avoid stale cookies/state.
