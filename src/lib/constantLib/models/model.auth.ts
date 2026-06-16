// models/auth.model.ts or a shared file




export interface SignupPayload {
    name: string;
    email: string;
    password: string;
}

export interface LoginPayload {
    email: string;
    password: string;
}

export interface AuthResponse {
    status: boolean
    message: string
}

export interface AuthVerificationPayload {
    email: string;
    secret: string;
    platform: string;
}

export interface SessionResponse {
    userId: string;
    name: string;
    email: string;
    sessionId: string;
    sessionExpiry: string;
    isPrimary: boolean;
    primaryDeviceName?: string;
}

export interface ResendOTPPayload {
    email: string;
    type: 'signup' | 'login';
}

export interface ForgotPasswordPayload {
    email: string;
}

export interface ForgotPasswordVerifyPayload {
    updateId: string;
    otp: string;
    newPassword: string;
}

export interface QRInitiateResponse {
    qr_token: string;
    expires_in: number;
}

export interface QRCallbackPayload {
    qr_token: string;
}

export interface QRApprovePayload {
    qr_token: string;
}

export interface QRApproveResponse {
    status?: boolean;
    message?: string;
}



