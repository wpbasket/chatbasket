# Deep Linking & App Mode Architecture

**Goal:** Keep `appMode` aligned with the active route without race conditions or redundant updates.

## Key Files
- `state/appMode/state.appMode.ts`
- `app/_layout.tsx`
- `app/index.tsx`
- `app/+native-intent.tsx` (native cold-start handler)

## The Problem We Solve
On native platforms, state can hydrate **before** Expo Router resolves an incoming deep link. If the app initializes in the wrong mode (e.g., Personal) it can block a Public deep link via route guards.

## Current Solution
We split deep-link handling into **cold-start** and **warm-start** paths and only mutate `appMode` when needed.

### 1) Cold Start (Native Only)
`+native-intent.tsx` intercepts deep links before the navigation stack renders and **sets `appMode` synchronously**. This ensures the correct mode is in place before guards run.

### 2) Warm Start / Running App (`app/_layout.tsx`)
`_layout.tsx` handles runtime updates:
- Listens to `Linking.addEventListener('url')`.
- Uses a memoized handler to set `appMode` only when the URL prefix actually changes.
- Synchronizes `appMode` with `useSegments()` so client-side navigation keeps state and router aligned.

### 3) Web Initial Mode
`state.appMode.ts` runs `getInitialMode()`:
- If `window.location.pathname` starts with `/public` or `/personal`, that route wins.
- Otherwise, it falls back to `PreferencesStorage.getMode()`.

### 4) Root Index Guard (`app/index.tsx`)
`app/index.tsx` redirects only when **no** deep-link segments exist:
- If `segments.length > 0`, it returns `null` and avoids hijacking deep links.
- If at root (`/`), it redirects to the last saved mode.

## Performance Optimizations
- **No redundant updates**: `setAppMode` runs only when the target mode differs.
- **Memoized deep-link handler**: avoids re-registering listeners unless necessary.
- **Single state mutation on deep link**: cold-start handler sets it once; segment sync sees it already matches.

## Adding New Modes
If a new mode is introduced:
1. Update `getInitialMode()` path matching in `state.appMode.ts`.
2. Update `_layout.tsx` deep-link parsing and segment sync.
3. Update `+native-intent.tsx` to map path prefixes.
4. Ensure `app/index.tsx` default redirects handle the new mode.
