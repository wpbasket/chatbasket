# State Management Patterns

**Library:** `Legend-State`
**Philosophy:** "Fine-Grained Reactivity"

## Why Legend-State?
Unlike Context API (re-renders entire tree) or Redux (boilerplate heavy), Legend-State allows specific components to listen to specific properties of an object.

## Domain Stores
We split state by "Domain" in the `state/` directory:

1.  **Global App State**:
    *   `auth`: Session, Tokens, User ID.
    *   `appMode`: Public vs Private mode toggle.
    *   `settings`: UI preferences.
    *   `modals`: Transient UI state (Global Modal Manager).

2.  **Domain Data**:
    *   `publicState`: Data specific to Public Profile (User Posts, Public Feed).
    *   `personalState`: Data specific to Personal Profile (Private Chats, Contacts).

## Pattern: The "Observable Store"
We do not write "Actions" or "Reducers". We simply export an Observable Object.

```typescript
// definition
export const userPostsStore = observable({
  posts: []
});

// usage (Component)
const posts = useValue(userPostsStore.posts); // Re-renders only when 'posts' changes
```

## Persistence
Legend-State has built-in persistence. However, we strictly Separate:
*   **Persisted State**: Auth Tokens (Encrypted), Settings (MMKV).
*   **Transient State**: `modals`, `isInTheProfileUpdateMode` (Reset on reload).
