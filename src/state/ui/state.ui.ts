import { observable } from '@legendapp/state';

export const $uiState = observable({
    keyboardHeight: 0,

    setKeyboardHeight(height: number) {
        $uiState.keyboardHeight.set(height);
    }
});
