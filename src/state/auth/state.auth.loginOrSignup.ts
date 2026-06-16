import { observable } from '@legendapp/state';
import type { SessionResponse } from '@/lib/constantLib/models/model.auth';

export function getPasswordErrors(password: string): string[] {
  const errors: string[] = [];

  if (password.length !== 6) {
    errors.push('Password must be exactly 6 digits');
  }
  if (!/^\d+$/.test(password)) {
    errors.push('Password must contain only digits');
  }

  return errors;
}


export const loginOrSignup$ = observable({
  name: null as string | null,
  submitted: false,
  email: null as string | null,
  password: null as string | null,
  otp: null as string | null,
  isSignup: false,
  // Resend OTP controls
  resendCooldown: 0 as number, // seconds remaining before next resend
  resendAttempts: 0 as number, // number of resends used
  resendExpiryAt: null as number | null, // epoch ms when cooldown ends
  // QR login state (all QR flow state lives here, no useState in the hook)
  qr: {
    token: null as string | null,
    expiresAt: null as string | null,
    status: 'idle' as 'idle' | 'loading' | 'waiting' | 'answering' | 'approved' | 'done' | 'error',
    error: null as string | null,
    session: null as SessionResponse | null,
  },
  
  
  isEmailValid: () => {
    const email = loginOrSignup$.email.get() ?? '';
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  },
  passwordErrors: () => getPasswordErrors(loginOrSignup$.password.get() ?? ''),
  isPasswordValid: () => {
    const password = loginOrSignup$.password.get() ?? '';
    return loginOrSignup$.passwordErrors().length === 0;
  },
  isLoginPasswordValid: () => {
    // For login, require the same 6-digit numeric PIN as signup
    return loginOrSignup$.isPasswordValid();
  },
  isOtpValid: () => {
    const otp = loginOrSignup$.otp.get() ?? '';
    return otp.length === 6 && /^\d+$/.test(otp);
  },
  isNameValid: () => {
    const name = loginOrSignup$.name.get() ?? '';
    return name.length !== 0;
  },
  isSignupValid: () => {
    return loginOrSignup$.isNameValid() && loginOrSignup$.isEmailValid() && loginOrSignup$.isPasswordValid();
  },
  isLoginValid: () => {
    return loginOrSignup$.isEmailValid() && loginOrSignup$.isLoginPasswordValid();
  },
  
});
