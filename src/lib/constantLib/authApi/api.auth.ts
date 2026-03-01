import {
  apiClient,
  type AuthResponse,
  type AuthVerificationPayload,
  type LoginPayload,
  type ResendOTPPayload,
  type SessionResponse,
  type SignupPayload,
} from '@/lib/constantLib';

/**
 * Handles user signup. This step should trigger an OTP to be sent. A confirmation message from the API. Does NOT establish a session.
 * @param payload name: string; email: string; password: string;
 * @returns status:boolean; message:string; 
 */
async function signup(payload: SignupPayload): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/signup', payload);
}

/**
 * Handles user login. This step should trigger an OTP to be sent. A confirmation message from the API. Does NOT establish a session.
 * @param payload email: string; password: string;
 * @returns status:boolean; message:string; 
 */
async function login(payload: LoginPayload): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/login', payload);
}

/**
 * Handles OTP verification. On success, it establishes a new session,
 * @param payload email: string; secret: string; platform: string;
 * @returns userId:string; name:string; email:string; sessionId:string; sessionExpiry:string;
 */
async function AuthVerificationSignup(payload: AuthVerificationPayload): Promise<SessionResponse> {
  return apiClient.post<SessionResponse>('/auth/signup-verification', payload);
}

/**
 * Handles OTP verification. On success, it establishes a new session,
 * @param payload email: string; secret: string; platform: string;
 * @returns userId:string; name:string; email:string; sessionId:string; sessionExpiry:string;
 */
async function AuthVerificationLogin(payload: AuthVerificationPayload): Promise<SessionResponse> {
  return apiClient.post<SessionResponse>('/auth/login-verification', payload);
}

/**
 * Resend OTP for both signup and login flows
 * @param payload email: string; type: 'signup' | 'login';
 * @returns status:boolean; message:string;
 */
async function resendOTP(payload: ResendOTPPayload): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/resend-otp', payload);
}


export const authApi = {
  signup,
  login,
  AuthVerificationSignup,
  AuthVerificationLogin,
  resendOTP,
};
