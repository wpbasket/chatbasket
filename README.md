# 💬 ChatBasket

🌐 **Website**: [chatbasket.live](https://chatbasket.live)

A modern, cross-platform social messaging application built with **React Native** and **Expo SDK 56**. ChatBasket is designed around a **dual-mode architecture** — two distinct experiences living inside one app:

| Mode | Status | Description |
|------|--------|-------------|
| 🔒 **Personal Mode** | ✅ Active | Private messaging, contacts, and cross-device sync |
| 🌍 **Public Mode** | 🚧 Upcoming | Social feed with posts, explore section, and public profiles |

> The sections below detail the **Personal Mode** implementation — the messaging engine that is currently live.

![React Native](https://img.shields.io/badge/React_Native-61DAFB?logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Web-lightgrey)

---

## 🔒 Personal Mode — Engineering & Architecture

- **Advanced Chat Engine**: Implements a **Primary-Device-Centric Relay Architecture** with **Double-Primary(Sender and Recipient Primary devices) Acknowledgment**, **Dual-Transport (WebSocket/REST) fallback**.
- **Cross-Device Sync**: **P2P Synchronization [Upcoming]** via WebRTC ensures consistent read/delivery state across all devices(sessions).
- **Local-First Persistence**: Messages are persisted to local storage(SQLite in Native, IndexedDB in Web) before acknowledgment or UI updates, ensuring zero data loss.
- **End-to-End Encryption (E2EE)**: Messages are secured using XSalsa20-Poly1305 (secretbox) and X25519 ECDH key exchange. The backend acts as a blind relay for chat payloads.
- **Hybrid Status Tracking**: Combines per-message metadata with chat-level bulk timestamps for efficient status visualization.

### Chat Engine Pillars

The Chat Engine is built on core architectural pillars grounded in Backend Business Rules:

#### 1. Primary-Device-Centric Relay
The backend acts as an ephemeral bridge, not a permanent vault. The **Primary Device** is the authoritative source of truth, storing the full chat history and serving P2P sync requests to secondary devices. ACK blocking ensures media is fully persisted locally before the relay purges.

#### 2. Double-Primary Acknowledgment (Relay Purging)
A message record is deleted from the server ONLY after **both** the sender's Primary and the recipient's Primary have confirmed receipt and local persistence.

#### 3. Dual-Transport Strategy
WebSocket-first communication with automatic **REST fallback** — if the socket is disconnected or a transport error occurs, critical actions (send, ACK) seamlessly switch to REST so messaging is never blocked.

#### 4. Outbox Queue & Offline Messaging
Messages are queued in a local Outbox when offline. The queue drains automatically on reconnect, ensuring zero message loss regardless of network state.

#### 5. Optimistic UI
Messages appear instantly with pending status; replaced with server ID on success, retry affordance on failure.

#### 6. 4-State Status Model
Pending → Sent → Delivered → Read — driven by relay ACKs and bulk read timestamps.

#### 7. Hybrid Status Tracking
Per-message flags exist only while the message is in transit; long-term status lives as chat-level bulk timestamps that survive relay purging.

#### 8. Delivery & Read ACK Separation
Delivery acknowledgments (triggered passively from inbox/home) and read receipts (triggered on active chat focus) are handled independently with built-in de-duplication to prevent redundant network calls.

#### 9. Revocation & Offline Sync (Unsend / Delete)
When a user unsends or deletes a message:
- **If the other user is online**: The backend instantly pushes the revocation event via WebSocket. The recipient's app removes the message from the UI immediately.
- **If the other user is offline**: The backend stores the action as a durable sync record. When the offline user opens the app, a catch-up sync fetches all missed actions and replays them — so unsent messages disappear even if the user was offline when the action happened.

#### 10. P2P WebRTC Synchronization [Upcoming]
Secondary devices will sync directly with the Primary via WebRTC data channels — no fallback to backend bandwidth if P2P fails.

#### 11. End-to-End Encrypted Messages (E2EE)

All payloads are sealed client-side using keys derived from an X25519 ECDH exchange. The server routes opaque ciphertexts, ensuring true zero-knowledge messaging.

#### 12. Secure Contact Management

Contact relationships and metadata are symmetrically encrypted at rest by the backend to prevent statistical pattern leakage and database exposure.

For a deeper dive, see [Chat System Details](./src/app/personal/home/chat/README_CHAT.md).

---

## 📚 Detailed System Documentation

1.  **[Root Architecture & Routing](./src/app/README_ROOT_ARCHITECTURE.md)**
    *   *How `_layout.tsx` orchestrates initialization, Deep Links, and Route Guards.*
2.  **[Authentication System](./src/state/auth/README_AUTH.md)**
    *   *Session management, Token Encryption, and Hydration loop.*
3.  **[Deep Linking & Race Conditions](./src/state/appMode/README_DEEP_LINKING.md)**
    *   *How we solved the "Native Deep Link" race condition using synchronous Mode updates.*
4.  **[Notification System (Two-Token)](./src/notification/README_NOTIFICATIONS.md)**
    *   *Android FCM implementation, Share Intent conflicts, and Background Listeners.*
5.  **[Storage Strategy (Optimal Security)](./src/lib/storage/README_STORAGE.md)**
    *   *Hardware-backed AES (Native) and Non-Extractable CryptoKey (Web) strategies.*
6.  **[API Layer](./src/lib/README_API_ARCHITECTURE.md)**
    *   *Typed Singleton patterns for decoupling UI from Network logic.*
7.  **[Global Modal System](./src/components/modals/README_MODAL_ARCHITECTURE.md)**
    *   *The "Imperative Promise" pattern for clean modal usage.*
8.  **[UI Design System](./src/components/ui/README_UI_SYSTEM.md)**
    *   *Semantic Theming using `react-native-unistyles`.*
9.  **[State Management patterns](./src/state/README_STATE_PATTERNS.md)**
    *   *Legend-State "Observable Store" philosophy.*
10. **[Chat System Architecture](./src/app/personal/home/chat/README_CHAT.md)**
    *   *Primary-Device-Centric Relay.*
11. **[Structured Logging](./src/utils/personalUtils/logger/README.md)**
    *   *Development-only filtered logging using `__DEV__` gates.*
12. **Backend Architecture Reference (`chatbasket_backend/docs/`)**

## 🔄 App Lifecycle Overview

For new developers, here is how the app boots up:

1.  **Splash Screen + Font Preloading**: The app launches, holds the splash screen, and preloads all font bundles (including icon fonts) in parallel.
2.  **Storage Initialization & Auth Hydration**:
    *   Initializes secure storage providers.
    *   Restores persisted auth session (tokens, expiry, user metadata).
    *   If logged in, hydrates personal storage — contacts, user profile, device status, and chat data.
    *   Expired sessions are detected and cleaned up automatically.
3.  **Deep Link Resolution**:
    *   **Native cold start**: Deep links are intercepted and the app mode is set before navigation begins.
    *   **Native warm start**: Listens for incoming deep links while the app is already running.
    *   **Web**: Reads the URL path on initialization to determine the target mode.
    *   Mode is updated only when it differs from the current state to avoid redundant re-renders.
4.  **Route Guard Evaluation**:
    *   If not logged in → Redirect to login.
    *   If app mode matches the route → Render screen.
5.  **Notification Setup** (Native only):
    *   Registers notification listeners on mount.
    *   Registers the device push token with the backend for logged-in sessions.
    *   Handles cold-start notification routing (user tapped a notification to open the app).
6.  **Share Intent Handling**: Listens for content shared from other apps (e.g., sharing a link or image into ChatBasket).
7.  **Network Tracking**: Starts global connectivity monitoring to feed offline/online state across the app.
8.  **Render Gate**: The app holds rendering until auth hydration, network status, and personal storage are all ready — preventing route guard flicker and incomplete UI.
9.  **Render**: The Splash Screen fades, and the user interacts with the app.

---

## ✨ Features

### 🔐 Authentication

- **Two Login Methods**:
  - **Standard Login (2FA)**: Email + Password followed by mandatory OTP verification.
  - **QR Code Sync**: Instantly authorize secondary devices by scanning a QR code from an active Primary device.
- **Native**: Session tokens stored in encrypted secure storage; API calls use Bearer token headers
- **Web**: Session token lives in HttpOnly cookies (never exposed to JS); only expiry is persisted client-side
- Session expiry enforced on hydration — expired sessions trigger automatic cleanup
- Protected route guards gated on login state and app mode

### 💬 Real-Time Messaging

- End-to-End Encrypted (E2EE) chat payloads using X25519 and XSalsa20-Poly1305.
- WebSocket-first with seamless REST fallbacks for reliability.
- Offline Outbox queueing with automatic background draining.

### 🛡️ Privacy & Security

- **Device-Local Cryptography**: Private keys are generated and stored exclusively on each of your devices (both primary and secondary), never in the cloud.

### 🔔 Push Notifications

### 📤 Share Intent
Receive shared content (links, images, files) from other apps directly into ChatBasket.

### 🎨 Modern UI/UX
- Automatic dark/light theme support with semantic theming
- Custom typography with Gantari and AstaSans fonts
- Smooth animations powered by Reanimated and Legend Motion
- Haptic feedback for enhanced interactions
- Global modal system using the "Imperative Promise" pattern for clean, decoupled modal usage

### 📱 Cross-Platform
- Native iOS and Android support
- Web support with responsive design

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | React Native + Expo |
| **Navigation** | Expo Router with typed routes |
| **State Management** | Legend State (reactive state) |
| **Styling** | React Native Unistyles |
| **Animations** | React Native Reanimated + Legend Motion |
| **Storage** | MMKV + SecureStore (Native) / WebVault (Web) |
| **Notifications** | Expo Notifications |
| **Networking** | NetInfo for connectivity tracking |

---



---

##  License

This project is private and proprietary.
