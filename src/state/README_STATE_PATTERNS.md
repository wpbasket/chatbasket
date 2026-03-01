# State Management Patterns

**Library:** `Legend-State`
**Philosophy:** "Fine-Grained Reactivity"

## Why Legend-State?
Unlike Context API (re-renders entire tree) or Redux (boilerplate heavy), Legend-State allows specific components to listen to specific properties of an object.

## Domain Stores
We split state by "Domain" in the `state/` directory:

1.  **Global App State**:
    *   `auth`: Session, Tokens, User ID.
    *   `appMode`: Public vs Private mode toggle.
    *   `settings`: UI preferences.
    *   `modals`: Transient UI state (Global Modal Manager).

2.  **Domain Data**:
    *   `publicState`: Data specific to Public Profile (User Posts, Public Feed).
    *   `personalState`: Data specific to Personal Profile (Private Chats, Contacts).

## Persistence
Legend-State has built-in persistence, but for **Personally Identifiable Information (PII)**, we use a custom **`AppStorage`** wrapper to ensure maximum security:
*   **Encrypted PII**: Auth, Profile, and Contacts use `AppStorage.createSecure`.
    *   **Native**: Hardware-backed keys via `expo-secure-store`.
    *   **Web**: Non-extractable keys via Web Crypto API stored in **IndexedDB**.
*   **Non-Sensitive Prefs**: Theme and Mode use unencrypted sync `AppStorage`.
*   **Transient State**: `modals` and other temporary UI states are NOT persisted (In-memory only) to minimize attack surface.
