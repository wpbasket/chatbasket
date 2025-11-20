import { ThemedText } from '@/components/ui/common/ThemedText';
import { ApiError } from '@/lib/constantLib';
import { setUserInStorage } from '@/lib/storage/commonStorage/storage.auth';
import { $personalStateUser } from '@/state/personalState/user/personal.state.user';
import { useValue } from '@legendapp/state/react';
// import { authState } from '@/state/auth/state.auth';
import { setting$ } from '@/state/settings/state.setting';
import { showGenericError } from '@/utils/commonUtils/util.error';
import { runWithLoading, showAlert } from '@/utils/commonUtils/util.modal';
import React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { SettingsStyles } from './settings.styles';


export type SettingsFlowsDeps = {
  settingApi: any;
  showControllersModal: (controllers: { id: string; content: React.ReactNode }[], options: any) => Promise<any>;
  hideModal: () => void;
  handlePressIn: () => void;
  styles: SettingsStyles;
  MAX_RESENDS: number;
  COOLDOWN_MS: number;
  currentEmail$: any;
};

export default function CreateSettingsFlows({
  settingApi,
  showControllersModal,
  hideModal,
  handlePressIn,
  styles,
  MAX_RESENDS,
  COOLDOWN_MS,
  currentEmail$,
}: SettingsFlowsDeps) {
  const editEmail = async (event: any) => {
    setting$.email.set(null);
    setting$.submitted.set(false);
    const position = {
      x: event?.nativeEvent?.pageX ?? 0,
      y: event?.nativeEvent?.pageY ?? 0,
    };

    // Step 1: Identity verification - send OTP BEFORE opening modal
    setting$.resendAttempts.set(0);
    setting$.resendExpiryAt.set(null);
    setting$.isOTPSent.set(false);
    try {
      const sent: any = await runWithLoading(
        () => settingApi.sendOtp({ subject: 'email-update' }),
        { message: 'Sending OTP' }
      );
      if (!sent?.status) return;
      setting$.resendExpiryAt.set(Date.now() + COOLDOWN_MS);
      setting$.isOTPSent.set(true);
    } catch (err) {
      showGenericError(err);
      return;
    }

    const openIdentityModalForEmail = async () => {
      const OtpInfo = () => {
        const email = useValue(currentEmail$);
        return (
          <ThemedText>
            Enter OTP sent to the current email <ThemedText style={styles.primaryText}>{email}</ThemedText>
          </ThemedText>
        );
      };
      const OtpInput = () => {
        const currentOtp = useValue(setting$.otp);
        const valid = useValue(setting$.isOtpValid);
        const submitted = useValue(setting$.submitted);
        return (
          <TextInput
            placeholder="6 digit OTP"
            inputMode='numeric'
            value={currentOtp ?? ''}
            onChangeText={(t) => setting$.otp.set(t)}
            placeholderTextColor="gray"
            keyboardType="numeric"
            maxLength={6}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType='oneTimeCode'
            style={[styles.modalInput, !valid && submitted && styles.inputError]}
          />
        );
      };

      const ResendRow = () => {
        const attempts = useValue(setting$.resendAttempts);
        const cooldown = useValue(setting$.resendCooldown);
        return (
          <View style={styles.resendRow}>
            <View style={{ gap: 6 }}>
              <ThemedText type="small">{`Attempts: ${attempts}/${MAX_RESENDS}`}</ThemedText>
              <Pressable
                disabled={cooldown > 0 || attempts >= MAX_RESENDS}
                onPress={async () => {
                  const currAttempts = setting$.resendAttempts.get();
                  const currCooldown = setting$.resendCooldown.get();
                  if (currCooldown > 0 || currAttempts >= MAX_RESENDS) return;
                  try {
                    const r = await settingApi.sendOtp({ subject: 'email-update' });
                    if (r?.status) {
                      setting$.resendAttempts.set(currAttempts + 1);
                      setting$.resendExpiryAt.set(Date.now() + COOLDOWN_MS);
                    }
                  } catch (err) {
                    showGenericError(err);
                  }
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <ThemedText style={{ opacity: cooldown > 0 ? 0.5 : 1 }}>
                  {attempts >= MAX_RESENDS
                    ? 'Resend limit reached'
                    : cooldown > 0
                      ? `Resend in ${cooldown}s`
                      : 'Resend OTP'}
                </ThemedText>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.modalActionButton,
                { opacity: pressed ? 0.1 : 1 }
              ]}
              onPress={async () => {
                try {
                  setting$.submitted.set(true);
                  if (!setting$.isOtpValid.get()) {
                    showAlert('Enter a valid 6 digit OTP');
                    return;
                  }
                  const res: any = await runWithLoading(
                    () => settingApi.verifyOtp({ secret: setting$.otp.get() ?? '' }),
                    { message: 'Verifying OTP' }
                  );
                  if (res?.status) {
                    hideModal();
                    setting$.resendAttempts.set(0);
                    setting$.resendExpiryAt.set(null);
                    setting$.isOTPSent.set(false);
                    setting$.otp.set(null);
                    setting$.submitted.set(false);
                    await openEmailUpdateFlow();
                  }
                } catch (err) {
                  if (err instanceof ApiError && err.type==='unauthorized') {
                    showAlert('Invalid OTP');
                  } else {
                    showGenericError(err);
                  }
                }
              }}
              onPressIn={handlePressIn}
            >
              <ThemedText style={styles.modalActionText} selectable={false}>Verify</ThemedText>
            </Pressable>
          </View>
        );
      };

      await showControllersModal([
        { id: 'otpInfo', content: <OtpInfo /> },
        { id: 'otpInput', content: <OtpInput /> },
        { id: 'resendRow', content: <ResendRow /> },
      ], { title: 'Identity Verification', position, showConfirmButton: false, closeOnBackgroundTap: false, onCancel: () => { setting$.reset(); } });
    };

    const openEmailUpdateFlow = async () => {
      const EmailInput = () => {
        const currentEmail = useValue(setting$.email);
        const valid = useValue(setting$.isEmailValid);
        const submitted = useValue(setting$.submitted);
        return (
          <TextInput
            inputMode='email'
            placeholder="Enter new email"
            value={currentEmail ?? ''}
            onChangeText={(t) => setting$.email.set(t)}
            textContentType='emailAddress'
            placeholderTextColor="gray"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.modalInput, !valid && submitted && styles.inputError]}
          />
        );
      };
      const SendEmailOtpButton = () => (
        <View style={styles.actionRightRow}>
          <Pressable
            style={({ pressed }) => [styles.modalPillButton, { opacity: pressed ? 0.1 : 1 }]}
            onPress={async () => {
              try {
                setting$.submitted.set(true);
                if (!setting$.isEmailValid.get()) {
                  showAlert('Enter a valid email address');
                  return;
                }
                const r = await settingApi.updateEmail({ email: setting$.email.get() ?? '' });
                if (r?.status) {
                  setting$.resendAttempts.set(0);
                  setting$.resendExpiryAt.set(Date.now() + COOLDOWN_MS);
                  hideModal();
                  setting$.submitted.set(false);
                  await openEmailVerifyFlow(setting$.email.get() ?? '');
                }
              } catch (err) {
                if (err instanceof ApiError){
                  if (err.type==='conflict') {
                    showAlert('This email is already in use');
                  }
                  else{
                    showGenericError(err);
                  }
                }else{
                  showGenericError(err);
                }
              }
            }}
            onPressIn={handlePressIn}
          >
            <ThemedText style={styles.modalActionText}>Send OTP</ThemedText>
          </Pressable>
        </View>
      );

      await showControllersModal([
        { id: 'newEmailInput', content: <EmailInput /> },
        { id: 'sendEmailOtpInline', content: <SendEmailOtpButton /> },
      ], { title: 'Change Email', position, showConfirmButton: false, closeOnBackgroundTap: false, onCancel: () => { setting$.reset(); } });
    };

    const openEmailVerifyFlow = async (emailToVerify: string) => {
      const VerifyInfo = () => (
        <ThemedText>
          Enter OTP sent to <ThemedText style={styles.primaryText}>{emailToVerify}</ThemedText>
        </ThemedText>
      );
      const VerifyInput = () => {
        const currentOtp = useValue(setting$.otp);
        const valid = useValue(setting$.isOtpValid);
        const submitted = useValue(setting$.submitted);
        return (
          <TextInput
            placeholder="6 digit OTP"
            inputMode='numeric'
            value={currentOtp ?? ''}
            onChangeText={(t) => setting$.otp.set(t)}
            placeholderTextColor="gray"
            keyboardType="numeric"
            maxLength={6}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType='oneTimeCode'
            style={[styles.modalInput, !valid && submitted && styles.inputError]}
          />
        );
      };

      const ResendEmailRow = () => {
        const attempts = useValue(setting$.resendAttempts);
        const cooldown = useValue(setting$.resendCooldown);
        return (
          <View style={styles.resendRow}>
            <View style={{ gap: 6 }}>
              <ThemedText type="small">{`Attempts: ${attempts}/${MAX_RESENDS}`}</ThemedText>
              <Pressable
                disabled={cooldown > 0 || attempts >= MAX_RESENDS}
                onPress={async () => {
                  const currAttempts = setting$.resendAttempts.get();
                  const currCooldown = setting$.resendCooldown.get();
                  if (currCooldown > 0 || currAttempts >= MAX_RESENDS) return;
                  try {
                    const r = await settingApi.updateEmail({ email: emailToVerify });
                    if (r?.status) {
                      setting$.resendAttempts.set(currAttempts + 1);
                      setting$.resendExpiryAt.set(Date.now() + COOLDOWN_MS);
                    }
                  } catch (err) {
                    if (err instanceof ApiError){
                      if (err.type==='conflict') {
                        showAlert('This email is already in use');
                        // Close current verify modal and take user back to change email flow
                        hideModal();
                        // Reset all relevant state via single reset helper
                        setting$.reset();
                        await openEmailUpdateFlow();
                      }
                      else{
                        showAlert('Failed to send OTP. Please try again later.');
                      }
                    }else{
                      showGenericError(err);
                    }
                  }
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <ThemedText style={{ opacity: cooldown > 0 ? 0.5 : 1 }}>
                  {attempts >= MAX_RESENDS
                    ? 'Resend limit reached'
                    : cooldown > 0
                      ? `Resend in ${cooldown}s`
                      : 'Resend OTP'}
                </ThemedText>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.modalActionButton,
                { opacity: pressed ? 0.1 : 1 }
              ]}
              onPress={async () => {
                try {
                  setting$.submitted.set(true);
                  if (!setting$.isOtpValid.get()) {
                    showAlert('Enter a valid 6 digit OTP');
                    return;
                  }
                  const r: any = await runWithLoading(
                    () => settingApi.updateEmailVerification({ email: emailToVerify, otp: setting$.otp.get() ?? '' }),
                    { message: 'Verifying Email' }
                  );
                  if (r?.status) {
                    hideModal();
                    $personalStateUser.user.email.set(r?.message)
                    setUserInStorage()
                    setting$.resendAttempts.set(0);
                    setting$.resendExpiryAt.set(null);
                    setting$.resendCooldown.set(0);
                    setting$.otp.set(null);
                    setting$.submitted.set(false);
                  }
                } catch (err) {
                  if (err instanceof ApiError && err.type==='unauthorized') {
                    showAlert('Invalid OTP');
                  } else {
                    showGenericError(err);
                  }
                }
              }}
              onPressIn={handlePressIn}
            >
              <ThemedText style={styles.modalActionText} selectable={false}>Verify</ThemedText>
            </Pressable>
          </View>
        );
      };

      await showControllersModal([
        { id: 'verifyInfo', content: <VerifyInfo /> },
        { id: 'emailOtpInput', content: <VerifyInput /> },
        { id: 'resendEmailRow', content: <ResendEmailRow /> },
      ], { title: 'Verify Email OTP', position, showConfirmButton: false, closeOnBackgroundTap: false, onCancel: () => { setting$.reset(); } });
    };

    await openIdentityModalForEmail();
  };

  const editPassword = async (event: any) => {
    setting$.password.set(null);
    setting$.submitted.set(false);
    const position = {
      x: event?.nativeEvent?.pageX ?? 0,
      y: event?.nativeEvent?.pageY ?? 0,
    };

    // Step 1: Identity verification - send OTP BEFORE opening modal
    setting$.resendAttempts.set(0);
    setting$.resendExpiryAt.set(null);
    setting$.isOTPSent.set(false);
    try {
      const sent: any = await runWithLoading(
        () => settingApi.sendOtp({ subject: 'password-update' }),
        { message: 'Sending OTP' }
      );
      if (!sent?.status) return;
      setting$.resendExpiryAt.set(Date.now() + COOLDOWN_MS);
      setting$.isOTPSent.set(true);
    } catch (err) {
      showGenericError(err);
      return;
    }

    const openIdentityModalForPassword = async () => {
      const OtpInfo = () => {
        const email = useValue(currentEmail$);
        return (
          <ThemedText>
            Enter OTP sent to the current email <ThemedText style={styles.primaryText}>{email}</ThemedText>
          </ThemedText>
        );
      };
      const OtpInput = () => {
        const currentOtp = useValue(setting$.otp);
        const valid = useValue(setting$.isOtpValid);
        const submitted = useValue(setting$.submitted);
        return (
          <TextInput
            placeholder="6 digit OTP"
            inputMode='numeric'
            value={currentOtp ?? ''}
            onChangeText={(t) => setting$.otp.set(t)}
            placeholderTextColor="gray"
            keyboardType="numeric"
            maxLength={6}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType='oneTimeCode'
            style={[styles.modalInput, !valid && submitted && styles.inputError]}
          />
        );
      };

      const ResendRow = () => {
        const attempts = useValue(setting$.resendAttempts);
        const cooldown = useValue(setting$.resendCooldown);
        return (
          <View style={styles.resendRow}>
            <View style={{ gap: 6 }}>
              <ThemedText type="small">{`Attempts: ${attempts}/${MAX_RESENDS}`}</ThemedText>
              <Pressable
                disabled={cooldown > 0 || attempts >= MAX_RESENDS}
                onPress={async () => {
                  const currAttempts = setting$.resendAttempts.get();
                  const currCooldown = setting$.resendCooldown.get();
                  if (currCooldown > 0 || currAttempts >= MAX_RESENDS) return;
                  try {
                    const r = await settingApi.sendOtp({ subject: 'password-update' });
                    if (r?.status) {
                      setting$.resendAttempts.set(currAttempts + 1);
                      setting$.resendExpiryAt.set(Date.now() + COOLDOWN_MS);
                    }
                  } catch (err) {
                    showGenericError(err);
                  }
                }}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
              >
                <ThemedText style={{ opacity: cooldown > 0 ? 0.5 : 1 }}>
                  {attempts >= MAX_RESENDS
                    ? 'Resend limit reached'
                    : cooldown > 0
                      ? `Resend in ${cooldown}s`
                      : 'Resend OTP'}
                </ThemedText>
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.modalActionButton,
                { opacity: pressed ? 0.1 : 1 }
              ]}
              onPress={async () => {
                try {
                  const res: any = await runWithLoading(
                    () => settingApi.verifyOtp({ secret: setting$.otp.get() ?? '' }),
                    { message: 'Please wait...' }
                  );
                  if (res?.status) {
                    hideModal();
                    setting$.resendAttempts.set(0);
                    setting$.resendExpiryAt.set(null);
                    setting$.isOTPSent.set(false);
                    setting$.otp.set(null);
                    await openPasswordChangeFlow();
                  }
                } catch (err) {
                  if (err instanceof ApiError && err.type==='unauthorized') {
                    showAlert('Invalid OTP')
                  } else {
                    showGenericError(err);
                  }
                }
              }}
              onPressIn={handlePressIn}
            >
              <ThemedText style={styles.modalActionText} selectable={false}>Verify</ThemedText>
            </Pressable>
          </View>
        );
      };

      await showControllersModal([
        { id: 'otpInfo', content: <OtpInfo /> },
        { id: 'otpInput', content: <OtpInput /> },
        { id: 'resendRow', content: <ResendRow /> },
      ], { title: 'Identity Verification', position, showConfirmButton: false, closeOnBackgroundTap: false });
    };

    const openPasswordChangeFlow = async () => {
      const PasswordInput = () => {
        const password = useValue(setting$.password);
        const isPasswordValid = useValue(setting$.isPasswordValid);
        const isSubmitted = useValue(setting$.submitted);
        return (
          <TextInput
            placeholder="Set 6 digit PIN"
            inputMode='numeric'
            value={password ?? ''}
            onChangeText={(t) => setting$.password.set(t)}
            textContentType='newPassword'
            placeholderTextColor="gray"
            keyboardType="numeric"
            secureTextEntry
            maxLength={6}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.modalInput, !isPasswordValid && isSubmitted && styles.inputError]}
          />
        );
      };
      const ChangePasswordButton = () => (
        <View style={styles.actionRightRow}>
          <Pressable
            style={({ pressed }) => [styles.modalPillButton, { opacity: pressed ? 0.1 : 1 }]}
            onPress={async () => {
              try {
                setting$.submitted.set(true);
                if (!setting$.isPasswordValid.get()) {
                  const errs = setting$.passwordErrors.get?.() ?? setting$.passwordErrors();
                  const msg = Array.isArray(errs) && errs.length > 0
                    ? errs.join('\n')
                    : 'Password must be exactly 6 digits and contain only numbers';
                  showAlert(msg);
                  return;
                }
                const r: any = await runWithLoading(
                  () => settingApi.updatePassword({ newPassword: setting$.password.get() ?? '' }),
                  { message: 'Updating password' }
                );
                if (r?.status) {
                  hideModal();
                  setting$.submitted.set(false);
                }
              } catch (err) {
                showGenericError(err);
              }
            }}
            onPressIn={handlePressIn}
          >
            <ThemedText style={styles.modalActionText}>Change</ThemedText>
          </Pressable>
        </View>
      );

      await showControllersModal([
        { id: 'newPassInput', content: <PasswordInput /> },
        { id: 'changePasswordInline', content: <ChangePasswordButton /> },
      ], { title: 'Change Password', position, showConfirmButton: false, closeOnBackgroundTap: false, onCancel: () => { setting$.reset(); } });
    };

    await openIdentityModalForPassword();
  };

  return { editEmail, editPassword };
}
