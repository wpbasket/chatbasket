import type { TokenType } from '@/lib/personalLib/models/personal.model.notification';

export async function openNotificationSettingsFromApp(): Promise<void> {
    return;
}

export async function getPushToken(
    _silent: boolean = false,
): Promise<{ token: string; type: TokenType } | null> {
    return null;
}

export async function registerForPushNotifications(): Promise<{ token: string; type: TokenType } | null> {
    return null;
}

export async function registerTokenWithBackend(): Promise<boolean> {
    return false;
}

export function setupNotificationListeners(): () => void {
    return () => { };
}

export async function checkInitialNotification() {
    return;
}
