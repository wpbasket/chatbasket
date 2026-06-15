import { ThemedText } from '@/components/ui/common/ThemedText';
import { useQRLogin } from '@/hooks/commonHooks/hooks.qrLogin';
import { Pressable, ScrollView, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

function getStatusText(status: string) {
  switch (status) {
    case 'loading':
      return 'Creating secure QR login...';
    case 'waiting':
      return 'Scan with ChatBasket mobile and approve login.';
    case 'answering':
      return 'Connecting browser and mobile...';
    case 'approved':
      return 'Approved. Signing you in...';
    case 'done':
      return 'Login complete.';
    case 'error':
      return 'QR login failed.';
    default:
      return 'Preparing QR login...';
  }
}

export function QRLoginScreen() {
  const { token, expiresAt, status, error, retry } = useQRLogin();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 24,
        padding: 24,
      }}
    >
      <View style={{ gap: 8, alignItems: 'center' }}>
        <ThemedText type="logo" style={{ fontSize: 44, lineHeight: 48 }}>
          ChatBasket
        </ThemedText>
        <ThemedText type="title" style={{ textAlign: 'center' }}>
          Login with QR
        </ThemedText>
      </View>

      <View
        style={{
          width: 300,
          minHeight: 300,
          borderRadius: 24,
          borderCurve: 'continuous',
          backgroundColor: 'white',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.12)',
        }}
      >
        {token ? (
          <QRCode
            value={token}
            size={240}
            color="#000000"
            backgroundColor="#FFFFFF"
            ecl="M"
            quietZone={12}
          />
        ) : (
          <ThemedText type="defaultSemiBold" style={{ textAlign: 'center' }}>
            Creating QR...
          </ThemedText>
        )}
      </View>

      <View style={{ gap: 8, alignItems: 'center', maxWidth: 420 }}>
        <ThemedText type="defaultSemiBold" style={{ textAlign: 'center' }} selectable>
          {getStatusText(status)}
        </ThemedText>
        {expiresAt ? (
          <ThemedText style={{ textAlign: 'center', opacity: 0.7 }} selectable>
            Expires at {new Date(expiresAt).toLocaleTimeString()}
          </ThemedText>
        ) : null}
        {error ? (
          <ThemedText style={{ textAlign: 'center', color: '#B00020' }} selectable>
            {error}
          </ThemedText>
        ) : null}
      </View>

      {status === 'error' ? (
        <Pressable
          onPress={() => void retry()}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            borderRadius: 999,
            backgroundColor: '#111111',
            paddingHorizontal: 24,
            paddingVertical: 14,
          })}
        >
          <ThemedText style={{ color: 'white', fontWeight: '700' }}>
            Try again
          </ThemedText>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
