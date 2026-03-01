import { apiClient, BooleanResponse } from "@/lib/constantLib";
import type {
    RequestUpdateOTPPayload,
    ConfirmPasswordUpdatePayload,
    RequestEmailUpdatePayload,
    ConfirmEmailUpdatePayload,
} from "../models/common.model.setting";

/**
 * Request OTP for update operations (password or email)
 */
const requestUpdateOTP = (payload: RequestUpdateOTPPayload) => {
    return apiClient.post<BooleanResponse>(
        "/common/settings/update/request",
        payload
    );
};

/**
 * Confirm password update with OTP and new password
 */
const confirmPasswordUpdate = (payload: ConfirmPasswordUpdatePayload) => {
    return apiClient.post<BooleanResponse>(
        "/common/settings/password/confirm",
        payload
    );
};

/**
 * Request email update (verifies password, sends OTP to new email)
 */
const requestEmailUpdate = (payload: RequestEmailUpdatePayload) => {
    return apiClient.post<BooleanResponse>(
        "/common/settings/email/request",
        payload
    );
};

/**
 * Confirm email update with OTP
 */
const confirmEmailUpdate = (payload: ConfirmEmailUpdatePayload) => {
    return apiClient.post<BooleanResponse>(
        "/common/settings/email/confirm",
        payload
    );
};

export const settingApi = {
    requestUpdateOTP,
    confirmPasswordUpdate,
    requestEmailUpdate,
    confirmEmailUpdate,
};
