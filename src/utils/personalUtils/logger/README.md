# Structured Logger

A development-only structured logger used across the frontend. Logging is gated by `__DEV__` and filtered by a central configuration map.

## Key Files
- `utils/personalUtils/logger/logger.ts`
- `utils/personalUtils/logger/logger.config.ts`

## Features
- **Zero production overhead**: All log methods return early when `__DEV__` is false.
- **Strictly typed domains**: Services, components, and flows are inferred from the keys in `logger.config.ts`.
- **Central configuration**: `INITIAL_CONFIG` is the single source of truth for allowed log domains.
- **Runtime toggling**: `Logger.config` exposes `enableService`, `disableFlow`, etc.
- **Structured formatting**: Timestamps + emoji labels + optional metadata blocks.

## Usage
```typescript
import { Logger } from '@/utils/personalUtils/logger/logger';

Logger.info('App started', { service: 'AppService', flow: 'Initialization' });
Logger.warn('Network flapping', { service: 'NetworkService', component: 'ApiClient' }, { retryCount: 2 });
Logger.error('Failed to fetch profile', { service: 'PersonalService', function: 'loadProfile' }, { error });
```

## Configuration (`logger.config.ts`)
`INITIAL_CONFIG` is the source of truth for valid domain names and defaults:

```typescript
const INITIAL_CONFIG = {
  defaultEnabled: false,
  services: {
    AppService: true,
    AuthService: true,
    NetworkService: false,
    // ...
  },
  components: {
    ApiClient: false,
    UIComponent: true,
  },
  flows: {
    Initialization: true,
    Login: true,
  },
};
```

### Runtime Toggle Examples
```typescript
Logger.config.enableService('AppService');
Logger.config.disableComponent('ApiClient');
Logger.config.enableFlow('DeepLink');
Logger.config.disableAll();
```

## Filtering Precedence
The logger evaluates metadata in this order:
1. `service`
2. `component`
3. `flow`
4. `defaultEnabled` fallback

If a provided key is explicitly set to `false`, the log is suppressed even if another key is enabled.

## Initialization
`Logger.init()` is called once in `app/_layout.tsx` during app boot. It doesn't mutate state; it simply guarantees that configuration is loaded at startup.
