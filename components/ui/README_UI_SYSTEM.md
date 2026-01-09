# UI Design System Architecture

**Library:** `react-native-unistyles`
**Components:** `ThemedText`, `ThemedView`, `IconSymbol`

## Philosophy: "Semantic Theming"
We do not use hardcoded colors or fonts. We use **Semantic Tokens** provided by `unistyles`.

### 1. `ThemedText`
This is the core typography component. Never use `<Text>` directly.

*   **Semantic Types**:
    *   `default`: Body text (AstaSans).
    *   `subtitle`: Headers (Gantari).
    *   `logo`: Special styling for app branding.
    *   `link`: Blue underlined text.
*   **Platform Specifics**:
    *   The component automatically handles `Platform.select` to choose the correct Font Family file names for iOS vs Android (e.g., `Gantari400` vs `Gantari-Regular`).
*   **Color Resolution**: `color` prop > Theme Color (Dark/Light) > Default.

### 2. `ThemedView`
*   **Role**: Automatic Background Color management.
*   **Usage**: Wrapper for screens. Automatically applies `theme.colors.background` so you don't have to handle Dark Mode manually.

### 3. Fonts
*   **Primary**: `AstaSans` (Body / UI).
*   **Secondary**: `Gantari` (Headings / Branding).

## How to use
```tsx
// ✅ Correct
<ThemedText type="subtitle">Hello World</ThemedText>

// ❌ Avoid
<Text style={{ fontFamily: 'Gantari', color: 'black' }}>Hello World</Text>
```

## Unistyles Configuration
*   We use `react-native-unistyles` which is a C++ based styling engine (Zero runtime overhead).
*   Themes are defined in `theme/` and synced with the device preferences (or user override).
