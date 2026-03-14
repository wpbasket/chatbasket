# Chat System Architecture (Advanced Relay Edition)

## Overview
Chat is designed as a **Primary-Device-Centric Relay Architecture** with a **4-state status model** (3 icons visible). The backend is an ephemeral relay while local device storage is authoritative.

## 1) Advanced Architectural Patterns

### 1.1 Primary-Device-Centric Relay Architecture
The backend serves as an **ephemeral bridge**, not a permanent message vault. The **Primary Device** (designated during login) is the authoritative source for the full encrypted chat history and metadata anchoring.
- **ACK Blocking Policy**: On the Primary device, delivery acknowledgments are blocked if media (images/video/files) fails to download and persist locally. This ensures the Primary vault always contains the authoritative binary before the server purges the relay record.
- **Authoritative Sorting**: The Primary device maintains the canonical sequence of messages for its owner's account.

### 1.2 Double-Primary Acknowledgment (Relay Purging)
To ensure privacy and hygiene, the backend implements the **Double-Primary Purge Protocol**. A message row and its associated files are permanently deleted from the server relay ONLY when:
1. `synced_to_sender_primary = TRUE` (Sender's Primary has confirmed receipt).
2. `delivered_to_recipient_primary = TRUE` (Recipient's Primary has confirmed receipt).

### 1.3 P2P WebRTC Synchronization [Upcoming]
Secondary devices (Web/Native) synchronize directly with the Primary device using WebRTC data channels to reconstruct history already purged from the relay.
- **Signaling**: The backend only facilitates the handshake (Offer/Answer/ICE); data transfer is strictly peer-to-peer.
- **No Fallback**: If P2P connection fails (NAT/Firewall issues), history retrieval is blocked to prevent backend bandwidth overhead.
- **Catch-Up**: Missed transient signals (unsends/deletes) are replayed via server-relayed **Sync Actions** during the initial catch-up phase.

### 1.4 Hybrid Status Tracking Model
Since relay messages are ephemeral, long-term status is managed via a Hybrid Model:
- **System 1 (Per-message)**: Flags (`delivered_to_recipient`) exist only while the message stays in the transit bridge.
- **System 2 (Chat-level)**: Authoritative timestamps (`p1_last_delivered_at`, `p1_last_read_at`) survive forever on the `chats` table.
- **UI Logic**: `MessageItemWrapper` compares `message.created_at` against the `last_read_at` bulk timestamp to drive icons after relay purging.

### 1.5 Dual-Transport Strategy
The engine implements a **WebSocket-first** communication layer (`ChatTransport.ts`) for all real-time actions. It automatically **falls back to REST** (via `PersonalChatApi`) if:
- The WebSocket connection is currently disconnected.
- A transport error occurs (e.g., a request timeout or connection drop during transmit).

This ensures that critical actions like sending messages or ACKing receipt are never blocked by transient network instability.

## 2) Status Icons (4-Icon System)

| Icon | Meaning | Implementation Detail |
| :--- | :--- | :--- |
| `clock` | **Pending** | Message in local Outbox, waiting for transport. |
| `checkmark` | **Sent** | Acknowledged by the server relay. |
| `checkmark.all` (Grey) | **Delivered** | Acknowledged by at least one recipient device. |
| `checkmark.all` (Primary) | **Read** | Referenced via `other_user_last_read_at` bulk timestamp. |

## 3) Synchronization Flow
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

## 4) Relay & Read Status
- **Recipient delivery**: Delivery ACKs update server state in bulk via timestamps.
- **Sender update**: A `delivery_ack` websocket event with a single ID drives local bulk updates (`markMessagesDeliveredUpTo`).
- **Read calculation**: The server stores `last_read_at` per chat; the client computes read state locally by comparing timestamps.

```typescript
if (message.created_at <= chat.other_user_last_read_at) {
  status = 'read';
}
```

## 5) Optimistic UI
Legend-State drives immediate feedback:
1. Add optimistic message to local state.
2. Send API request.
3. Replace with server ID on success; set status to `sent`.
4. Mark failed on error with retry affordance.

## 6) Large File Support
Chat uploads allow long-running transfers; the API client is configured to tolerate large payloads (up to ~10 minutes) without timing out.

## 7) Revocation & Sync (Unsend / Delete for Me)
### Online
- Backend broadcasts `unsend` or `delete_for_me` events over websockets.
- `ws.event.bridge.ts` applies local tombstones immediately.

### Offline
- Backend records durable sync actions.
- On boot, `$syncEngine.catchUp()` pulls `/personal/chat/sync-actions` and replays missed revocations.

## 8) Core Components
- **`[chat_id].tsx`**: Controller, fetch + render.
- **`MessageBubble.tsx`**: Renders message + status icon.
- **`ChatListItem.tsx`**: Inbox row with preview + read state.
