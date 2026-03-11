# API Layer Architecture

**Pattern:** Typed API modules over a shared `ApiClient` wrapper.
**Locations:** `lib/constantLib`, `lib/publicLib`, `lib/personalLib`

## Strategy
UI components never call `fetch()` directly. They call semantic API functions that live in the domain modules. This keeps routing, auth, and error handling centralized.

## 1) Base Client (`ApiClient`)
**File:** `lib/constantLib/clients/client.ts`

Responsibilities:
- Builds base URLs from `Url.BASE_API_URL` and appends `/api`.
- Adds `Authorization: Bearer <sessionId>:<userId>` **only on native** (web relies on HttpOnly cookies).
- Attaches `credentials: 'include'` on web requests.
- Normalizes errors into `ApiError` and calls `clearSession()` on `session_invalid`, `missing_auth`, `invalid_user_id`, or `user_not_found` (except auth endpoints).

## 2) API Modules (Contract Layer)
Each domain exports typed functions that return `Promise<T>`.

Example (public profile):
```typescript
import { apiClient } from '@/lib/constantLib/clients/client';

export async function getProfile() {
  return apiClient.get<ProfileResponse>('/public/profile/get-profile');
}
```

## 3) Component Usage
Components should call semantic APIs, not raw URLs:

```typescript
// ✅ Good
const profile = await profileApi.getProfile();

// ❌ Avoid
await fetch('https://api.chatbasket.live/api/public/profile/get-profile');
```

## Benefits
1. **Type safety**: response shapes are defined in model types.
2. **Refactorability**: route changes are centralized.
3. **Security**: cookie/header handling stays consistent.
4. **Consistency**: error handling and session invalidation behave the same across modules.
