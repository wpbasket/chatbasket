# Storage Architecture

**Libraries:** `react-native-mmkv`, `expo-secure-store`, `expo-crypto`, `@react-native-async-storage/async-storage`, `Web Crypto API` (Web)
**Strategy:** Hybrid Encrypted Storage & Unified Typed Wrappers with Hardware/Non-Extractable Keys.

## 1. Generic Typed Wrapper (`storage.wrapper.ts`)
**Use this for all new storage modules.**

The `AppStorage<T>` class provides a unified, strictly-typed interface that works across **Native (MMKV)** and **Web (LocalStorage/IndexedDB)**.

### Why use it?
* **Platform Agnostic**: Native uses MMKV; Web uses LocalStorage (sync) or AsyncStorage.
* **Strict Typing**: Schema interface enforces key/value types.
* **Security Options**: Supports encrypted instances via `createSecure`.
* **Automatic Encryption**: On Web, `createSecure` instances use non-extractable keys.

---

## 2. Platform Security Architecture

### A. Native Platform (Encrypted MMKV)
Instead of choosing between "Slow but Secure" (SecureStore) and "Fast but Insecure" (MMKV), we combine them:
1.  **The Key**: 16-byte random key generated via `expo-crypto`.
2.  **Key Storage**: Saved in `expo-secure-store` (Hardware-backed Keychain/Keystore).
3.  **The Database**: Native `MMKV` instance initialized with this key.
4.  **Result**: Synchronous performance with hardware-grade security.

### B. Web Platform (WebVault + IndexedDB)
Since Web browsers lack a direct "SecureStore", we use the **Optimal Security** pattern:
1.  **The Key**: 256-bit AES-GCM key generated via `window.crypto.subtle`.
2.  **Encryption Layer**: A dedicated `WebVault` class manages cryptographic operations.
3.  **Key Persistence**: The key is stored in **IndexedDB** as a **non-extractable** `CryptoKey` object.
    *   *Why?* Even if an XSS attack occurs, the key cannot be exported or viewed by malicious JavaScript.
4.  **Data Storage**: Encrypted payloads are stored in `localStorage` with a `__cb_enc: true` metadata flag.

---

## 3. Storage Tiers

1.  **Preferences Storage (`storage.preferences.ts`)**
    *   **Backend**: Unencrypted.
    *   **Data**: Theme, App Mode, UI flags.
    *   **Reason**: Frequent access, non-sensitive, must be synchronous to prevent flash.

2.  **Secure Storage (`storage.auth.ts`, `personal.storage.user.ts`, etc.)**
    *   **Backend**: Encrypted (Native: MMKV-Keyed / Web: WebVault).
    *   **Data**: Session Tokens, PII, Contacts, Device Status.
    *   **Speed**:
        *   *Native*: Instant sync access.
        *   *Web*: Async (promises used for Crypto operations).

---

## Helper Functions
*   `WebVault`: Handles Web Crypto API integration and IndexedDB key persistence.
*   `AppStorage.createSecure`: The entry point for creating any encrypted storage instance.
