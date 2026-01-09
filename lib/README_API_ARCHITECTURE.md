# API Layer Architecture

**Pattern:** Typed Singleton Wrapper
**Locations:** `lib/publicLib`, `lib/personalLib`, `lib/constantLib`

## The Strategy
We decouple the **UI** from the **Network Implementation**. Components never call `fetch()` directly. They call Semantic API Methods.

### 1. The Base Client (`apiClient`)
*   Located in `lib/constantLib`.
*   wraps the underlying HTTP client (e.g., `mandarin` or `axios`).
*   **Responsibilities**:
    *   Automatically adds `Authorization: Bearer <token>` headers.
    *   Handles Base URL configuration.
    *   Standardizes Error Handling (interceptors).

### 2. The API Definition (e.g., `public.api.profile.ts`)
*   **Role**: Define the Contract.
*   **Structure**: Pure functions returning Promises of Typed Responses.

```typescript
// Define the Request/Response types explicitly
async function getProfile(): Promise<ProfileResponse> {
    return apiClient.get<ProfileResponse>('/public/profile/get-profile');
}
```

### 3. Usage in Components
Components deal with logic, not URLs.

```typescript
// ✅ Good
const profile = await profileApi.getProfile();

// ❌ Bad
const res = await fetch('https://api.chatbasket.me/public/profile/get-profile');
```

## Benefits
1.  **Type Safety**: The return type `ProfileResponse` is guaranteed by TypeScript interfaces shared with the Backend (or defined in `models`).
2.  **Refactorability**: If the backend URL changes from `/get-profile` to `/me`, we change it in *one* file, and the whole app updates.
3.  **Mockability**: Easy to swap `profileApi` with a mock object for testing purposes.
