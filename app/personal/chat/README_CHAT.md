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

### 2.1 Outside Chat (Inbox / Home Screen)
- **Process**: `syncPendingMessages` runs in the background or upon Home Screen load.
- **Action**: Fetches undelivered messages and calls `acknowledgeDelivery(acknowledged_by: 'recipient')`.
- **Result**: Sender sees a **Yellow Tick** (Delivered). Recipient's **Unread Count** remains unchanged.

### 2.2 Inside Chat (Active [chat_id])
- **Process**: `useFocusEffect` triggers `loadMessages` and a delayed `markChatRead`.
- **Action**: Hits `/personal/chat/mark-read`.
- **Result**: Sender sees a **Green Tick** (Read). Recipient's **Unread Count** resets to 0. 
- **Efficiency**: The backend's `mark-read` implicitly performs a bulk delivery ACK for any missing message confirmations.

### 2.3 De-duplication Logic
To prevent redundant API calls when background sync and the chat screen overlap, we use `lastAckedMsgId`. This ensures that even if both processes spot a new message at the same time, only one signal is sent to the server.

## 3. Relay & Read Status
The backend acts as a relay for message delivery and status updates.

-   **Sending**: Messages are sent to the backend and assigned a server-side delivery status.
-   **Delivery**: When the recipient's app fetches the message, it auto-acks (`acknowledgeDelivery`). The backend marks it as delivered.
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
