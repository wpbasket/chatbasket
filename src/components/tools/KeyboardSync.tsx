import React, { useEffect, useRef } from 'react';
import { Keyboard } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { $uiState } from '@/state/ui/state.ui';

/**
 * KeyboardSync Component
 * 
 * Synchronizes the Unistyles IME height to the global $uiState observable.
 * Handles the Android IME flicker (288 -> 0 -> 288) by keeping a stable reference.
 */
export const KeyboardSync = React.memo(() => {
    const { rt } = useUnistyles();
    const lastIme = useRef(0);
    const keyboardVisible = useRef(false);

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardDidShow', () => {
            keyboardVisible.current = true;
        });

        const hideSub = Keyboard.addListener('keyboardDidHide', () => {
            keyboardVisible.current = false;
            lastIme.current = 0;
            $uiState.setKeyboardHeight(0);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    useEffect(() => {
        if (rt.insets.ime > 0) {
            lastIme.current = rt.insets.ime;
        }

        const stableIme = keyboardVisible.current
            ? (rt.insets.ime > 0 ? rt.insets.ime : lastIme.current)
            : 0;

        $uiState.setKeyboardHeight(stableIme);
    }, [rt.insets.ime]);

    return null;
});
