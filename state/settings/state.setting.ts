import { observable } from '@legendapp/state';

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

export const setting$ = observable({
  submitted: false,
  email: null as string | null,
  password: null as string | null,
  currentPassword: null as string | null,
  otp: null as string | null,
  updateId: null as string | null,
  isOTPSent: false,

  notifications: 'disabled' as 'enabled' | 'disabled',

  // Resend OTP controls
  resendCooldown: 0 as number, // seconds remaining before next resend
  resendAttempts: 0 as number, // number of resends used
  resendExpiryAt: null as number | null, // epoch ms when cooldown ends


  isEmailValid: () => {
    const email = setting$.email.get() ?? '';
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  },
  passwordErrors: () => getPasswordErrors(setting$.password.get() ?? ''),
  isPasswordValid: () => {
    const password = setting$.password.get() ?? '';
    return setting$.passwordErrors().length === 0;
  },
  isOtpValid: () => {
    const otp = setting$.otp.get() ?? '';
    return otp.length === 6 && /^\d+$/.test(otp);
  },
  reset: () => {
    setting$.submitted.set(false);
    setting$.email.set(null);
    setting$.password.set(null);
    setting$.currentPassword.set(null);
    setting$.otp.set(null);
    setting$.updateId.set(null);
    setting$.isOTPSent.set(false);
    setting$.notifications.set('disabled');
    setting$.resendCooldown.set(0);
    setting$.resendAttempts.set(0);
    setting$.resendExpiryAt.set(null);
  }
});