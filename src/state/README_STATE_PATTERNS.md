# State Management Patterns

**Library:** `@legendapp/state`
**Philosophy:** Fine-grained reactivity with domain-scoped stores.

## Why Legend-State?
Legend-State allows components to subscribe to specific observable fields, avoiding full-tree rerenders typical with Context or classic Redux stores.

## Domain Stores
We split state by domain under `state/`:

1. **Global App State**
   - `auth`: Session metadata, user identity, primary device flags.
   - `appMode`: Public vs personal mode selection + URL sync.
   - `settings`: UI prefs (theme, notifications, mode).
   - `modals`: Global modal manager.

2. **Domain Data**
   - `publicState`: Public profiles, posts, feed.
   - `personalState`: Chats, contacts, profile, sync engine.

## Persistence Strategy
We use a custom `AppStorage` wrapper (see `lib/storage/storage.wrapper.ts`) to keep storage consistent across native and web.

- **Encrypted PII**: Auth, profile, contacts, device status and chat data use `AppStorage.createSecure`.
  - **Native**: MMKV with a secure-store managed encryption key.
  - **Web**: `WebVault` with a non-extractable AES-GCM key stored in IndexedDB.
- **Non-sensitive prefs**: Theme and app mode use unencrypted storage (sync on web to avoid flicker).
- **Transient state**: UI modals and ephemeral UI flags remain in-memory only.

## Storage Initialization
Hydration is centralized in `lib/storage/storage.init.ts` and runs once inside `app/_layout.tsx`. It:
1. Initializes secure storage
2. Restores auth state
3. Hydrates personal state (contacts, user, device status, chat storage) when logged in
4. Starts chat connection watcher + outbox queue
5. Schedules post-online cleanup (purge deleted rows, orphaned media)

## Guarding & Reset Discipline
- Route guards depend on `authState.isLoggedIn` and `appMode`.
- Reset state via provided helpers (`clearSession`, `$contactsState.reset`, chat storage clear) rather than manual mutation to avoid stale caches.
