# 💬 ChatBasket

🌐 **Website**: [chatbasket.live](https://chatbasket.live)

A modern, cross-platform social messaging application built with **React Native** and **Expo SDK 55**. ChatBasket offers both personal messaging and public social feed experiences with a sleek, themeable UI.

![React Native](https://img.shields.io/badge/React_Native-0.83.2-61DAFB?logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK_55-000020?logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Web-lightgrey)

---

## 📐 Engineering & Architecture

- **Advanced Chat Engine**: Implements a **Primary-Device-Centric Relay Architecture** with **Double-Primary Acknowledgment**, **Dual-Transport (WebSocket/REST) fallback**, and recursive retry logic.
- **Cross-Device Sync**: **P2P Synchronization [Upcoming]** via WebRTC ensures consistent read/delivery state across all devices without central storage reliance.
- **Local-First Persistence**: Messages are persisted to local storage before acknowledgment or UI updates, ensuring zero data loss.
- **Hybrid Status Tracking**: Combines per-message metadata with chat-level bulk timestamps for efficient status visualization.

### Detailed System Documentation
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

## 🛠 Tech Stack

- **Framework**: [Expo SDK 55.0.4](https://expo.dev/) (React Native 0.83.2)
- **State Management**: [Legend-State](https://legendapp.com/open-source/state/) (Signal-based, reactive)
- **Storage**: SQLite (Expo SQLite) for local-first persistence
- **Communication**: WebSocket (Primary) with WebRTC (P2P Sync)

## 🏗 Engineering Overview

The Chat Engine is built on four core architectural pillars grounded in Backend Business Rules:

### 1. Primary-Device-Centric Relay
The backend acts as an ephemeral bridge, not a permanent vault. The **Primary Device** is the authoritative source of truth, storing the full encrypted chat history and serving P2P sync requests to secondary devices.

### 2. Double-Primary Acknowledgment (Relay Purging)
The backend relay is governed by strict purging rules. A message record is deleted from the server ONLY after **both** the sender's Primary device and the recipient's Primary device have confirmed receipt and persistence.

### 3. P2P WebRTC Synchronization [Upcoming]
Secondary devices (Web/Native) will synchronize directly with the user's Primary device via WebRTC data channels. This enables full history reconstruction without the backend ever storing a permanent copy of the messages.

For a deeper dive, see [Chat System Details](file:///w:/codewp/cb/chatbasket/src/app/personal/home/chat/README_CHAT.md).

## 🔄 App Lifecycle Overview

For new developers, here is how the app boots up:

1.  **Splash Screen**: The app launches and holds the Splash Screen (in `_layout.tsx`).
2.  **Auth Hydration**:
    *   Reads Encrypted Session Tokens from MMKV.
    *   If valid, sets `authState.isLoggedIn = true`.
3.  **Deep Link Check (Critical)**:
    *   **Native**: `+native-intent.tsx` intercepts initial deep links via `redirectSystemPath()`.
    *   **Web**: `state.appMode.ts` checks `window.location.pathname` during initialization.
    *   If a deep link exists (e.g., `chatbasket://public/profile`), it sets `appMode = 'public'` **synchronously**.
4.  **Route Guard Evaluation**:
    *   `Stack.Protected` runs.
    *   If `isLoggedIn` is false -> Redirect to `/login`.
    *   If `appMode` matches the Route -> Render Screen.
5.  **Render**: The Splash Screen fades, and the user interacts with the app.

---

## ✨ Features

### 🔐 Authentication
- Secure OTP-based authentication flow (no refresh tokens; sessions carry expiry only)
- Persistent login state with secure storage on native; web persists expiry while session token stays in HttpOnly cookie
- Primary device metadata (`isPrimary`, `primaryDeviceName`) returned on login for UI prompts
- Protected routes for authenticated users

### 💭 Dual Mode Experience
- **Personal Mode**: Private messaging and contacts management
- **Public Mode**: Social feed with posts, explore section, and public profiles

### 🎨 Modern UI/UX
- Automatic dark/light theme support
- Custom typography with Gantari and AstaSans fonts
- Smooth animations powered by Reanimated and Legend Motion
- Haptic feedback for enhanced interactions

### 📱 Cross-Platform
- Native iOS and Android support
- Web support with responsive design
- Edge-to-edge display on Android

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | React Native 0.83.2 + Expo SDK 55.0.4 |
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
