# Chat System Architecture

## Overview
Chat is designed as a **relay-based** system with a **3-icon status model**. The backend is an ephemeral relay while local device storage is authoritative.

## 1) Status Icons (3-Icon System)
Delivered is intentionally hidden to reduce UI clutter.

| Icon | Color | Meaning | Implementation |
| :--- | :--- | :--- | :--- |
| 🕒 | Gray | **Pending** | Optimistic message pending server confirmation. |
| ✅ | Yellow | **Sent** | Confirmed by server; also represents delivered. |
| ✅ | Green | **Read** | Recipient opened the chat. |

**Why no delivered icon?** Delivery is tracked internally for cleanup and sync; the UI jumps directly from Pending → Sent (yellow) → Read (green).

## 2) Synchronization Flow
We separate **delivery ACKs** (outside chat) from **read ACKs** (inside chat).

### 2.1 Outside Chat (Inbox / Home / App Startup)
- **Process**: Background sync or `ws.event.bridge.ts` observes incoming messages.
- **Action**: Send a *single* delivery ACK for the latest message (bulk update server-side).
- **Result**: Sender gets a yellow tick for all older pending messages; recipient unread count is unchanged.

### 2.2 Inside Chat (Active Chat Screen)
- **Process**: `useFocusEffect` loads messages and triggers `markChatRead` after focus.
- **Action**: `POST /personal/chat/mark-read` updates `last_read_at` on the backend.
- **Result**: Sender sees green ticks; recipient unread count resets to 0.

### 2.3 De-duplication
`lastAckedMsgId` prevents duplicate ACKs when background sync and chat focus overlap.

## 3) Relay & Read Status
- **Recipient delivery**: Delivery ACKs update server state in bulk via timestamps.
- **Sender update**: A `delivery_ack` websocket event with a single ID drives local bulk updates (`markMessagesDeliveredUpTo`).
- **Read calculation**: The server stores `last_read_at` per chat; the client computes read state locally by comparing timestamps.

```typescript
if (message.created_at <= chat.other_user_last_read_at) {
  status = 'read';
}
```

## 4) Optimistic UI
Legend-State drives immediate feedback:
1. Add optimistic message to local state.
2. Send API request.
3. Replace with server ID on success; set status to `sent`.
4. Mark failed on error with retry affordance.

## 5) Large File Support
Chat uploads allow long-running transfers; the API client is configured to tolerate large payloads (up to ~10 minutes) without timing out.

## 6) Revocation & Sync (Unsend / Delete for Me)
### Online
- Backend broadcasts `unsend` or `delete_for_me` events over websockets.
- `ws.event.bridge.ts` applies local tombstones immediately.

### Offline
- Backend records durable sync actions.
- On boot, `$syncEngine.catchUp()` pulls `/personal/chat/sync-actions` and replays missed revocations.

## 7) Core Components
- **`[chat_id].tsx`**: Controller, fetch + render.
- **`MessageBubble.tsx`**: Renders message + status icon.
- **`ChatListItem.tsx`**: Inbox row with preview + read state.
