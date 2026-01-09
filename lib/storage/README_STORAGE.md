# Storage Architecture

**Libraries:** `react-native-mmkv`, `expo-secure-store`, `expo-crypto`
**Strategy:** Hybrid Encrypted Storage

## The "Encrypted MMKV" Pattern
Instead of choosing between "Slow but Secure" (SecureStore) and "Fast but Insecure" (MMKV), we combine them to get **Encrypted High-Performance Storage**.

### Implementation (`storage.secure.ts`)

1.  **The Key**: We generate a random 16-byte AES-128 key using `expo-crypto`.
2.  **Key Storage**: This key is stored in `expo-secure-store` (Keychain/Keystore).
    *   *Why?* The Keychain is hardware-backed and secure.
3.  **The Database**: We initialize an `MMKV` instance using this key:
    ```typescript
    new MMKV({ id: '...', encryptionKey: keyFromSecureStore })
    ```
4.  **Result**: Data written to disk is encrypted (safe), but read/write operations happen synchronously in C++ (fast).

### Storage Tiers

1.  **Preferences Storage (`storage.preferences.ts`)**
    *   **Backend**: Unencrypted MMKV (default instance).
    *   **Data**: App Mode (Public/Personal), Theme, UI flags.
    *   **Speed**: Instant synchronous access.

2.  **Secure Storage (`storage.secure.ts`)**
    *   **Backend**: Encrypted MMKV (Custom instance).
    *   **Data**: Session Tokens, Refresh Tokens, Sensitive User Data.
    *   **Speed**:
        *   *First Access*: Async (must fetch key from SecureStore).
        *   *Subsequent Access*: Sync (MMKV instance explicitly cached in memory).

## Helper Functions
*   `getOrCreateEncryptionKey`: Handles the lazy generation and retrieval of the AES key.
*   `bytesToPrintableAscii`: Converts raw bytes to a string format compatible with MMKV's C++ bridge.
