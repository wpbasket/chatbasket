import React, { useEffect } from 'react';
import { KeyboardEvents } from 'react-native-keyboard-controller';
import { $uiState } from '@/state/ui/state.ui';

/**
 * KeyboardSync Component
 * 
 * Synchronizes the keyboard height to the global $uiState observable.
 * Uses KeyboardEvents (JS Emitter) for stability and to avoid Reanimated 
 * worklet serialization issues with Legend State observables.
 */
export const KeyboardSync = React.memo(() => {
    useEffect(() => {
        // Subscribe to keyboard show event to get the real height natively
        const showSub = KeyboardEvents.addListener('keyboardDidShow', (e) => {
            $uiState.setKeyboardHeight(e.height);
        });

        const hideSub = KeyboardEvents.addListener('keyboardDidHide', () => {
            $uiState.setKeyboardHeight(0);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    return null;
});
