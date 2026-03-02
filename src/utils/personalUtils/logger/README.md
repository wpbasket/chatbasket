# Structured Logger

A robust, development-only structured logging utility for Expo React Native.

This logger provides fine-grained control over log output by allowing you to filter based on service names, component names, and flow names. It is completely compiled away in production (zero performance overhead) by leveraging the `__DEV__` flag.

## Features

- **Zero Production Overhead:** Fully disables itself automatically in production builds.
- **Strictly Typed:** Services, components, and flow names are strongly typed to prevent typos.
- **Predefined Central Configuration:** A single source of truth (`logger.config.ts`) to easily toggle which domains log and which stay quiet.
- **Runtime Toggling:** A mutable manager (`Logger.config`) allowing on-the-fly toggling (e.g., from an in-app dev menu) without manually changing the file.
- **Pretty Formatting:** Console outputs with emojis (ℹ️, ⚠️, ❌), precise timestamps, and properly spaced metadata.

## Usage

### 1. Basic Import and Logging

Import the exported `Logger` instance from the utility, and supply a string message along with strongly-typed metadata.

```typescript
import { Logger } from '@/utils/personalUtils/logger/logger'; // Adjust path as needed

// Info
Logger.info('App started successfully', { service: 'AppService', flow: 'Initialization' });

// Warning
Logger.warn('Network timeout approaching', { service: 'NetworkService', component: 'ApiClient' }, { retryCount: 2 });

// Error
Logger.error('Failed to fetch user data', { service: 'PersonalService', function: 'fetchData', flow: 'Login' }, { error: 'Connection Refused' });
```

### 2. Manual Configuration (`logger.config.ts`)

To change which logs actually appear in the console, open `logger.config.ts` and modify the boolean values. 

If a log matches **ANY** active filter (service, component, or flow), it will be printed.

```typescript
// Inside logger.config.ts
const INITIAL_CONFIG = {
  defaultEnabled: false, // If true, logs everything unless explicitly set to false below.

  services: {
    AppService: true,    // ALL AppService logs will print
    AuthService: false,  // AuthService logs will be silenced
    // ...
  },
  components: {
    ApiClient: true,     // ALL ApiClient logs will print
    // ...
  },
  flows: {
    Login: true,         // ANY service participating in the 'Login' flow will print
    // ...
  }
};
```

### 3. Adding New Domains

If you need a new domain (e.g. `BillingService`), you do **not** need to update separate TypeScript interfaces. 

Simply add it manually to the `INITIAL_CONFIG.services` map in `logger.config.ts`:
```typescript
services: {
  AppService: true,
  BillingService: true, // <--- Add it here
}
```
TypeScript will automatically infer `BillingService` as a valid `LogService` everywhere else in the app.

### 4. Runtime Toggling

If you want to disable or enable certain logs dynamically from inside the app (for example, tapping a hidden debug button), you can use the built-in configuration manager:

```typescript
import { Logger } from '@/utils/personalUtils/logger/logger';

// Turn off AppService logs dynamically
Logger.config.disableService('AppService');

// This will NOT print anymore
Logger.info('Something happened', { service: 'AppService' });

// Turn it back on
Logger.config.enableService('AppService');

// Silence literally everything
Logger.config.disableAll();
```

## Edge Cases & Filtering Logic

The logger determines whether to print a message based on a strict order of precedence. It behaves as a **Logical OR** operation across explicitly defined fields, falling back to a default state if nothing is specified.

### 1. The Precedence Tree

When you call `Logger.info(...)` with multiple metadata tags (e.g. both a `service` and a `flow`), the logger checks them in the following order:

1. **Service overrides:** Is this specific `service` explicitly toggled `true` or `false`?
2. **Component overrides:** Is this specific `component` explicitly toggled `true` or `false`?
3. **Flow overrides:** Is this specific `flow` explicitly toggled `true` or `false`?
4. **Fallback:** If *none* of the provided tags match an explicit true/false value in the config, it falls back to `defaultEnabled`.

### 2. Edge Case: Conflicting Toggles (Logical OR)

What happens if a log belongs to an **enabled** flow, but a **disabled** service?

**Example Config:**
```typescript
services: { AuthService: false },
flows: { Login: true },
```

**Log Statement:**
```typescript
Logger.info('User fetched', { service: 'AuthService', flow: 'Login' });
```

**Result: It will NOT print.**
*Why?* Because `service` is checked first. The logger sees that `AuthService` is explicitly set to `false`, so it immediately returns false and stops checking. 

To ensure it prints, you must either remove `AuthService` from the disabled config list, or avoid passing the disabled `service` tag to the log call if you only want it tracked by `flow`.

### 3. Edge Case: Missing Tags

What happens if you use a tag that exists in TypeScript but has been deleted/commented-out from the `logger.config.ts` mapping?

**Example Config:**
```typescript
{
  defaultEnabled: false,
  services: {
    // AppService is missing from the map
  }
}
```

**Log Statement:**
```typescript
Logger.info('Hello', { service: 'AppService' });
```

**Result: It will NOT print.**
*Why?* Because `AppService` is `undefined` in the configuration map. The logger moves past the service check, finds no other tags, and hits the `defaultEnabled` fallback (which is `false`).

### 4. Edge Case: Zero Metadata

What happens if you call `Logger.info('Hello World')` with no metadata at all?

**Result: It depends on `defaultEnabled`.**
If `defaultEnabled` is `true`, all untagged logs will print. If it is `false`, all untagged logs will be silenced. 

*Best Practice:* Always provide at least a `service` or `component` tag to ensure your logs can be filtered out from the resulting overwhelming noise of a fully-enabled console.
