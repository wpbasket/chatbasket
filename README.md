# 💬 ChatBasket

🌐 **Website**: [chatbasket.live](https://chatbasket.live)

A modern, cross-platform social messaging application built with **React Native** and **Expo SDK 54**. ChatBasket offers both personal messaging and public social feed experiences with a sleek, themeable UI.

![React Native](https://img.shields.io/badge/React_Native-0.81.5-61DAFB?logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK_54-000020?logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Web-lightgrey)

---

## 📐 Engineering & Architecture

We have documented the complex engineering patterns used in this app in detailed READMEs located in their respective directories.

### Core Systems
1.  **[Root Architecture & Routing](./app/README_ROOT_ARCHITECTURE.md)**
    *   *How `_layout.tsx` orchestrates initialization, Deep Links, and Route Guards.*
2.  **[Authentication System](./state/auth/README_AUTH.md)**
    *   *Session management, Token Encryption, and Hydration loop.*
3.  **[Deep Linking & Race Conditions](./state/appMode/README_DEEP_LINKING.md)**
    *   *How we solved the "Native Deep Link" race condition using synchronous Mode updates.*

### Infrastructure
4.  **[Notification System (Two-Token)](./notification/README_NOTIFICATIONS.md)**
    *   *Android FCM implementation, Share Intent conflicts, and Background Listeners.*
5.  **[Storage Strategy (Hybrid Encryption)](./lib/storage/README_STORAGE.md)**
    *   *Why we mix MMKV (Speed) with SecureStore (Key Management).*
6.  **[API Layer](./lib/README_API_ARCHITECTURE.md)**
    *   *Typed Singleton patterns for decoupling UI from Network logic.*

### UI & State patterns
7.  **[Global Modal System](./components/modals/README_MODAL_ARCHITECTURE.md)**
    *   *The "Imperative Promise" pattern for clean modal usage.*
8.  **[UI Design System](./components/ui/README_UI_SYSTEM.md)**
    *   *Semantic Theming using `react-native-unistyles`.*
9.  **[State Management patterns](./state/README_STATE_PATTERNS.md)**
    *   *Legend-State "Observable Store" philosophy.*
10. **[Zero-Render Architecture](./docs/KEYBOARD_VIEW.md)**
    *   *How we achieved O(1) rendering for Chat & Keyboard interactions.*

---

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
| **Framework** | React Native 0.81.5 + Expo SDK 54 |
| **Navigation** | Expo Router with typed routes |
| **State Management** | Legend State (reactive state) |
| **Styling** | React Native Unistyles |
| **Animations** | React Native Reanimated + Legend Motion |
| **Storage** | MMKV + Async Storage + Secure Store |
| **Notifications** | Expo Notifications |
| **Networking** | NetInfo for connectivity tracking |

---



---

##  License

This project is private and proprietary.
