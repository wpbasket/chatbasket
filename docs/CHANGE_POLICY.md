# Change Policy (Frontend)

Before changing frontend code, follow this checklist to keep routing, state, storage, networking, and docs consistent.

## Pre-change review
- **Locate scope**: Identify impacted areas (screens/routes, state stores, storage, API modules, UI system, modals, app mode/auth guards).
- **Read docs**: Check `PROJECT_CONSISTENCY.md`, feature READMEs (root architecture, auth, storage, API, UI, modals) relevant to the change.
- **Trace dependencies**: Map flow end-to-end (route → screen → hooks/state → API module → backend contract). Consider web vs native differences.

## Plan first
- **Design contracts**: Define request/response shapes and state updates before coding; align with backend API and typed models.
- **Auth/session rules**: Plan web (cookies, expiry-only storage) vs native (secure storage, bearer header) behaviors and guards.
- **Storage choice**: Decide AppStorage backend (sync web for flicker-free prefs vs async/native MMKV) and secure vs standard usage.
- **Modals/UI**: Use global modal utilities and themed components; avoid per-screen modal wiring or raw Text/View.

## Execute carefully
- **No ad-hoc fetch**: Use typed API modules; do not call fetch directly from components.
- **Keep layers clean**: Screens stay thin; logic in hooks/state; storage via wrappers; avoid direct AsyncStorage/MMKV access.
- **Update docs**: Refresh affected READMEs when flows change (auth, storage, routing, API usage, UI patterns).

## Post-change sanity
- Test both web and native paths (auth flow, route guards, storage hydration, deep linking, modal flows).
- Verify state resets/clears (logout, clearSession) still work and primary device metadata remains coherent.
- Check theme/mode flicker on web if storage/backend changed; ensure sync storage used where needed.
