# Chat System Architecture

## Overview
The chat system in ChatBasket is designed around an **Ephemeral Relay** architecture with a **3-Icon Status System**.

## 1. The 3-Icon Status System
We use a simplified visual language to represent message states. The explicit "Delivered" state (double tick) is **hidden** from the UI to reduce visual clutter.

| Icon | Color | Meaning | Implementation Logic |
| :--- | :--- | :--- | :--- |
| **Clock** 🕒 | Gray | **Pending** | Optimistically added to UI. Waiting for API response. |
| **Checkmark** ✅ | Yellow | **Sent** | Confirmed by server. Also covers "Delivered" state. |
| **Checkmark** ✅ | Green | **Read** | Recipient has opened the chat. |

### Why no "Delivered" icon?
We track delivery internally for auto-deletion (server cleanup), but the user only sees "Sent" (Yellow). The icon only turns Green when the recipient actually reads the message.

## 2. Ephemeral Relay & Read Status
The backend acts as a temporary relay, not a permanent history store.

-   **Sending**: Messages are stored in Postgres temporarily.
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

## 3. Optimistic UI
We use `@legendapp/state` to drive immediate UI updates.
1.  **User sends**: Optimistic message added to Legend State list immediately.
2.  **Network**: API request fires in background.
3.  **Success**: Optimistic message replaced with real ID; status updates to 'Sent'.
4.  **Error**: Message marked as failed; retry option shown.

## 4. Components
-   **`[chat_id].tsx`**: Main controller. Handles data fetching and status calculation.
-   **`MessageBubble.tsx`**: Dumb component. Renders text/media and the status icon.
-   **`ChatListItem.tsx`**: In-box row. Shows last message preview and read status.
