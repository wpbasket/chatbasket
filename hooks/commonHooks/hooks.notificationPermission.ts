import { setting$ } from '@/state/settings/state.setting';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';

export const useNotificationPermission = () => {
    useEffect(() => {
        const checkPermission = async () => {
            try {
                const { status } = await Notifications.getPermissionsAsync();
                setting$.notifications.set(status === 'granted' ? 'enabled' : 'disabled');
            } catch {
                setting$.notifications.set('disabled');
            }
        };

        // Check on mount
        void checkPermission();

        // Check on app resume
        const sub = AppState.addEventListener('change', (state) => {
            if (state !== 'active') return;
            void checkPermission();
        });

        return () => sub.remove();
    }, []);
};
