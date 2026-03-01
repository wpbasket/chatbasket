// Common settings payload types

export interface RequestUpdateOTPPayload {
    updateType: "password_update" | "email_update";
}

export interface ConfirmPasswordUpdatePayload {
    updateId: string;
    otp: string;
    newPassword: string;
}

export interface RequestEmailUpdatePayload {
    newEmail: string;
    password: string;
}

export interface ConfirmEmailUpdatePayload {
    updateId: string;
    otp: string;
}
