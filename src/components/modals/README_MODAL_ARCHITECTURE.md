# Global Modal Architecture

**State Library:** `@legendapp/state`
**Files:**
- `utils/commonUtils/util.modal.ts`
- `components/modals/AppModal.tsx`
- `state/modals/state.modals.ts`

## Why This Exists
Traditional React modals require per-screen local state, prop drilling, and duplicated wiring. ChatBasket uses a **global modal stack** with promise-based helpers to keep screens thin.

## How It Works
### 1) Caller API (Promise-Based)
Use helpers from `util.modal.ts` to open a modal and await a result.

```typescript
const confirmed = await showConfirmDialog('Delete this item?');
if (confirmed) {
  // Proceed with deletion
}
```

### 2) State Layer
`modalActions.open()` pushes an entry into the modal stack. Each entry stores:
- `type` (confirm/alert/dropdown/controllers/loading)
- `props` (modal-specific config)
- `id` (unique instance ID)
- optional `position` for anchored UI

### 3) Renderer (`AppModal.tsx`)
`AppModal` sits at the root of the app (`app/_layout.tsx`). It renders the **full stack** of modals and places them correctly:
- Supports centered modals and **positioned modals** (anchored to a click/press location).
- Measures content size on layout and clamps within safe screen margins.
- Handles wide-screen padding to avoid sidebars on large web layouts.

## Supported Modals
- `showConfirmDialog()` → Yes/No promise
- `showAlert()` → informational message
- `showDropdownPicker()` → selection list
- `showControllersModal()` → action list with confirm/cancel
- `showLoading()` / `runWithLoading()` → non-dismissible or cancellable loading modal

## Positioning Support
All modal helpers accept an optional `position` ({ x, y }). When provided:
- The modal tries to open below the pointer.
- If there isn’t enough space, it flips above.
- The placement is clamped to safe margins and wide-layout padding.

## Cleanup
Each helper resolves its promise when:
- Confirm/cancel handlers fire
- A modal is closed explicitly (`modalActions.closeById`)
- A backdrop tap closes the modal (unless `closeOnBackgroundTap` is disabled)

## Guidance
- Use modal helpers from `util.modal.ts`; avoid rendering modals directly in screens.
- Prefer IDs and `modalActions.closeById()` for precise closures (loading modals).
