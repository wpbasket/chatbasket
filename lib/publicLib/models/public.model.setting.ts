export interface UpdateEmailPayload {
    email: string;
}

export interface UpdateEmailVerificationPayload {
    email: string;
    otp: string;
}

export interface UpdatePasswordPayload {
    newPassword: string;
}

export interface SendOtpPayload {
    subject: string;
}

export interface VerifyOtpPayload {
    secret: string;
}