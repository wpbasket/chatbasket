import { setting$ } from '@/state/settings/state.setting';
import { useEffect } from 'react';

export const useNotificationPermission = () => {
    useEffect(() => {
        setting$.notifications.set('disabled');
    }, []);
};
