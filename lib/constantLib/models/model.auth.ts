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
}

