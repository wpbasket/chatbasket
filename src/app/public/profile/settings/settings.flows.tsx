import { ThemedText } from '@/components/ui/common/ThemedText';
import { ApiError } from '@/lib/constantLib';
import { setUserInStorage } from '@/lib/storage/commonStorage/storage.auth';
import { authState } from '@/state/auth/state.auth';
import { useValue } from '@legendapp/state/react';
import { setting$ } from '@/state/settings/state.setting';
import { showGenericError } from '@/utils/commonUtils/util.error';
import { runWithLoading, showAlert } from '@/utils/commonUtils/util.modal';
import React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { SettingsStyles } from '@/app/personal/profile/settings/settings.styles';

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

    // --- EMAIL UPDATE FLOW ---
    const editEmail = async (event: any) => {
        setting$.reset();
        const position = {
            x: event?.nativeEvent?.pageX ?? 0,
            y: event?.nativeEvent?.pageY ?? 0,
        };

        const openRequestModal = async () => {
            const RequestInputs = () => {
                const currentEmail = useValue(setting$.email);
                const valid = useValue(setting$.isEmailValid);
                const submitted = useValue(setting$.submitted);
                const password = useValue(setting$.currentPassword);

                return (
                    <View style={{ gap: 10 }}>
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
                        <TextInput
                            placeholder="Current Password (6 digits)"
                            secureTextEntry
                            value={password ?? ''}
                            onChangeText={t => setting$.currentPassword.set(t.replace(/[^0-9]/g, ''))}
                            placeholderTextColor="gray"
                            keyboardType="numeric"
                            maxLength={6}
                            autoCapitalize="none"
                            style={[styles.modalInput, submitted && !password && styles.inputError]}
                        />
                    </View>
                );
            };

            const NextButton = () => (
                <View style={styles.actionRightRow}>
                    <Pressable
                        style={({ pressed }) => [styles.modalPillButton, { opacity: pressed ? 0.1 : 1 }]}
                        onPress={async () => {
                            try {
                                setting$.submitted.set(true);
                                const errors: string[] = [];

                                if (!setting$.isEmailValid.get()) {
                                    errors.push('Enter a valid email address');
                                }
                                const currPass = setting$.currentPassword.get() || '';
                                if (currPass.length !== 6) {
                                    errors.push('Current password must be 6 digits');
                                }

                                if (errors.length > 0) {
                                    showAlert(errors.join('\n'));
                                    return;
                                }

                                const r: any = await runWithLoading(
                                    () => settingApi.requestEmailUpdate({
                                        newEmail: setting$.email.get() ?? '',
                                        password: setting$.currentPassword.get() ?? ''
                                    }),
                                    { message: 'Requesting Update' }
                                );

                                if (r?.status) {
                                    setting$.updateId.set(r.message);
                                    setting$.resendAttempts.set(0);
                                    setting$.resendExpiryAt.set(Date.now() + COOLDOWN_MS);
                                    hideModal();
                                    setting$.submitted.set(false);

                                    await openEmailVerifyFlow(setting$.email.get() ?? '');
                                }
                            } catch (err) {
                                if (err instanceof ApiError) {
                                    if (err.type === 'conflict') showAlert('This email is already in use.');
                                    else if (err.type === 'invalid_password') showAlert('Incorrect password. If you forgot, change password.');
                                    else if (err.type === 'unauthorized') showAlert('Incorrect password.');
                                    else showGenericError(err);
                                } else {
                                    showGenericError(err);
                                }
                            }
                        }}
                        onPressIn={handlePressIn}
                    >
                        <ThemedText style={styles.modalActionText}>Next</ThemedText>
                    </Pressable>
                </View>
            );

            await showControllersModal([
                { id: 'reqInputs', content: <RequestInputs /> },
                { id: 'actBtn', content: <NextButton /> },
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
                        onChangeText={(t) => setting$.otp.set(t.replace(/[^0-9]/g, ''))}
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

            const ResendButton = () => {
                const attempts = useValue(setting$.resendAttempts);
                const cooldown = useValue(setting$.resendCooldown);
                return (
                    <Pressable
                        disabled={cooldown > 0 || attempts >= MAX_RESENDS}
                        onPress={async () => {
                            setting$.otp.set('');
                            const currAttempts = setting$.resendAttempts.get();
                            if (setting$.resendCooldown.get() > 0 || currAttempts >= MAX_RESENDS) return;

                            try {
                                const r: any = await settingApi.requestEmailUpdate({
                                    newEmail: setting$.email.get() ?? '',
                                    password: setting$.currentPassword.get() ?? ''
                                });
                                if (r?.status) {
                                    setting$.updateId.set(r.message);
                                    setting$.resendAttempts.set(currAttempts + 1);
                                    setting$.resendExpiryAt.set(Date.now() + COOLDOWN_MS);
                                }
                            } catch (err) {
                                showGenericError(err);
                            }
                        }}
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                    >
                        <ThemedText type="small" style={{ opacity: cooldown > 0 ? 0.5 : 1 }}>
                            {attempts >= MAX_RESENDS ? 'Limit reached' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                        </ThemedText>
                    </Pressable>
                )
            }

            const ActionButton = () => (
                <View style={styles.actionRightRow}>
                    <Pressable
                        style={({ pressed }) => [styles.modalActionButton, { opacity: pressed ? 0.1 : 1 }]}
                        onPress={async () => {
                            try {
                                setting$.submitted.set(true);
                                const errors: string[] = [];

                                const otp = setting$.otp.get() || '';
                                if (otp.length !== 6) {
                                    errors.push('Enter valid 6-digit OTP');
                                }

                                if (errors.length > 0) {
                                    showAlert(errors.join('\n'));
                                    return;
                                }

                                const r: any = await runWithLoading(
                                    () => settingApi.confirmEmailUpdate({
                                        updateId: setting$.updateId.get() ?? '',
                                        otp: otp
                                    }),
                                    { message: 'Verifying' }
                                );
                                if (r?.status) {
                                    hideModal();
                                    authState.user.email.set(setting$.email.get() ?? '');
                                    setUserInStorage();
                                    setting$.reset();
                                    showAlert('Email updated successfully');
                                }
                            } catch (err) {
                                if (err instanceof ApiError) {
                                    if (err.type === 'otp_expired') showAlert('OTP expired. Please request a new one.');
                                    else if (err.type === 'invalid_otp') showAlert('Invalid code. Please try again.');
                                    else if (err.type === 'flow_error') showAlert('Session timeout. Restart the process.');
                                    else if (err.type === 'unauthorized') showAlert('Invalid input.');
                                    else showGenericError(err);
                                } else {
                                    showGenericError(err);
                                }
                            }
                        }}
                        onPressIn={handlePressIn}
                    >
                        <ThemedText style={styles.modalActionText}>Verify</ThemedText>
                    </Pressable>
                </View>
            )

            await showControllersModal([
                { id: 'verifyInfo', content: <VerifyInfo /> },
                { id: 'emailOtpInput', content: <VerifyInput /> },
                { id: 'resendBtn', content: <ResendButton /> },
                { id: 'actionBtn', content: <ActionButton /> }
            ], { title: 'Verify Email', position, showConfirmButton: false, closeOnBackgroundTap: false });
        };

        await openRequestModal();
    };

    // --- PASSWORD FLOW ---
    const editPassword = async (event: any) => {
        setting$.reset();
        const position = {
            x: event?.nativeEvent?.pageX ?? 0,
            y: event?.nativeEvent?.pageY ?? 0,
        };

        const openPasswordConfirmModal = async () => {
            const OtpInfo = () => {
                const email = useValue(currentEmail$);
                return (
                    <ThemedText>
                        OTP sent to <ThemedText style={styles.primaryText}>{email}</ThemedText>
                    </ThemedText>
                );
            };

            const Inputs = () => {
                const otp = useValue(setting$.otp);
                const password = useValue(setting$.password);
                const submitted = useValue(setting$.submitted);
                const validOtp = useValue(setting$.isOtpValid);
                const validPass = useValue(setting$.isPasswordValid);

                return (
                    <View style={{ gap: 10 }}>
                        <TextInput
                            placeholder="6 digit OTP"
                            inputMode='numeric'
                            value={otp ?? ''}
                            onChangeText={(t) => setting$.otp.set(t.replace(/[^0-9]/g, ''))}
                            placeholderTextColor="gray"
                            keyboardType="numeric"
                            maxLength={6}
                            style={[styles.modalInput, submitted && !validOtp && styles.inputError]}
                        />
                        <TextInput
                            placeholder="New 6 digit PIN"
                            inputMode='numeric'
                            value={password ?? ''}
                            onChangeText={(t) => setting$.password.set(t.replace(/[^0-9]/g, ''))}
                            secureTextEntry
                            placeholderTextColor="gray"
                            keyboardType="numeric"
                            maxLength={6}
                            style={[styles.modalInput, submitted && !validPass && styles.inputError]}
                        />
                    </View>
                )
            }

            const ResendButton = () => {
                const attempts = useValue(setting$.resendAttempts);
                const cooldown = useValue(setting$.resendCooldown);
                return (
                    <Pressable
                        disabled={cooldown > 0 || attempts >= MAX_RESENDS}
                        onPress={async () => {
                            setting$.otp.set('');
                            const currAttempts = setting$.resendAttempts.get();
                            if (setting$.resendCooldown.get() > 0 || currAttempts >= MAX_RESENDS) return;
                            try {
                                const r: any = await settingApi.requestUpdateOTP({ updateType: 'password_update' });
                                if (r?.status) {
                                    setting$.updateId.set(r.message);
                                    setting$.resendAttempts.set(currAttempts + 1);
                                    setting$.resendExpiryAt.set(Date.now() + COOLDOWN_MS);
                                }
                            } catch (err) { showGenericError(err); }
                        }}
                        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                    >
                        <ThemedText type="small" style={{ opacity: cooldown > 0 ? 0.5 : 1 }}>
                            {attempts >= MAX_RESENDS ? 'Limit reached' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                        </ThemedText>
                    </Pressable>
                );
            }

            const ActionButton = () => (
                <View style={styles.actionRightRow}>
                    <Pressable
                        style={({ pressed }) => [styles.modalActionButton, { opacity: pressed ? 0.1 : 1 }]}
                        onPress={async () => {
                            setting$.submitted.set(true);
                            const errors: string[] = [];

                            const otp = setting$.otp.get() || '';
                            const pass = setting$.password.get() || '';

                            if (otp.length !== 6) {
                                errors.push('Invalid OTP (must be 6 digits)');
                            }
                            if (pass.length !== 6) {
                                errors.push('Invalid Password (must be 6 digits)');
                            }

                            if (errors.length > 0) {
                                showAlert(errors.join('\n'));
                                return;
                            }

                            try {
                                const r: any = await runWithLoading(
                                    () => settingApi.confirmPasswordUpdate({
                                        updateId: setting$.updateId.get() ?? '',
                                        otp: otp,
                                        newPassword: pass
                                    }),
                                    { message: 'Updating Password' }
                                );
                                if (r?.status) {
                                    hideModal();
                                    setting$.reset();
                                    showAlert('Password updated successfully');
                                }
                            } catch (err) {
                                if (err instanceof ApiError) {
                                    if (err.type === 'otp_expired') showAlert('OTP expired. Please request a new one.');
                                    else if (err.type === 'invalid_otp') showAlert('Invalid code. Please try again.');
                                    else if (err.type === 'flow_error') showAlert('Session timeout. Restart the process.');
                                    else if (err.type === 'unauthorized') showAlert('Invalid input.');
                                    else showGenericError(err);
                                } else {
                                    showGenericError(err);
                                }
                            }
                        }}
                        onPressIn={handlePressIn}
                    >
                        <ThemedText style={styles.modalActionText}>Update</ThemedText>
                    </Pressable>
                </View>
            )

            await showControllersModal([
                { id: 'info', content: <OtpInfo /> },
                { id: 'inputs', content: <Inputs /> },
                { id: 'resend', content: <ResendButton /> },
                { id: 'act', content: <ActionButton /> }
            ], { title: 'Change Password', position, showConfirmButton: false, closeOnBackgroundTap: false });
        };

        try {
            const sent: any = await runWithLoading(
                () => settingApi.requestUpdateOTP({ updateType: 'password_update' }),
                { message: 'Sending OTP...' }
            );
            if (sent?.status) {
                setting$.updateId.set(sent.message);
                setting$.resendAttempts.set(0);
                setting$.resendExpiryAt.set(Date.now() + COOLDOWN_MS);

                await openPasswordConfirmModal();
            }
        } catch (err) {
            showGenericError(err);
        }
    };

    return { editEmail, editPassword };
}
