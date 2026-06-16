import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { ApiError } from '@/lib/constantLib';
import { authApi } from '@/lib/constantLib/authApi/api.auth';
import { authState } from '@/state/auth/state.auth';
import { forgotPassword$ } from '@/state/auth/state.auth.forgotPassword';
import { loginOrSignup$ } from '@/state/auth/state.auth.loginOrSignup';
import { runWithLoading, showAlert, showControllersModal, hideModal } from '@/utils/commonUtils/util.modal';
import { useResendCooldown } from '@/utils/commonUtils/util.resendCooldown';
import { useValue } from '@legendapp/state/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { showGenericError, isRateLimitError } from '@/utils/commonUtils/util.error';
import { useQRLogin } from '@/hooks/commonHooks/hooks.qrLogin';
import QRCode from 'react-native-qrcode-svg';

function QRLoginScreen() {
  const { retry } = useQRLogin();
  const token = useValue(loginOrSignup$.qr.token);
  const status = useValue(loginOrSignup$.qr.status);
  const qrSession = useValue(loginOrSignup$.qr.session);

  const isError = status === 'error';
  const isSuccess = !!token && (status === 'waiting' || status === 'approved' || status === 'done');
  const isLoading = !isSuccess && !isError;

  // When QR login gets a session response, route through auth-verify for unified finalization
  useEffect(() => {
    if (qrSession) {
      authState.isSentOtp.set(true);
      router.replace({ pathname: '/(auth)/auth-verify', params: { qrMode: 'true' } });
    }
  }, [qrSession]);

  return (
    <ThemedView style={[styles.ctn, { paddingBottom: 80 }]}>
      <View style={[styles.container, { width: 380, height: 500, justifyContent: 'center', alignItems: 'center' }]}>
        <View style={[styles.mainctn, { width: 380, height: 500, gap: 20, alignItems: 'center', justifyContent: 'center' }]}>
          
          {/* 1. Big White Circle for QR Code */}
          <View style={styles.qrCircle}>
            {isLoading ? (
              <ActivityIndicator size="large" color="#000000" />
            ) : isSuccess ? (
              <QRCode
                value={`chatbasket://qr-login/${token}`}
                size={230}
                color="#000000"
                backgroundColor="transparent"
                ecl="L"
                quietZone={10}
              />
            ) : (
              <View style={{ alignItems: 'center', gap: 12 }}>
                <ThemedText style={{ textAlign: 'center', color: '#B00020', fontSize: 13, paddingHorizontal: 12 }} type="defaultSemiBold" selectable={false}>
                  Failed to load QR code.
                </ThemedText>
                <Pressable
                  onPress={() => void retry()}
                  style={({ pressed }) => [
                    styles.tryAgainButton,
                    { opacity: pressed ? 0.1 : 1 }
                  ]}
                >
                  <ThemedText style={styles.tryAgainLabel} type="semibold" selectable={false}>
                    Try again
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </View>

          {/* 2. Text Content (Title & Subtitle) */}
          <View style={{ alignItems: 'center', gap: 4 }}>
            <ThemedText style={{ fontSize: 22, fontWeight: 'bold', textAlign: 'center' }} selectable={false}>
              Log in by QR Code
            </ThemedText>
            <ThemedText style={[{ fontSize: 13, textAlign: 'center' }, styles.qrSubtitle]} selectable={false}>
              Scan with ChatBasket app on your phone
            </ThemedText>
          </View>

          {/* 3. Single Instruction */}
          <ThemedText style={{ fontSize: 14, textAlign: 'center' }} type="defaultSemiBold" selectable={false}>
            Go to Profile → Settings → Scan QR Code
          </ThemedText>

        </View>
      </View>
    </ThemedView>
  );
}

export default function Auth() {
  const { method, qr } = useLocalSearchParams();
  const showQR = qr === 'true';

  const email = useValue(loginOrSignup$.email)
  const password = useValue(loginOrSignup$.password)
  const name = useValue(loginOrSignup$.name)
  const isLoginValid = useValue(loginOrSignup$.isLoginValid)
  const isSignupValid = useValue(loginOrSignup$.isSignupValid)
  const isEmailValid = useValue(loginOrSignup$.isEmailValid)
  const isSubmited = useValue(loginOrSignup$.submitted)
  const isNameValid = useValue(loginOrSignup$.isNameValid)
  const isPasswordValid = useValue(loginOrSignup$.isPasswordValid)
  const isLoginPasswordValid = useValue(loginOrSignup$.isLoginPasswordValid)

  // Reusable cooldown ticker for forgot password
  useResendCooldown(forgotPassword$);




  useEffect(() => {
    // Clean up when component unmounts, but only if not navigating to auth-verify
    return () => {
      if (!authState.isSentOtp.get()) {
        loginOrSignup$.email.set(null);
        loginOrSignup$.password.set(null);
        loginOrSignup$.name.set(null);
        loginOrSignup$.submitted.set(false)
        loginOrSignup$.isSignup.set(false)
        loginOrSignup$.resendExpiryAt.set(null)
      }
    };
  }, []);

  const handleLogin = async () => {
    if (!isLoginValid) {
      loginOrSignup$.submitted.set(true);
      const msgs: string[] = [];
      if (!isEmailValid) msgs.push('Enter a valid email address');
      if (!isLoginPasswordValid) {
        const errs = loginOrSignup$.passwordErrors.get?.() ?? loginOrSignup$.passwordErrors();
        const pwdMsg = Array.isArray(errs) && errs.length > 0
          ? errs.join('\n')
          : 'Password must be exactly 6 digits and contain only numbers';
        msgs.push(pwdMsg);
      }
      if (msgs.length) showAlert(msgs.join('\n'));
      return;
    }
    await runWithLoading(async () => {
      try {
        const response = await authApi.login({ email: email!, password: password! });
        if (response.status) {
          authState.isSentOtp.set(true);
          loginOrSignup$.resendExpiryAt.set(Date.now() + 120_000);
          router.replace({ pathname: '/auth-verify' });
        }
        if (!response.status) {
          showAlert('Invalid email or password');
        }
      } catch (error) {
        if (error instanceof ApiError) {
          if (isRateLimitError(error.type)) {
            showGenericError(error);
            return;
          }
          if (['unauthorized'].includes(error.type)) {
            showAlert('Invalid email or password');
            return;
          }
          else {
            showAlert('Something went wrong try again');
          }
        } else {
          showAlert('Unexpected error occurred try again');
        }
      }
    }, { message: 'Verifying' });
  };

  const handleSignup = async () => {
    if (!isSignupValid) {
      loginOrSignup$.submitted.set(true);
      const msgs: string[] = [];
      if (!isNameValid) msgs.push('Enter your name');
      if (!isEmailValid) msgs.push('Enter a valid email address');
      if (!isPasswordValid) {
        const errs = loginOrSignup$.passwordErrors.get?.() ?? loginOrSignup$.passwordErrors();
        const pwdMsg = Array.isArray(errs) && errs.length > 0
          ? errs.join('\n')
          : 'Password must be exactly 6 digits and contain only numbers';
        msgs.push(pwdMsg);
      }
      if (msgs.length) showAlert(msgs.join('\n'));
      return;
    }
    await runWithLoading(async () => {
      try {
        const response = await authApi.signup({ name: name!, email: email!, password: password! });
        if (response.status) {
          authState.isSentOtp.set(true);
          loginOrSignup$.isSignup.set(true);
          loginOrSignup$.resendExpiryAt.set(Date.now() + 120_000);
          router.replace({ pathname: '/auth-verify' });
        }
      } catch (error) {
        if (error instanceof ApiError) {
          if (isRateLimitError(error.type)) {
            showGenericError(error);
            return;
          }
          if (['conflict'].includes(error.type)) {
            showAlert('Email already exists');
            return;
          }
          showAlert('Something went wrong try again');
        }
        showAlert('Unexpected error occurred try again');
      }
    }, { message: 'Creating account' });

  }

  const handleForgotPassword = async (event: any) => {
    forgotPassword$.reset();

    const openEmailInputModal = async () => {
      const EmailInput = () => {
        const currentEmail = useValue(forgotPassword$.email);
        const valid = useValue(forgotPassword$.isEmailValid);
        const submitted = useValue(forgotPassword$.submitted);

        return (
          <TextInput
            inputMode='email'
            placeholder="Enter your email"
            value={currentEmail ?? ''}
            onChangeText={(t) => forgotPassword$.email.set(t)}
            textContentType='emailAddress'
            placeholderTextColor="gray"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, !valid && submitted && styles.inputError]}
          />
        );
      };

      const ActionButton = () => (
        <View style={{ alignItems: 'flex-end' }}>
          <Pressable
            style={({ pressed }) => [
              styles.submit,
              { opacity: pressed ? 0.1 : 1 }
            ]}
            onPress={async () => {
              forgotPassword$.submitted.set(true);
              const errors: string[] = [];

              if (!forgotPassword$.isEmailValid.get()) {
                errors.push('Enter a valid email address');
              }

              if (errors.length > 0) {
                showAlert(errors.join('\n'));
                return;
              }

              try {
                const r = await runWithLoading(
                  () => authApi.forgotPassword({
                    email: forgotPassword$.email.get() ?? ''
                  }),
                  { message: 'Sending OTP...' }
                );

                if (r?.status) {
                  forgotPassword$.updateId.set(r.message);
                  forgotPassword$.resendAttempts.set(0);
                  forgotPassword$.resendExpiryAt.set(Date.now() + 120_000);
                  forgotPassword$.submitted.set(false);
                  hideModal();

                  await openOTPVerificationModal(forgotPassword$.email.get() ?? '');
                }
              } catch (err) {
                if (err instanceof ApiError) {
                  if (isRateLimitError(err.type)) {
                    showGenericError(err);
                    return;
                  }
                  if (err.type === 'conflict') showAlert('Email not found');
                  else showAlert('Something went wrong try again');
                } else {
                  showAlert('Unexpected error occurred try again');
                }
              }
            }}
          >
            <ThemedText style={styles.submitText}>Next</ThemedText>
          </Pressable>
        </View>
      );

      await showControllersModal([
        { id: 'emailInput', content: <EmailInput /> },
        { id: 'actBtn', content: <ActionButton /> },
      ], { 
        title: 'Forgot Password', 
        showConfirmButton: false, 
        closeOnBackgroundTap: false,
        onCancel: () => { forgotPassword$.reset(); }
      });
    };

    const openOTPVerificationModal = async (emailToVerify: string) => {
      const VerifyInfo = () => (
        <ThemedText>
          Enter OTP sent to <ThemedText style={{ color: styles.forgotPassword.color }}>{emailToVerify}</ThemedText>
        </ThemedText>
      );

      const Inputs = () => {
        const otp = useValue(forgotPassword$.otp);
        const password = useValue(forgotPassword$.newPassword);
        const submitted = useValue(forgotPassword$.submitted);
        const validOtp = useValue(forgotPassword$.isOtpValid);
        const validPass = useValue(forgotPassword$.isPasswordValid);

        return (
          <View style={{ gap: 10 }}>
            <TextInput
              placeholder="6 digit OTP"
              inputMode='numeric'
              value={otp ?? ''}
              onChangeText={(t) => forgotPassword$.otp.set(t.replace(/[^0-9]/g, ''))}
              placeholderTextColor="gray"
              keyboardType="numeric"
              maxLength={6}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType='oneTimeCode'
              style={[styles.input, submitted && !validOtp && styles.inputError]}
            />
            <TextInput
              placeholder="New 6 digit PIN"
              inputMode='numeric'
              value={password ?? ''}
              onChangeText={(t) => forgotPassword$.newPassword.set(t.replace(/[^0-9]/g, ''))}
              secureTextEntry={true}
              placeholderTextColor="gray"
              keyboardType="numeric"
              maxLength={6}
              textContentType="newPassword"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, submitted && !validPass && styles.inputError]}
            />
          </View>
        );
      };

      const ResendButton = () => {
        const attempts = useValue(forgotPassword$.resendAttempts);
        const cooldown = useValue(forgotPassword$.resendCooldown);
        return (
          <Pressable
            disabled={cooldown > 0 || attempts >= 3}
            onPress={async () => {
              forgotPassword$.otp.set(null);
              const currAttempts = forgotPassword$.resendAttempts.get();
              if (forgotPassword$.resendCooldown.get() > 0 || currAttempts >= 3) return;

              try {
                const r = await authApi.forgotPassword({
                  email: forgotPassword$.email.get() ?? ''
                });
                if (r?.status) {
                  forgotPassword$.updateId.set(r.message);
                  forgotPassword$.resendAttempts.set(currAttempts + 1);
                  forgotPassword$.resendExpiryAt.set(Date.now() + 120_000);
                }
              } catch (err) {
                if (err instanceof ApiError && isRateLimitError(err.type)) {
                  showGenericError(err);
                  return;
                }
                showAlert('Something went wrong try again');
              }
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <ThemedText type="small" style={{ opacity: cooldown > 0 ? 0.5 : 1 }}>
              {attempts >= 3 ? 'Limit reached' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
            </ThemedText>
          </Pressable>
        );
      };

      const ActionButton = () => (
        <View style={{ alignItems: 'flex-end' }}>
          <Pressable
            style={({ pressed }) => [
              styles.submit,
              { opacity: pressed ? 0.1 : 1 }
            ]}
            onPress={async () => {
              forgotPassword$.submitted.set(true);
              const errors: string[] = [];

              const otp = forgotPassword$.otp.get() || '';
              const pass = forgotPassword$.newPassword.get() || '';

              if (otp.length !== 6) {
                errors.push('Enter valid 6-digit OTP');
              }
              if (pass.length !== 6) {
                errors.push('Enter valid 6-digit PIN');
              }

              if (errors.length > 0) {
                showAlert(errors.join('\n'));
                return;
              }

              try {
                const r = await runWithLoading(
                  () => authApi.verifyForgotPassword({
                    updateId: forgotPassword$.updateId.get() ?? '',
                    otp: otp,
                    newPassword: pass
                  }),
                  { message: 'Verifying...' }
                );
                if (r?.status) {
                  hideModal();
                  forgotPassword$.reset();
                  showAlert('Password updated successfully');
                }
              } catch (err) {
                if (err instanceof ApiError) {
                  if (isRateLimitError(err.type)) { showGenericError(err); return; }
                  if (err.type === 'otp_expired') showAlert('OTP expired. Please request a new one.');
                  else if (err.type === 'invalid_otp') showAlert('Invalid code. Please try again.');
                  else if (err.type === 'flow_error') showAlert('Session timeout. Restart the process.');
                  else if (err.type === 'unauthorized') showAlert('Invalid input.');
                  else showAlert('Something went wrong try again');
                } else {
                  showAlert('Unexpected error occurred try again');
                }
              }
            }}
          >
            <ThemedText style={styles.submitText}>Verify</ThemedText>
          </Pressable>
        </View>
      );

      await showControllersModal([
        { id: 'info', content: <VerifyInfo /> },
        { id: 'inputs', content: <Inputs /> },
        { id: 'resend', content: <ResendButton /> },
        { id: 'act', content: <ActionButton /> }
      ], { 
        title: 'Reset Password', 
        showConfirmButton: false, 
        closeOnBackgroundTap: false,
        onCancel: () => { forgotPassword$.reset(); }
      });
    };

    await openEmailInputModal();
  };



  if (method == 'login') {
    if (showQR) {
      return <QRLoginScreen />;
    }
    return (
      <ThemedView style={styles.ctn}>
        {/* <StatusBar style="dark" /> */}
        <View style={styles.container}>
          <View style={styles.mainctn}>
            <ThemedText type="title" selectable={false}>Login</ThemedText>
            {/* <ThemedText>{'\n'}</ThemedText> */}
            <TextInput
              placeholder="Email"
              inputMode='email'
              value={email ?? ""}
              onChangeText={(text) => loginOrSignup$.email.set(text)}
              textContentType='emailAddress'
              placeholderTextColor="gray"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, !isEmailValid && isSubmited && styles.inputError]}
            />


            <TextInput
              placeholder="6 digit PIN"
              inputMode='numeric'
              value={password ?? ""}
              onChangeText={(text) => loginOrSignup$.password.set(text)}
              placeholderTextColor="gray"
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
              textContentType='password'
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, !isLoginPasswordValid && isSubmited && styles.inputError]}
            />

            <Pressable
              style={({ pressed }) => [
                styles.submit,
                { opacity: pressed ? 0.1 : 1 }
              ]}
              onPress={handleLogin}
            >
              <ThemedText style={styles.submitText} selectable={false}>Submit</ThemedText>
            </Pressable>

            <Pressable onPress={handleForgotPassword}>
              <ThemedText type='link' style={styles.forgotPassword} selectable={false}>Forgot Password?</ThemedText>
            </Pressable>




          </View>
        </View>
      </ThemedView>
    )
  }
  if (method == 'signup') {
    return (
      <ThemedView style={styles.ctn}>
        {/* <StatusBar style="dark" /> */}
        <View style={styles.container}>
          <View style={styles.mainctn}>
            <ThemedText type="title" selectable={false}>Signup</ThemedText>
            <TextInput
              placeholder='Name'
              inputMode='text'
              value={name ?? ""}
              onChangeText={(text) => loginOrSignup$.name.set(text)}
              textContentType='name'
              placeholderTextColor='gray'
              autoCapitalize='none'
              autoCorrect={false}
              style={[styles.input, !isNameValid && isSubmited && styles.inputError]}
            />
            <TextInput
              inputMode='email'
              placeholder="Email"
              value={email ?? ""}
              onChangeText={(text) => loginOrSignup$.email.set(text)}
              textContentType='emailAddress'
              placeholderTextColor="gray"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, !isEmailValid && isSubmited && styles.inputError]}
            />
            <TextInput
              placeholder="Set 6 digit PIN"
              inputMode='numeric'
              value={password ?? ""}
              onChangeText={(text) => loginOrSignup$.password.set(text)}
              textContentType='newPassword'
              placeholderTextColor="gray"
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, !isPasswordValid && isSubmited && styles.inputError]}
            />
            <Pressable
              style={({ pressed }) => [
                styles.submit,
                { opacity: pressed ? 0.1 : 1 }
              ]}
              onPress={handleSignup}
            >
              <ThemedText style={styles.submitText} selectable={false}>Submit</ThemedText>
            </Pressable>
          </View>
        </View>
      </ThemedView>
    )
  }
}

const styles = StyleSheet.create((theme) => ({
  ctn: {
    flex: 1,
    padding: 10,
    paddingBottom: 100,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  container: {
    width: {
      xs: 350,
      sm: 350,
      md: 350,
      lg: 550
    },
    height: {
      xs: 270,
      sm: 270,
      md: 270,
      lg: 355
    },
    // backgroundColor:'red',
    borderRadius: 15,
    // borderWidth: 1,
    // borderColor: theme.colors.neutral4,
  },
  mainctn: {
    height: {
      xs: 270,
      sm: 270,
      md: 270,
      lg: 350
    },
    width: {
      xs: 350,
      sm: 350,
      md: 350,
      lg: 450
    },

    padding: 20,
    paddingVertical: 10,
    justifyContent: 'center',
    // backgroundColor: 'rgb(255, 255, 255)',
    gap: 15
  },
  input: {
    height: {
      xs: 40,
      sm: 40,
      md: 40,
      lg: 45
    },
    fontSize: {
      xs: 15,
      sm: 15,
      md: 15,
      lg: 20
    },
    borderColor: {
      xs:theme.colors.neutral2,
      sm:theme.colors.neutral2,
      md:theme.colors.neutral2,
      lg:theme.colors.neutral4,
    },
    borderWidth: 1,
    // justifyContent: 'center',
    ...theme.radii.asymmetric,
    ...theme.padding.asymmetric,
    // marginBottom: 5,
    color: theme.colors.text,
    outline:'none'
    // backgroundColor: 'rgb(255, 255, 255)'
  },
  inputError: {
    borderColor: theme.colors.red,
  },
  submit: {
    height: 60,
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 9999,
    backgroundColor: theme.colors.primary,
  },
  submitText: {
    color: theme.colors.lightbackgroundText,
    fontWeight: 'bold',
    fontSize: 16,
  },
  forgotPassword: {
    color: theme.colors.title
  },
  welcomeText: {
    color: '#2C3E50',
    marginBottom: 10
  },
  qrSubtitle: {
    color: theme.colors.subtitle,
  },
  qrCircle: {
    width: 360,
    height: 360,
    borderRadius: 9999,
    backgroundColor: theme.colors.lightbackgroundText,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    alignSelf: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  tryAgainButton: {
    backgroundColor: theme.colors.icon,
    paddingVertical: 6,
    paddingHorizontal: 40,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tryAgainLabel: {
    color: theme.colors.lightbackgroundText,
    fontSize: 14,
    fontWeight: 'bold',
  }
}));
