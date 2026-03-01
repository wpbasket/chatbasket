import { useRef, useEffect } from 'react';
import { Keyboard } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

/**
 * IME Stabilizer Hook
 *
 * Prevents the Android IME flicker where insets briefly drop to 0
 * during keyboard animation (288 → 0 → 288).
 *
 * Returns a stable IME offset value that can be used for
 * `translateY` transforms on a content layer.
 */
export function useStableIme(): number {
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
    }, [rt.insets.ime]);

    const stableIme =
        keyboardVisible.current
            ? (rt.insets.ime > 0 ? rt.insets.ime : lastIme.current)
            : 0;

    return stableIme;
}
