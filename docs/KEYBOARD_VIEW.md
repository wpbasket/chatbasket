# 📱 Chat Screen Core Architecture (Zero-Render Edition)

This document explains how ChatBasket keeps the chat screen responsive during keyboard animations and high-frequency updates.

## 1) Design Philosophy
- **Keyboard movement:** Avoids full component rerenders.
- **Typing & list updates:** Only affected rows update.
- **Routing changes:** Heavy chat containers are shielded from router prop churn.

We decouple **interactivity** from **data rendering** by using observables and memoization.

## 2) Render Firewall (ChatContentContainer)
`ChatContentContainer` is wrapped with `React.memo` and uses strict prop comparisons (IDs only) to avoid rerenders from unstable navigation objects.

## 3) Keyboard Sync (Current Implementation)
The active path uses `KeyboardSync` + `$uiState.keyboardHeight` rather than the older `useStableIme` hook.

### 3.1 Global Sync (`components/tools/KeyboardSync.tsx`)
`KeyboardSync` is mounted in `app/_layout.tsx` and synchronizes IME height into `state/ui`.

Key behaviors:
- Tracks keyboard visibility via `keyboardDidShow` / `keyboardDidHide`.
- Stores a stable IME height to avoid Android flicker.
- Writes a stable value into `$uiState.keyboardHeight`.

### 3.2 UI Binding in Chat
The chat screen reads `$uiState.keyboardHeight` directly for transforms, avoiding local state updates:

```typescript
style={{ transform: [{ translateY: -$uiState.keyboardHeight.get() - 4 }] }}
```

## 4) Legacy IME Stabilizer (`useStableIme`)
The hook in `hooks/personalHooks/hooks.stableIme.ts` still exists and provides a stable IME height, but the main production path uses `KeyboardSync` instead.

## 5) ID-Driven Virtualization
Lists pass IDs rather than full objects. Each list item observes its own data:

```typescript
<FlatList data={messageIds} />
```

Only the affected row updates when a message changes.

## ✅ Performance Summary
| Interaction | Screen Re-renders | List Re-renders |
| :--- | :---: | :---: |
| Typing | ~0 | O(1) |
| Keyboard Open | ~0 | 0 |
| Scrolling | ~0 | 0 |
| New Message | ~0 | O(1) |

This is the default architecture for high-frequency chat interactions.
