# UI Design System Architecture

**Library:** `react-native-unistyles`
**Core Components:** `ThemedText`, `ThemedView`, `ThemedViewWithSidebar`, `IconSymbol`

## Philosophy: Semantic Theming
We avoid hardcoded colors and fonts. Components read theme tokens from Unistyles and expose semantic variants that map to typography and color rules.

## 1) `ThemedText`
**File:** `components/ui/common/ThemedText.tsx`

`ThemedText` wraps `Text` and applies font + color variants. It also supports an explicit `color` override (highest priority) and optional `lightColor`/`darkColor`.

**Supported variants (current):**
`default`, `title`, `defaultSemiBold`, `subtitle`, `link`, `semibold`, `small`, `smallBold`, `titleSmall`, `logo`, `defaultGantari`, `gantariWithoutColorAndSize`, `astaSansWithoutColorAndSize`.

**Usage:**
```tsx
<ThemedText type="subtitle">Hello World</ThemedText>
<ThemedText type="small" color="#ff0066">Inline override</ThemedText>
```

## 2) `ThemedView`
**File:** `components/ui/common/ThemedView.tsx`

`ThemedView` applies `theme.colors.background` to the container by default. Use it for screens and layout wrappers to keep dark/light mode consistent.

## 3) `ThemedViewWithSidebar`
**File:** `components/ui/common/ThemedViewWithSidebar.tsx`

A layout helper for web/tablet layouts with a responsive sidebar. It exposes:
- `ThemedViewWithSidebar.Sidebar`
- `ThemedViewWithSidebar.Main`

On smaller breakpoints, the sidebar is hidden and the main view becomes full width.

## 4) Fonts
- **Primary UI font**: AstaSans (regular + semibold)
- **Brand/heading font**: Gantari (regular + semibold + extra-light)

## 5) Unistyles Configuration
Theme tokens are defined in `src/constants/theme.ts` and are used by all Themed components. Avoid hardcoded colors in UI code unless a one-off override is explicitly needed.
