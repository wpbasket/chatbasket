# 💬 ChatBasket

🌐 **Website**: [chatbasket.me](https://chatbasket.me)

A modern, cross-platform social messaging application built with **React Native** and **Expo SDK 54**. ChatBasket offers both personal messaging and public social feed experiences with a sleek, themeable UI.

![React Native](https://img.shields.io/badge/React_Native-0.81.5-61DAFB?logo=react&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK_54-000020?logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Web-lightgrey)

---

## ✨ Features

### 🔐 Authentication
- Secure OTP-based authentication flow
- Persistent login state with secure storage
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

## 📁 Project Structure

```
chatbasket/
├── app/                    # Expo Router screens
│   ├── (auth)/            # Authentication screens
│   ├── personal/          # Personal mode (home, contacts, profile)
│   └── public/            # Public mode (home, explore, profile)
├── components/            # Reusable UI components
│   ├── header/            # Header components
│   ├── modals/            # Modal dialogs
│   ├── sidebar/           # Sidebar navigation
│   └── ui/                # Common UI elements
├── lib/                   # Core libraries
│   ├── constantLib/       # Shared constants
│   ├── personalLib/       # Personal mode utilities
│   ├── publicLib/         # Public mode utilities
│   └── storage/           # Storage adapters
├── state/                 # Legend State stores
│   ├── auth/              # Authentication state
│   ├── personalState/     # Personal mode state
│   ├── publicState/       # Public mode state
│   └── settings/          # App settings
├── utils/                 # Utility functions
├── assets/                # Images and fonts
└── constants/             # App-wide constants
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (macOS) or Android Emulator

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chatbasket
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory with your configuration:
   ```env
   # Add your environment variables here
   ```

4. **Start the development server**
   ```bash
   npm start
   ```

### Running the App

```bash
# Start Expo development server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Run on Web
npm run web
```

---

## 📦 Building for Production

This project uses **EAS Build** for creating production builds.

```bash
# Install EAS CLI
npm install -g eas-cli

# Build for development (APK)
eas build --profile development --platform android

# Build for production
eas build --profile production --platform android

# Build for preview (internal distribution)
eas build --profile preview --platform android
```

---

## 🧪 Linting

```bash
npm run lint
```

---

## 📄 Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start Expo development server |
| `npm run android` | Run on Android device/emulator |
| `npm run ios` | Run on iOS simulator |
| `npm run web` | Run in web browser |
| `npm run lint` | Run ESLint |
| `npm run reset-project` | Reset project to initial state |

---

## 🔧 Configuration

### App Configuration (`app.json`)

- **Bundle ID**: `com.tasktoclear.chatbasket`
- **Version**: 1.0.0
- **Orientation**: Portrait
- **New Architecture**: Enabled
- **React Compiler**: Enabled

### Build Profiles (`eas.json`)

- **development**: Development client with APK build
- **preview**: Internal distribution
- **production**: Production build with auto-increment versioning

---

## 📱 Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Android | ✅ Supported | Edge-to-edge enabled |
| iOS | ✅ Supported | Tablet support included |
| Web | ✅ Supported | Single-page output |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is private and proprietary.

---

## 👤 Author

**TaskToClear**

---

<p align="center">
  Made with ❤️ using React Native & Expo
</p>
