import { observable } from '@legendapp/state';

export const forgotPassword$ = observable({
  // Input state
  email: null as string | null,
  otp: null as string | null,
  newPassword: null as string | null,
  
  // Flow state
  updateId: null as string | null,
  submitted: false,
  
  // Resend controls
  resendAttempts: 0 as number,
  resendExpiryAt: null as number | null,
  
  // Computed validations
  isEmailValid: () => {
    const email = forgotPassword$.email.get() ?? '';
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  },
  
  isOtpValid: () => {
    const otp = forgotPassword$.otp.get() ?? '';
    return otp.length === 6 && /^\d+$/.test(otp);
  },
  
  isPasswordValid: () => {
    const password = forgotPassword$.newPassword.get() ?? '';
    return password.length === 6 && /^\d+$/.test(password);
  },
  
  resendCooldown: () => {
    const expiryAt = forgotPassword$.resendExpiryAt.get();
    if (!expiryAt) return 0;
    return Math.max(0, Math.ceil((expiryAt - Date.now()) / 1000));
  },
  
  // Reset function
  reset: () => {
    forgotPassword$.email.set(null);
    forgotPassword$.otp.set(null);
    forgotPassword$.newPassword.set(null);
    forgotPassword$.updateId.set(null);
    forgotPassword$.submitted.set(false);
    forgotPassword$.resendAttempts.set(0);
    forgotPassword$.resendExpiryAt.set(null);
  }
});
