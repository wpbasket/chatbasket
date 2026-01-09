# Global Modal Architecture

**State Library:** Legend-State
**Files:** `utils/commonUtils/util.modal.ts`, `components/modals/AppModal.tsx`

## The Problem
In standard React (Native), using Modals often requires:
1.  Adding Local State (`useState(false)`).
2.  Importing the Modal component into *every* screen.
3.  Managing prop drilling for callbacks (`onConfirm`, `onCancel`).

This leads to messy code and repetitive imports.

## The Solution: "Imperative Promise-Based Modals"

We use a global state pattern where Modals are triggered by functions that return Promises.

### 1. Usage (The "Caller")
Anywhere in your code (even inside logic files, hooks, or event handlers), you can simply await a modal:

```typescript
const isConfirmed = await showConfirmDialog('Delete this item?');

if (isConfirmed) {
  // Proceed with deletion
} else {
  // Do nothing
}
```

### 2. Architecture

1.  **The Trigger (`util.modal.ts`)**:
    *   `showConfirmDialog()` creates a unique ID.
    *   It pushes a "Modal Request" object to the `modal$` observable (Legend-State).
    *   It creates a `new Promise()` and stores the `resolve` function.

2.  **The Renderer (`AppModal.tsx`)**:
    *   This component sits at the **Root** of the app (in `_layout.tsx`).
    *   It listens to the `modal$` state.
    *   When the state changes, it renders the appropriate UI (Alert, Confirm, Loading, etc.).

3.  **The Resolution**:
    *   When the user clicks "Confirm" in the UI:
    *   `AppModal` calls the `onConfirm` callback stored in the state.
    *   This callback calls `resolve(true)`.
    *   The Promise in your original code completes.
    *   The Modal closes.

## Supported Modals
*   `showConfirmDialog()`: Yes/No styled dialog.
*   `showAlert()`: Simple informational popup.
*   `showLoading()` / `runWithLoading()`: Non-dismissible loading spinner.
*   `showDropdownPicker()`: Selection list.
*   `showControllersModal()`: Flexible action sheet with custom controllers.
