# Authentication State Architecture

**State Library:** Legend-State
**File:** `state/auth/state.auth.ts`

## Core Components
*   `authState`: The main observable object containing:
    *   `token` / `refreshToken`: Session credentials.
    *   `sessionId`: Unique ID for the current verified session.
    *   `userId` / `user`: Profile data (`ProfileResponse`).
    *   `isInTheProfileUpdateMode`: Boolean flag to track if user is editing their profile (used to block navigation or show UI states).
    *   `isLoggedIn`: Boolean indicating active session.

## Key Workflows

### 1. Initialization (Hydration)
*   **Location**: `app/_layout.tsx` -> `restoreAuthState()`
*   **Logic**:
    1.  Pauses Splash Screen.
    2.  Reads Encrypted MMKV tokens.
    3.  If valid, sets `authState.isLoggedIn = true`.
    4.  Triggers background fetch (`getUser`) to refresh profile data.
    5.  Hides Splash Screen.

### 2. Login Flow
*   **Screen**: `(auth)/login` or `(auth)/signup`.
*   **Logic**:
    1.  User authenticates via API.
    2.  Response contains `accessToken`, `refreshToken`, `sessionId`.
    3.  Tokens are saved to Encrypted Storage.
    4.  `authState` is updated.
    5.  `RootLayout` sees the state change and unmounts the `(auth)` group, mounting `(app)` group.

### 3. Logout
*   **Action**: Clears `authState` variables.
*   **Storage**: Wipes the specific keys from Encrypted MMKV.
*   **Server**: Sends request to invalidate the `sessionId`.

## Security Best Practices
*   **Token Storage**: Tokens are NOT stored in the observable persistence directly. They are manually managed in the Encrypted MMKV instance to ensure we control exactly when they are written/wiped.
*   **Session tracking**: `sessionId` allows us to revoke specific devices from the server side.
