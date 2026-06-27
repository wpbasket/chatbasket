# Storage Architecture

**Libraries:** `react-native-mmkv`, `expo-secure-store`, `expo-crypto`, Web Crypto API, IndexedDB
**Strategy:** Unified typed wrapper + encrypted tiers for sensitive data.

## 1) Generic Typed Wrapper (`storage.wrapper.ts`)
`AppStorage<T>` provides a cross-platform API with a consistent shape.

Web backends (selected via `webBackend` option):
- **`'sync'`** → `window.localStorage`. Synchronous reads (required for boot-time theme/mode via `getSync()`). Used by `preferences` only.
- **`'indexeddb'`** → shared `AppStorageIDB` database (v1) with a single `kv` object store. Records are keyed by `${scope}\u0000${key}` (composite key); `clearAll(scope)` deletes a key range covering exactly that scope's prefix. Async-only (no `getSync`). Used by all 5 secure scopes.

Key behaviors:
- **Native**: Uses MMKV (sync) regardless of scope. Secure scopes are encrypted with a SecureStore-managed key.
- **Web**: `'sync'` → localStorage; `'indexeddb'` → IndexedDB. Secure scopes on web wrap values through `WebVault.encrypt/decrypt`.
- **Encryption**: `createSecure()` enables encryption. Native → SecureStore-managed MMKV key. Web → values AES-GCM-encrypted with a non-extractable `CryptoKey` from `WebVault`; ciphertext stays in IndexedDB.
- **Legacy parsing**: `_safeParse` reads JSON or falls back to raw strings (legacy fallback for non-encrypted values under a secure key).
- **Auto-commit safety** (web IndexedDB): encryption/decryption awaits happen **outside** the IDB transaction to avoid `TransactionInactiveError` (mirrors `chat.storage.web.ts`).

## 2) WebVault (Web Secure Storage)
`WebVault` stores an AES-GCM key in IndexedDB (`AppStorageVault` DB) as a **non-extractable** `CryptoKey`. Encrypted values are stored in IndexedDB (`AppStorageIDB` `kv` store) with a `__cb_enc` JSON marker (`{__cb_enc, ct, iv}`).

Flow:
1. Generate or load a non-extractable AES-GCM key (lives in `AppStorageVault`).
2. Encrypt payloads **before** opening the IDB write transaction.
3. Decrypt on read (after the read transaction resolves).

## 3) Storage Tiers

### A) Preferences (non-sensitive)
**File:** `storage.preferences.ts`
- **Web**: `webBackend: 'sync'` (localStorage) — required for synchronous `getSync()` at boot (Unistyles `initialTheme`, no theme flash).
- **Native**: MMKV sync reads.

### B) Secure / PII Storage
**Files:**
- `commonStorage/storage.auth.ts` → scope `secure-auth-storage`
- `personalStorage/personal.storage.device.ts` → scope `personal-device`
- `personalStorage/profile/personal.storage.user.ts` → scope `personal-user`
- `personalStorage/personalStorage/personal.storage.contacts.ts` → scope `personal-contacts`
- `personalLib/e2ee/e2ee.keys.ts` → scope `secure-e2ee-storage`

Each is instantiated with `AppStorage.createSecure(id, { webBackend: 'indexeddb' })`.
- **Native**: MMKV encrypted with a SecureStore-managed key.
- **Web**: WebVault encryption (AES-GCM, non-extractable key) + IndexedDB persistence. Every record in the `kv` store under these scopes is a `__cb_enc` ciphertext string.

### C) Chat Storage (already IDB / SQLite — untouched)
**Files:** `personalStorage/chat/chat.storage.ts`, `.web.ts`, `.native.ts`, `.schema.ts`, `.normalize.ts`, `personal.storage.chat.ts`
- **Web**: dedicated IndexedDB (`ChatStorage` + `ChatStorageVault`) with `messages`/`chats`/`media`/`user_keys` stores. AES-GCM-encrypted.
- **Native**: expo-sqlite (`chatMessages.db`).

### D) Profile Storage (already IDB — untouched)
**File:** `personalStorage/profile/profile.storage.ts` — dedicated `ProfileStorage` IndexedDB for the avatar Blob.

## 4) Initialization & Hydration
`initializeAppStorage()` (see `lib/storage/storage.init.ts`) orchestrates:
1. Secure storage init (`initializeSecureStorage`).
2. Auth restoration (`restoreAuthState`).
3. Personal data hydration (user, device, contacts, chat).
4. Start chat connection watcher and outbox queue.
5. Post-online cleanup (purge deleted rows, orphaned media).

## 5) Usage Notes
- Use `setMany()` for concurrent multi-key saves.
- Use `clearAll()` for scoped clears. On web IndexedDB this deletes the key range for the scope only — other scopes are untouched.
- `getSync()` / `getSyncMany()` / `getSyncWithDefault()` return `null` / default for `indexeddb`-backed scopes (IDB is async-only). Use them only on `'sync'` scopes (e.g. `preferences`).
- `addOnValueChangedListener()` is a no-op on web; use it only on native.

## Helper Entry Points
- `AppStorage.createSecure(id, { webBackend })` for encrypted storage (`webBackend` defaults to `'indexeddb'`).
- `WebVault` for web crypto integration.
- `addOnValueChangedListener()` for native change events.

## Databases on Web
- `AppStorageIDB` — v1, single `kv` store, holds all encrypted AppStorage scope records.
- `AppStorageVault` — v1, `Keys` store, holds the non-extractable AES-GCM master key (shared by every secure scope).
- `ChatStorage` + `ChatStorageVault` — chat storage (separate, already IDB).
- `ProfileStorage` — avatar blob (separate, already IDB).