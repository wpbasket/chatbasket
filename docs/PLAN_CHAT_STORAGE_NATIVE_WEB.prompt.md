# Chat Storage Plan (Native SQLite + Web Secure IndexedDB)

## Scope Lock
- Native (`ios`/`android`): use `expo-sqlite` only (SQLCipher-enabled build from start).
- Web: **do not use Expo SQLite**; use encrypted WebVault + structured IndexedDB repositories.
- Keep full local chat history unless user explicitly clears data.
- Media binaries are stored separately from message metadata.

## Confirmed Existing Flow (Audit Summary)
- Chat state orchestration lives in `state/personalState/chat/personal.state.chat.ts` and `ws.event.bridge.ts`.
- API + WS contracts are in `lib/personalLib/chatApi/personal.api.chat.ts` and `ws.client.ts`.
- Entry points affecting chat flow: `app/personal/_layout.tsx`, `app/personal/home/index.tsx`, `app/personal/contacts/index.tsx`, `app/personal/chat/[chat_id].tsx`.
- Backend authority for rules/events: `personalservice/chat_service.go`, `chat_file_service.go`, `ws_hub.go`, handlers, and SQL in `db/personal/queries/personal_chat.sql` (+ migrations `008/009/011/012`).
- Auth split is already platform-aware:
  - Web requests use cookies (`credentials: include`) and web upload client (`lib/constantLib/clients/fileClient.web.ts`).
  - Native uses bearer token (`Authorization: Bearer session:user`) and native upload client (`lib/constantLib/clients/fileClient.ts`).

---

## Pre-Migration Fixes (Must Complete Before Storage Work)

These are bugs/gaps in the existing codebase that the storage migration will depend on or exacerbate.

### P1. `clearSession()` must reset chat state — CRITICAL
**File:** `lib/storage/commonStorage/storage.auth.ts` (lines 103-161)

`clearSession()` currently resets contacts, user, preferences, and auth observables but **never calls** `$chatListState.reset()`, `$chatMessagesState.reset()`, or `stopWSEventBridge()`. The WS bridge teardown only fires on layout unmount, not on logout.

**Impact without fix:** On logout → re-login as a different user on the same device, stale chat data from the previous user remains in Legend State observables until the next `getUserChats` overwrite. With local DB persistence added, this becomes a **data leakage vector** — the new user could see persisted chat rows belonging to the previous user.

**Required change:**
- Add to `clearSession()`:
  - `stopWSEventBridge()` — stop WS immediately
  - `$chatListState.reset()` — clear chat list observable
  - `$chatMessagesState.reset()` — clear all message observables
  - Wipe user-scoped local DB (SQLite `DROP`/re-create or IndexedDB `clear()`)
  - Delete user-scoped media cache folder (`chat-media/{userId}/`)

### P2. Add `client_generated_id` to send contract — CRITICAL
**Files:** `app/personal/chat/[chat_id].tsx` (lines 493-540), `lib/personalLib/models/personal.model.chat.ts` (`SendMessagePayload`), backend `personalmodel/chat_models.go` (`SendMessageRequest`), `personal_chat.sql`

Current send flow uses `temp-${Date.now()}` as a fake `message_id`, then does a blunt remove-old/add-new swap on API response. If the WS `new_message` event arrives before the API response, `handleNewMessage` checks against the real `message_id` (not the temp one), causing the message to appear **twice** briefly.

**Required changes:**
- Frontend: add `client_generated_id: string` (UUID) to `SendMessagePayload` and `MessageEntry`
- Backend: accept `client_generated_id` in `SendMessageRequest`, persist it in the `messages` table, return it in the response and WS broadcast
- SQL: add `client_generated_id VARCHAR UNIQUE` column to messages table (migration)
- Frontend reconciliation: on `new_message` WS event or API response, match by `client_generated_id` first, then `message_id` — update the existing row in-place instead of remove+add

### P3. Fix `resolveMediaUrls` field mismatch
**Files:** `utils/personalUtils/util.chatMedia.ts`, `app/personal/chat/_components/MessageBubble.tsx`

Backend `GetFileURLResponse` returns `view_url` + `download_url`. But `resolveMediaUrls()` only sets `file_url` on the message entry. `MessageBubble` renders using `viewUrl || fileUrl` and `downloadUrl || fileUrl` — so URL refresh writes to a different field than the initial payload.

**Required change:**
- `resolveMediaUrls()` should set `view_url` and `download_url` on the message entry (matching the backend response shape), not just `file_url`
- Alternatively, normalize all URL fields to a single canonical field at the model layer

---

## Target Local Storage Design

### Native DB (`expo-sqlite` + SQLCipher)
Tables:
- `chats` — mirrors backend chat list response
- `chat_members` — participants per chat
- `messages` — all message content with delivery/sync status
- `message_status` — per-message delivery + read tracking
- `sync_actions` — pending sync operations from server
- `message_media` — file metadata + local cache state
- `outbox_queue` — unsent messages waiting for connectivity

Required constraints:
- `messages(message_id)` unique
- `messages(client_generated_id)` unique nullable ← requires P2
- `sync_actions(sync_action_id)` unique
- `message_media(message_id)` index
- `messages(chat_id, created_at)` index
- `outbox_queue(client_generated_id)` unique

### Web DB (Encrypted IndexedDB)
- Mirror the same logical repositories and keys as native.
- Encrypt record payloads with existing WebVault key model.
- Keep schema shape close to native to share domain mappers and reducers.

### File Storage (`expo-file-system`)
- Message metadata in DB (`message_media`); binary in app-private FS path under `Paths.document`.
- Suggested structure: `chat-media/{userId}/{chatId}/{messageId}/{variant}`.
  - User-scoped root ensures clean wipe on account switch (P1).
- Store: mime, byte size, hash, local URI, remote URL/token expiry, download state.
- Public user downloads remain explicit and go through existing Android downloads module.

---

## Interdependency Refinements

### 1) Boot/Startup Ordering
In personal app boot (`app/personal/_layout.tsx` path):
1. Call `PersonalUtilRefreshDeviceStatus()` — sets `isPrimary` flag ← **must happen first** (gates sender sync ACKs in step 5).
2. Initialize storage engine (native SQLite or web IndexedDB repository).
3. Rehydrate local chat list + recent message slices into Legend State.
4. Start websocket bridge (`startWSEventBridge`).
5. Trigger sync-actions catch-up (`$syncEngine.catchUp()`).
6. Run `syncPendingMessages()` proactive pull.

**Current code order reference** (`_layout.tsx` lines 22-37):
- `$syncEngine.catchUp()` fires after 3s timeout
- `PersonalUtilRefreshDeviceStatus()` fires synchronously (no await)
- `startWSEventBridge()` fires after 2s timeout

**Issue:** Device status refresh is fire-and-forget. If `isPrimary` resolves after `syncPendingMessages` runs, sender sync ACKs may fire (or not fire) based on stale `isPrimary`. Storage init must be sequenced before WS bridge to prevent events writing to an uninitialized DB.

### 2) Idempotent Event Application
For WS events (`new_message`, `delivery_ack`, `read_receipt`, `unsend`, `delete_for_me`, `sync_action`):
- Apply via upsert/merge semantics keyed by authoritative IDs.
- `new_message`: match by `client_generated_id` first (for own sends), then `message_id` — prevents duplicate rows.
- Ignore duplicates safely using DB unique constraints.
- Make reducers replay-safe (event can arrive after API backfill or `syncPendingMessages` pull).

### 3) Optimistic Message Reconciliation
When sending:
- Generate `client_generated_id` (UUID v4) at message creation time ← requires P2.
- Create local pending row in DB with `client_generated_id`, temp status, and `message_id = NULL`.
- On API response: set real `message_id`, update status to `sent`.
- On WS `new_message` (own echo): match by `client_generated_id`, update in-place (no remove+add).
- Preserve attachment links and local send progress metadata across reconciliation.

### 4) Chat Preview + Unread Consistency
- Keep local preview and unread counts aligned with backend semantics from SQL/migrations (`012` per-participant preview columns).
- When `isChatOpen(chatId)` is true, mark/read locally immediately then reconcile server result.
- On close/reopen, perform lightweight consistency pass from last known message/read pointers.

### 5) File URL Expiry + Refresh
For protected media URLs:
- Persist expiry timestamp and `file_ref` metadata in `message_media`.
- On open/download, if expired or near expiry, refresh URL through API once before failing.
- Refresh must populate `view_url` and `download_url` correctly ← requires P3.
- Retry policy: single silent refresh retry on 401/403, then surface error.

### 6) ACK-Driven Cleanup Policy
- Server relay deletion after recipient primary ACK is source of truth.
- Local policy:
  - Keep delivered messages locally for history.
  - Remove only temporary upload artifacts/failed temp files after terminal state.
  - Never delete chat history solely because relay copy was cleared server-side.

### 7) Session Clear / Account Switch Hygiene
On `clearSession()` path ← requires P1:
- Stop WS client (`stopWSEventBridge()`).
- Clear in-memory chat state (`$chatListState.reset()`, `$chatMessagesState.reset()`).
- Clear local chat repositories (SQLite/IndexedDB) for that user scope.
- Remove private media cache for user-scoped folders (`chat-media/{userId}/`).

Prevents cross-account leakage on shared devices.

### 8) Eligibility & Block-State Guardrails
Before local create/send transitions:
- Respect backend eligibility checks (contacts/block rules) and map error types via `util.chatErrors.ts`.
- If backend rejects, rollback optimistic local state to failed status and provide retry or dismiss.
- Eligibility is re-checked on chat screen mount (`[chat_id].tsx` lines 368-380) — results are ephemeral UI state, not persisted to DB (no cache needed).

### 9) Sender Sync ACK (Multi-Device)
`personal.state.chat.ts` (lines 57-95) implements a sender-side ACK for outgoing messages from other devices, gated by `isPrimary`.

**Storage implications:**
- Non-primary device receives messages sent from primary via `new_message` events. These should be stored in local DB with `synced_to_sender_primary = false`.
- Primary device runs `ackIncomingMessages()` which fires sender sync ACK and sets `synced_to_sender_primary = true` in state — this flag must also be persisted to local DB.
- If `isPrimary` changes (device role swap), the local DB must not re-fire ACKs already sent — use the existing `lastAckedMsgId` dedup map, backed by a persistent key in storage.
- Boot ordering (§1) must ensure `isPrimary` is resolved before sender sync logic runs.

### 10) `syncPendingMessages` + Outbox Interaction
`personal.state.chat.ts` (lines 100-131) proactively pulls `/personal/chat/pending` and stores messages via `setMessages`, which triggers `ackIncomingMessages`.

**Storage implications:**
- When local DB exists, `syncPendingMessages` results must use the same idempotent upsert path as WS events (§2) — not a separate code path.
- If outbox queue has local unsent messages for the same chat, pending messages from server must merge cleanly without overwriting outbox entries.
- On app resume (§11), `syncPendingMessages` should run again to catch messages missed during background.

### 11) App Foreground/Background Reconciliation — NEW
**Current gap:** No `AppState` listener exists in any chat file. WS auto-reconnect handles connection recovery, but there is **no lightweight re-fetch or delta sync** on app resume.

**Required behavior:**
- Add `AppState` change listener in `app/personal/_layout.tsx`.
- On `active` (foreground return):
  1. Re-validate WS connection (trigger reconnect if stale).
  2. Run `syncPendingMessages()` to pull messages missed during background.
  3. Flush outbox queue (retry any queued sends).
  4. Optionally refresh chat list if app was backgrounded > N minutes.
- On `background`:
  1. Record timestamp for staleness check on resume.
  2. Persist any in-flight state to local DB (ensure no data loss).

### 12) Notification Deep-Link to Chat — NEW
**Current gap:** `registerFcmOrApn.ts` (line 206) calls `router.push(data.url)`, but `[chat_id].tsx` (lines 35-37) redirects to `/personal/home` if `isChatOpen` is `false`. Cold-start notification navigation to a specific chat **always fails**.

**Required fix:**
- Notification handler must set `isChatOpen = true` **before** navigating to the chat screen.
- Or: refactor `[chat_id].tsx` guard to accept a `fromNotification` param that bypasses the `isChatOpen` check and instead loads chat data directly.
- With local DB: notification-opened chat can load messages from local storage immediately while fetching updates from server.

---

## Outbox Queue Design

Since no outbox infrastructure exists, this is a from-scratch addition:

### Schema
```
outbox_queue:
  - client_generated_id (PK, UUID)
  - chat_id
  - recipient_id
  - content
  - message_type (text | file)
  - file_local_uri (nullable)
  - status (queued | sending | failed | sent)
  - retry_count
  - created_at
  - last_attempt_at
```

### Behavior
1. On send (offline or online): insert into `outbox_queue` with `status = queued`.
2. On network availability: process queue FIFO, set `status = sending`.
3. On API success: set `status = sent`, reconcile with real `message_id`, remove from queue.
4. On API failure: set `status = failed`, increment `retry_count`, exponential backoff (max 3 retries).
5. After max retries: leave as `failed`, surface to user for manual retry or discard.
6. On app resume (§11): flush queue automatically.
7. File messages: `file_local_uri` persists the picked file path; upload resumes from this reference.

---

## Implementation Sequence

### Phase 0: Pre-Migration Fixes
0a. Fix `clearSession()` to reset chat state + stop WS (P1).
0b. Add `client_generated_id` to frontend model, backend model, SQL schema, and WS broadcast (P2).
0c. Fix `resolveMediaUrls` field alignment (P3).
0d. Fix notification deep-link `isChatOpen` guard (§12).

### Phase 1: Storage Adapter
1a. Define `ChatRepository` interface (platform-agnostic contract).
1b. Implement native SQLite repository (tables, migrations, CRUD).
1c. Implement web encrypted IndexedDB repository (same contract).
1d. Add deterministic startup bootstrap (§1 boot ordering).

### Phase 2: State Integration
2a. Wire chat list state actions to read/write through repository.
2b. Wire message state actions to read/write through repository.
2c. Ensure WS event bridge and `syncPendingMessages` use same idempotent upsert path (§2, §10).
2d. Wire sender sync ACK persistence (§9).

### Phase 3: Outbox Queue
3a. Implement outbox queue table + manager.
3b. Refactor send flow to queue-first with `client_generated_id` reconciliation (§3).
3c. Add queue flush on network restore and app resume.

### Phase 4: Media Storage
4a. Implement `message_media` table with cache state tracking.
4b. Integrate with `expo-file-system` for private blob storage.
4c. Add URL expiry tracking and silent refresh (§5, P3).

### Phase 5: Lifecycle Hooks
5a. Add `AppState` foreground/background listener (§11).
5b. Wire session-clear full wipe (§7, P1).
5c. Add notification deep-link fix (§12).

### Phase 6: Observability
6a. Add structured logging for storage operations (timing, errors).
6b. Add counters: queue depth, reconciliation hits/misses, URL refresh failures.
6c. Add dev-mode storage inspector (dump tables/counts).

---

## Validation Matrix
- Cold start (native/web) with existing chat history — local DB loads instantly, server delta merges.
- WS event storm with reconnect and duplicate delivery — no duplicate rows, idempotent upsert.
- Send text + media offline → queue persists → online flush succeeds → reconciliation clean.
- Read/unsend/delete-for-me consistency across two devices (primary + non-primary).
- Token-expired media open/download → auto-refresh → correct `view_url`/`download_url` fields.
- Logout/login as different user on same device — **zero data bleed** (P1 verified).
- Block/eligibility change while chat screen open — rollback optimistic state.
- Notification cold-start deep-link → lands on correct chat screen (§12 verified).
- App background 30 min → foreground → missed messages appear, unread counts correct (§11 verified).
- `isPrimary` flip mid-session → sender sync ACKs adjust without duplicate fires (§9 verified).

---

## Doc-Verified Constraints
- Expo SQLite API and hooks are valid for native integration; web path remains disabled for this plan.
- Expo FileSystem class-based API (`File`, `Directory`, `Paths`) supports app-private persistent storage under `Paths.document`.
- Build-time SQLCipher setup is required before release migration to avoid incompatible-at-rest formats.

## Decisions
- `client_generated_id` requires a backend migration (new column + WS broadcast change) — must coordinate with backend deploy.
- Outbox queue is frontend-only; backend has no knowledge of queue state.
- Notification deep-link fix is independent of storage work but required for correct UX with local DB.
- Observability is deferred to Phase 6 but structured logging hooks should be added during Phase 1-2.

## Non-Goals
- No backend schema redesign beyond `client_generated_id` column addition.
- No public-download UX redesign.
- No multi-tenant cross-user cache sharing.
- No chat deletion/leave feature (does not exist in backend).
- No typing indicators or presence system.
- No chat search functionality.
- No eligibility result caching in local DB (ephemeral UI state only).