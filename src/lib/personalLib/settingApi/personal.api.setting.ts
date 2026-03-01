import { apiClient, BooleanResponse } from "@/lib/constantLib";
import { RegisterTokenPayload } from "../models/personal.model.notification";

/**
 * Promotes the current session to be the Central Device.
 * @returns status: boolean; message: string;
 */
async function setCentralDevice(): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/personal/settings/session/central', {});
}

/**
 * Updates the notification token for the current session.
 * @param payload token: string; type: 'fcm' | 'apn';
 * @returns status: boolean; message: string;
 */
async function updateSessionNotificationToken(payload: RegisterTokenPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/personal/settings/session/notification-token', payload);
}

export const PersonalSettingApi = {
    setCentralDevice,
    updateSessionNotificationToken,
};