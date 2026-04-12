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
import { Pressable, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export default function Auth() {
  const { method } = useLocalSearchParams();
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
    return (
      <ThemedView style={styles.ctn}>
        {/* <StatusBar style="dark" /> */}
        <View style={styles.container}>
          <View style={styles.mainctn}>
            <ThemedText type="title" >Login</ThemedText>
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
              <ThemedText type='link' style={styles.forgotPassword}>Forgot Password?</ThemedText>
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
            <ThemedText type="title">Signup</ThemedText>
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
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopRightRadius: 25,
    paddingHorizontal: 15,
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
  }
}));
