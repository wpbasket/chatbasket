# Storage Architecture

**Libraries:** `react-native-mmkv`, `expo-secure-store`, `expo-crypto`, `@react-native-async-storage/async-storage`, Web Crypto API
**Strategy:** Unified typed wrapper + encrypted tiers for sensitive data.

## 1) Generic Typed Wrapper (`storage.wrapper.ts`)
`AppStorage<T>` provides a cross-platform API with a consistent shape.

Key behaviors:
- **Native**: Uses MMKV for sync access.
- **Web**: Uses LocalStorage for sync (`webBackend: 'sync'`) or AsyncStorage for async storage.
- **Encryption**: `createSecure()` enables encryption (MMKV key on native, WebVault on web).
- **Legacy parsing**: `_safeParse` reads JSON or falls back to raw strings for legacy values.

## 2) WebVault (Web Secure Storage)
`WebVault` stores an AES-GCM key in IndexedDB as a **non-extractable** `CryptoKey`. Encrypted values are stored in LocalStorage with a `__cb_enc` marker.

Flow:
1. Generate or load a non-extractable AES-GCM key.
2. Encrypt payloads before persistence.
3. Decrypt on read.

## 3) Storage Tiers

### A) Preferences (non-sensitive)
**Example**: `storage.preferences.ts`
- **Web**: `webBackend: 'sync'` to prevent theme/mode flicker.
- **Native**: MMKV sync reads.

### B) Secure/PII Storage
**Examples**: `storage.auth.ts`, `personal.storage.user.ts`, `personal.storage.contacts.ts`, chat storage.
- **Native**: MMKV encrypted with a SecureStore-managed key.
- **Web**: WebVault encryption + LocalStorage or AsyncStorage.

## 4) Initialization & Hydration
`initializeAppStorage()` (see `lib/storage/storage.init.ts`) orchestrates:
1. Secure storage init (`initializeSecureStorage`).
2. Auth restoration (`restoreAuthState`).
3. Personal data hydration (user, device, contacts, chat).
4. Start chat connection watcher and outbox queue.
5. Post-online cleanup (purge deleted rows, orphaned media).

## 5) Usage Notes
- Use `setMany()` for atomic multi-key saves.
- Use `clearAll()` for scoped clears (web removes only keys matching the storage prefix).
- Prefer `getSync()` only when `webBackend` is set to `sync`.

## Helper Entry Points
- `AppStorage.createSecure()` for encrypted storage.
- `WebVault` for web crypto integration.
- `addOnValueChangedListener()` for native change events.
