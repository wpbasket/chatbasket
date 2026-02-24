# Chat System Architecture

## Overview
The chat system in ChatBasket is designed around a **Relay** architecture with a **3-Icon Status System**.

## 1. The 3-Icon Status System
We use a simplified visual language to represent message states. The explicit "Delivered" state (double tick) is **hidden** from the UI to reduce visual clutter.

| Icon | Color | Meaning | Implementation Logic |
| :--- | :--- | :--- | :--- |
| **Clock** 🕒 | Gray | **Pending** | Optimistically added to UI. Waiting for API response. |
| **Checkmark** ✅ | Yellow | **Sent** | Confirmed by server. Also covers "Delivered" state. |
| **Checkmark** ✅ | Green | **Read** | Recipient has opened the chat. |

### Why no "Delivered" icon?
We track delivery internally for auto-deletion (server cleanup), but the user only sees "Sent" (Yellow). The icon only turns Green when the recipient actually reads the message.

## 2. Synchronization Flow
The system differentiates between "Outside" (Delivery) and "Inside" (Read) logic to ensure accurate unread counts and delivery confirmations.

### 2.1 Outside Chat (Inbox / Home Screen) & App Startup
- **Process**: `syncPendingMessages` runs on boot (bypassing hydration delays), or the `ws.event.bridge.ts` intercepts incoming WebSockets while idling.
- **Action**: Automatically triggers a "Single ACK" call to `acknowledgeDelivery` for the *latest* message ID.
- **Result**: The backend uses the timestamp of this single message to bulk-update `delivered = true` for all older pending messages. Sender sees a **Yellow Tick** (Delivered). Recipient's **Unread Count** remains unchanged.

### 2.2 Inside Chat (Active [chat_id])
- **Process**: `useFocusEffect` triggers `loadMessages` and a delayed `markChatRead`.
- **Action**: Hits `/personal/chat/mark-read`.
- **Result**: Sender sees a **Green Tick** (Read). Recipient's **Unread Count** resets to 0. 
- **Efficiency**: The backend's `mark-read` implicitly performs a bulk delivery ACK for any missing message confirmations in that chat.

### 2.3 De-duplication Logic
To prevent redundant API calls when background sync and the chat screen overlap, we use `lastAckedMsgId`. This ensures that even if both processes spot a new message at the same time, only one signal is sent to the server.

## 3. Relay & Read Status
The backend acts as a relay for message delivery and status updates.

-   **Delivery (Recipient)**: When the recipient's app fetches the message or receives it via WebSocket, it auto-acks (`acknowledgeDelivery`). The backend efficiently bulk-marks it and all older messages as delivered via timestamps.
-   **Delivery Update (Sender)**: The sender receives a `delivery_ack` WebSocket event with a single ID. The local store uses `markMessagesDeliveredUpTo` to instantly paint all older messages with Yellow Ticks.
-   **Read Status**:
    -   **Server**: Does NOT store a per-message "read" flag.
    -   **Metadata**: When a user opens a chat, `markChatRead` updates their `last_read_at` timestamp.
    -   **Client**: The sender's client calculates "Read" status locally:
        ```typescript
        // MessageItemWrapper.tsx
        if (message.created_at <= chat.other_user_last_read_at) {
            status = 'read'; // Green Tick
        }
        ```

## 4. Optimistic UI
We use `@legendapp/state` to drive immediate UI updates.
1.  **User sends**: Optimistic message added to Legend State list immediately.
2.  **Network**: API request fires in background.
3.  **Success**: Optimistic message replaced with real ID; status updates to 'Sent'.
4.  **Error**: Message marked as failed; retry option shown.

### 4.1 Large File Support
The chat system supports files up to **100MB**. The network layer is configured to allow these transfers to take up to **10 minutes**, ensuring that slow connections can still complete large uploads without getting cut off by standard API timeouts.

## 5. Components
-   **`[chat_id].tsx`**: Main controller. Handles data fetching and status calculation.
-   **`MessageBubble.tsx`**: Dumb component. Renders text/media and the status icon.
-   **`ChatListItem.tsx`**: In-box row. Shows last message preview and read status.

## 6. Revocation & Offline Sync (The Sync Engine)
Message Revocation (Unsend) and Local Deletions (Delete for Me) require strict synchronization across devices.

### 6.1 Online Flow (WebSocket Push)
When a user unsends a message, the backend broadcasts a `unsend` (or `delete_for_me`) WebSocket event.
- The `ws.event.bridge.ts` intercepts this instantly.
- It calls `$chatMessagesState.unsendMessages` to mutate the local Legend State array, immediately removing the payload and replacing it with a "Message unsent" tombstone in the UI.

### 6.2 Offline Flow (The SyncEngine Catch-Up)
Because WebSockets are volatile, what happens if a device is offline when a message is unsent?
- The backend always generates a durable `SyncAction` record in Postgres.
- When the device comes back online and the user enters the app, `app/personal/_layout.tsx` triggers `$syncEngine.catchUp()`.
- The `SyncEngine` queries `/personal/chat/sync-actions`, retrieves all missed revocation signals, applies them silently to the local state, and acknowledges them with the backend so they are consumed.
