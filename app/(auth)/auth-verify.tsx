import { Platform, Pressable, TextInput, View } from 'react-native'
import { StyleSheet } from 'react-native-unistyles'
import { ThemedView } from '@/components/ui/common/ThemedView'
import { ThemedText } from '@/components/ui/common/ThemedText'
import { runWithLoading, showAlert } from '@/utils/modal.util'

import { loginOrSignup$ } from '@/state/auth/loginOrSignup.state'
import { useLegend$ } from '@/hooks/useLegend'
import { useEffect } from 'react'
import { useResendCooldown } from '@/utils/resendCooldown.util'
import { authState } from '@/state/auth/auth.state'
import { router } from 'expo-router'
import { authApi } from '@/lib/publicLib/api/authApi/api.auth'
import { setSession } from '@/lib/storage/auth.storage'
import { getUser } from '@/utils/profile.util'
import { ApiError } from '@/lib/publicLib/api'

export default function AuthVerification() {
    const otp = useLegend$(loginOrSignup$.otp)
    const isOtpValid = useLegend$(loginOrSignup$.isOtpValid)
    const email = useLegend$(loginOrSignup$.email)
    const isSubmited = useLegend$(loginOrSignup$.submitted)
    const isSignup = useLegend$(loginOrSignup$.isSignup)
    const isSentOtp = useLegend$(authState.isSentOtp)
    const resendCooldown = useLegend$(loginOrSignup$.resendCooldown)
    const resendAttempts = useLegend$(loginOrSignup$.resendAttempts)
    const resendExpiryAt = useLegend$(loginOrSignup$.resendExpiryAt)
    const MAX_RESENDS = 3

    useEffect(() => {
        // Reset isSentOtp, email, and password when this component unmounts (route change, back, etc)
        return () => {
            authState.isSentOtp.set(false)
            loginOrSignup$.email.set(null)
            loginOrSignup$.password.set(null)
            loginOrSignup$.name.set(null)
            loginOrSignup$.otp.set(null)
            loginOrSignup$.submitted.set(false)
            loginOrSignup$.isSignup.set(false)
            loginOrSignup$.resendCooldown.set(0)
            loginOrSignup$.resendAttempts.set(0)
            loginOrSignup$.resendExpiryAt.set(null)
        }
    }, [])

    // Reuse shared cooldown ticker (expiry set in auth.tsx)
    useResendCooldown(loginOrSignup$)

    const handleOtp = async () => {
        loginOrSignup$.submitted.set(true)
        if (!isOtpValid) {
            showAlert('Enter a valid 6 digit OTP');
            return;
        }
        if (email == null) {
            showAlert('Timeout.')
            return router.back()
        }

        await runWithLoading(async () => {
            try {
                const platform = Platform.select({ ios: 'native', android: 'native', web: 'web' })
                if (isSignup) {
                    const response = await authApi.AuthVerificationSignup({ email: email!, secret: otp!, platform: platform! });
                    setSession(response.sessionId, response.userId, response.sessionExpiry)
                    // Fire-and-forget user fetch so root layout can update when ready
                    void getUser()

                }
                else {
                    const response = await authApi.AuthVerificationLogin({ email: email!, secret: otp!, platform: platform! });
                    setSession(response.sessionId, response.userId, response.sessionExpiry)
                    // Fire-and-forget user fetch so root layout can update when ready
                    void getUser()
                }
            } catch (error) {
                if (error instanceof ApiError) {
                    if (['unauthorized'].includes(error.type)) {
                        showAlert('Invalid OTP');
                        return;
                    }
                    else {
                        showAlert('Something went wrong try again');
                    }
                } else {
                    showAlert('Unexpected error occurred try again');
                }
            }
        }, { message: 'Verifying' })
    }

    const handleResendOtp = async () => {
        if (loginOrSignup$.resendCooldown.get() > 0) return
        if (loginOrSignup$.resendAttempts.get() >= MAX_RESENDS) {
            showAlert('Resend limit reached. Please wait or try again later.')
            return
        }
        try {
            const response = await authApi.login({ email: loginOrSignup$.email.get()!, password: loginOrSignup$.password.get()! })
            if (response.status) {
                showAlert('OTP sent successfully')
                authState.isSentOtp.set(true)
                loginOrSignup$.resendExpiryAt.set(Date.now() + 120_000)
                loginOrSignup$.resendAttempts.set(loginOrSignup$.resendAttempts.get() + 1)
            }
        } catch (error) {
            if (error instanceof ApiError) {
                if (['unauthorized'].includes(error.type)) {
                    showAlert('Invalid OTP');
                    return;
                }
                else {
                    showAlert('Something went wrong try again');
                }
            } else {
                showAlert('Unexpected error occurred try again');
            }
        }
    }


    return (
        <ThemedView style={styles.ctn}>
            <View style={styles.container}>
                <View style={styles.mainctn}>
                    {/* <ThemedText type="title" color='#2C3E50'>Verification</ThemedText> */}
                    <ThemedText color='gray' >Enter the OTP sent to your email</ThemedText>
                    <TextInput
                        placeholder="6 digit OTP"
                        inputMode='numeric'
                        maxLength={6}
                        value={otp ?? ''}
                        onChangeText={(text) => loginOrSignup$.otp.set(text)}
                        textContentType='oneTimeCode'
                        placeholderTextColor="gray"
                        keyboardType="numeric"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={[styles.input, !isOtpValid && isSubmited && styles.inputError]}
                    />
                    <Pressable
                        style={({ pressed }) => [
                            styles.submit,
                            { opacity: pressed ? 0.7 : 1 },
                        ]}
                        onPress={handleOtp}
                    >
                        <ThemedText style={styles.submitText} selectable={false}>Submit</ThemedText>
                    </Pressable>
                    <Pressable
                        style={({ pressed }) => [
                            styles.resendPressable,
                            { opacity: pressed || resendCooldown > 0 || resendAttempts >= MAX_RESENDS ? 0.6 : 1 },
                        ]}
                        disabled={resendCooldown > 0 || resendAttempts >= MAX_RESENDS}
                        onPress={handleResendOtp}
                    >
                        <ThemedText type='link' style={styles.resendOtp}>
                            {resendAttempts >= MAX_RESENDS
                                ? 'Resend OTP (limit reached)'
                                : resendCooldown > 0
                                    ? `Resend OTP (${Math.floor(resendCooldown / 60)}:${String(resendCooldown % 60).padStart(2, '0')})`
                                    : `Resend OTP (${MAX_RESENDS - resendAttempts} left)`}
                        </ThemedText>
                    </Pressable>
                </View>
            </View>
        </ThemedView>
    )
}

const styles = StyleSheet.create((theme) => ({
    ctn: {
        flex: 1,
        padding: 10,
        paddingBottom: 100,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: 'white',
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
            lg: 270
        },
        borderRadius: 15,
        // borderWidth: 1,
        // borderColor: theme.colors.neutral4,
    },
    mainctn: {
        height: {
            xs: 270,
            sm: 270,
            md: 270,
            lg: 270
        },
        width: {
            xs: 350,
            sm: 350,
            md: 350,
            lg: 450
        },

        // borderRadius: 10,
        // borderColor: theme.colors.neutral,
        // borderWidth: 1,
        padding: 20,
        paddingVertical: 10,
        // backgroundColor: 'rgb(255, 255, 255)',
        gap: 10,
        justifyContent: 'center'
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
        borderTopLeftRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
        borderTopRightRadius: 25,
        paddingHorizontal: 10,
        marginBottom: 10,
        color: '#2C3E50',
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
    resendPressable: {
        alignSelf: 'flex-start',
    },
    resendOtp: {
        color: '#2C3E50'
    }
}))