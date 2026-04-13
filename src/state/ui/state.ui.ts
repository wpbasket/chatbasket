import { observable } from '@legendapp/state';

// Monotonic counter for unique media player IDs
let mediaIdCounter = 0;
export const generateMediaId = (type: 'audio' | 'video') => `${type}-${++mediaIdCounter}`;

export const $uiState = observable({
    keyboardHeight: 0,

    // ── Media Focus ──────────────────────────────────────────────────────
    // Only one media player (audio or video) can be active at a time.
    // Players observe this and auto-pause when they lose focus.
    activeMediaId: null as string | null,

    setKeyboardHeight(height: number) {
        $uiState.keyboardHeight.set(height);
    },

    claimMediaFocus(id: string) {
        $uiState.activeMediaId.set(id);
    },

    releaseMediaFocus(id: string) {
        // Only release if this player is still the active one
        if ($uiState.activeMediaId.get() === id) {
            $uiState.activeMediaId.set(null);
        }
    },
});
