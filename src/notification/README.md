# Notification Module

This folder contains push notification setup, permissions syncing, and platform-specific stubs.

## Core Files
- **Native implementation**: `notification/registerFcmOrApn.ts`
- **Web stub**: `notification/registerFcmOrApn.web.ts`
- **Permission hook**: `hooks/commonHooks/hooks.notificationPermission.ts`

## Permission Management (`useNotificationPermission`)
`useNotificationPermission()` keeps `setting$.notifications` aligned with OS-level permissions.

**Behavior:**
1. **On mount**: Calls `Notifications.getPermissionsAsync()` and writes `'enabled' | 'disabled'` to `setting$.notifications`.
2. **On app resume**: Adds an `AppState` listener and re-checks permissions when the app returns to the foreground.

**Usage Example:**
```typescript
import { useNotificationPermission } from '@/hooks/commonHooks/hooks.notificationPermission';

export default function Settings() {
  useNotificationPermission();
  // ... rest of component
}
```

## State Location
`setting$.notifications` lives in `state/settings/state.setting.ts` and is consumed by Settings screens to render permission status.
