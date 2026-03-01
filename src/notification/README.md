# Notification Module

This directory contains logic related to push notifications and permission handling.

## Permission Management

We use a centralized hook to manage notification permissions across the app.

### `useNotificationPermission`

**Location**: `hooks/commonHooks/hooks.notificationPermission.ts`

This hook ensures the app's internal state (`setting$.notifications`) is always synchronized with the OS-level notification permissions.

**How it works:**
1.  **On Mount**: Immediately checks `Notifications.getPermissionsAsync()` when the component mounts.
2.  **On App Resume**: Sets up an `AppState` listener. Whenever the app returns to the foreground (e.g., user returns from OS Settings), it re-checks permissions.

**Usage:**
This hook is used in the Settings screens to display the correct "Enabled/Disabled" status live.

```typescript
// Example usage in a component
import { useNotificationPermission } from '@/hooks/commonHooks/hooks.notificationPermission';

export default function Settings() {
  useNotificationPermission(); 
  // ... rest of component
}
```

## State Management

The permission status is stored in the Legend-State observable:
- `setting$.notifications`: Values are `'enabled'` or `'disabled'`.
