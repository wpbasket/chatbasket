import { apiClient, BooleanResponse, SessionResponse } from "@/lib/constantLib";

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

/**
 * Get current user and session details
 * @returns SessionResponse
 */
async function getMe(): Promise<SessionResponse> {
    return apiClient.get<SessionResponse>('/common/me');
}

export const commonAuthApi = {
    logout,
    getMe,
};
