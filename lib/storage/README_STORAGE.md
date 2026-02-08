# Storage Architecture

**Libraries:** `react-native-mmkv`, `expo-secure-store`, `expo-crypto`, `@react-native-async-storage/async-storage`
**Strategy:** Hybrid Encrypted Storage & Unified Typed Wrappers

## 1. Generic Typed Wrapper (`storage.wrapper.ts`)
**Use this for all new storage modules.**

The `AppStorage<T>` class provides a unified, strictly-typed interface that works across **Native (MMKV)** and **Web (AsyncStorage or sync localStorage)**.

### Why use it?
* **Platform Agnostic**: Native uses MMKV; Web can be `async` (AsyncStorage) or `sync` (localStorage) via `webBackend` option to avoid hydration flashes for critical prefs.
* **Strict Typing**: Schema interface enforces key/value types.
* **Automatic Serialization + Safe Migration**: JSON stringifies; `_safeParse` tolerates legacy raw strings.
* **Security Options**: Supports encrypted instances via `createSecure`.
* **Batch Safety**: `setMany` filters out `undefined` to prevent corrupt writes; `getMany`/`getSyncMany` read multiple keys efficiently.
* **Scoped Clearing**: `clearAll` only removes keys for the current namespace (prefix) on web.

### Usage Examples

#### Standard Storage (Fast, Non-Sensitive)
```typescript
import { AppStorage } from "@/lib/storage/storage.wrapper"; 

type FeatureSchema = { 'last-sync': number; 'enabled': boolean };

// Synchronous instantiation
const storage = new AppStorage<FeatureSchema>('feature-scope');

await storage.set('enabled', true);
```

#### Secure Storage (Encrypted, Sensitive Data)
Use `AppStorage.createSecure` to automatically handle hardware-backed encryption keys.

```typescript
type SecretSchema = { 'api-token': string; 'refresh-token': string };

// Async instantiation (generates/fetches 128-bit AES key)
const secureStorage = await AppStorage.createSecure<SecretSchema>('my-secrets');

await secureStorage.set('api-token', 'xyz-123'); // Encrypted on disk
```

### Web Sync Backend (Flicker-Free Preferences)
Use `new AppStorage(id, undefined, { webBackend: 'sync' })` for web-only keys that must be read synchronously (e.g., theme/mode) to avoid white flash during hydration.

---

## 2. The "Encrypted MMKV" Pattern (Under the hood)
Instead of choosing between "Slow but Secure" (SecureStore) and "Fast but Insecure" (MMKV), we combine them to get **Encrypted High-Performance Storage**.

### Implementation Details

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
