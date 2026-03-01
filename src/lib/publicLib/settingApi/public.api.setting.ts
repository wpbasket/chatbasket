import {apiClient, BooleanResponse} from "@/lib/constantLib";

import {
    type UpdateEmailPayload,
    type UpdateEmailVerificationPayload,
    type UpdatePasswordPayload,
    type SendOtpPayload,
    type VerifyOtpPayload,
} from "@/lib/publicLib";

/**
 * Handles email update. This step should trigger an OTP to be sent. A confirmation message from the API. Does NOT update the email.
 * @param payload email: string;
 * @returns status: boolean; message: string;
 */
async function updateEmail(payload: UpdateEmailPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/public/settings/update-email', payload);
}

/**
 * Handles email verification. On success, it updates the email.
 * @param payload email: string; otp: string; 
 * @returns status: boolean; message: string;
 */
async function updateEmailVerification(payload: UpdateEmailVerificationPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/public/settings/update-email-verification', payload);
}


/**
 * Handles password update.
 * @param payload newPassword: string;
 * @returns status: boolean; message: string;
 */
async function updatePassword(payload: UpdatePasswordPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/public/settings/update-password', payload);
}


/**
 * Handles OTP sending.
 * @param payload subject: string;
 * @returns status: boolean; message: string;
 */
async function sendOtp(payload: SendOtpPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/public/settings/send-otp', payload);
}

/**
 * Handles OTP verification.
 * @param payload secret: string;
 * @returns status: boolean; message: string;
 */
async function verifyOtp(payload: VerifyOtpPayload): Promise<BooleanResponse> {
    return apiClient.post<BooleanResponse>('/public/settings/verify-otp', payload);
}

export const settingApi = {
    updateEmail,
    updateEmailVerification,
    updatePassword,
    sendOtp,
    verifyOtp,
}