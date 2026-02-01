import { apiClient, BooleanResponse } from "@/lib/constantLib";

export interface LogoutPayload {
    all_sessions: boolean; // true = logout from all sessions, false = current session only
}

/**
 * Logout from current or all sessions
 * @param payload all_sessions: boolean
 * @returns status: boolean; message: string;
 */
async function logout(payload: LogoutPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/common/logout', payload);
}

export const commonAuthApi = {
    logout,
};
