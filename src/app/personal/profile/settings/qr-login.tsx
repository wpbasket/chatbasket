import Header from '@/components/header/Header';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import { useQRScanner } from '@/hooks/commonHooks/hooks.qrScanner';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { router, Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

function statusText(status: string) {
  switch (status) {
    case 'scanned':
      return 'QR code scanned.';
    case 'connecting':
      return 'Connecting to browser...';
    case 'approving':
      return 'Approving browser login...';
    case 'approved':
      return 'Browser login approved.';
    case 'error':
      return 'QR login failed.';
    default:
      return 'Scan the QR code shown on the web login page.';
  }
}

export default function QRLoginScannerScreen() {
  const { rt } = useUnistyles();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerEnabled, setScannerEnabled] = useState(true);
  const qrScanner = useQRScanner();

  const handleScan = useCallback((result: BarcodeScanningResult) => {
    if (!scannerEnabled || qrScanner.status !== 'idle') return;
    setScannerEnabled(false);
    void qrScanner.scan(result.data);
  }, [qrScanner, scannerEnabled]);

  const retry = () => {
    qrScanner.reset();
    setScannerEnabled(true);
  };

  const goBack = () => {
    router.back();
  };

  if (Platform.OS === 'web') {
    return (
      <ThemedView style={{ flex: 1, paddingTop: rt.insets.top }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header onBackPress={goBack} centerSection={<ThemedText type="subtitle">QR Login</ThemedText>} />
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
          <ThemedText type="defaultSemiBold" style={{ textAlign: 'center' }}>QR scanner is available on mobile only.</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, paddingTop: rt.insets.top }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header onBackPress={goBack} centerSection={<ThemedText type="subtitle">QR Login</ThemedText>} />
      <View style={{ flex: 1, padding: 16, gap: 16 }}>
        {!permission?.granted ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
            <ThemedText type="defaultSemiBold" style={{ textAlign: 'center' }}>Camera permission is required to scan QR login codes.</ThemedText>
            <Pressable
              onPress={requestPermission}
              style={{ alignSelf: 'center', backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 }}
            >
              <ThemedText style={{ color: '#FFFFFF' }}>Allow Camera</ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={{ flex: 1, overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: '#E5E7EB' }}>
              {scannerEnabled && qrScanner.status === 'idle' ? (
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={handleScan}
                />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                  <ThemedText type="defaultSemiBold" style={{ textAlign: 'center' }}>{statusText(qrScanner.status)}</ThemedText>
                </View>
              )}
            </View>
            <View style={{ gap: 8 }}>
              <ThemedText type="defaultSemiBold" style={{ textAlign: 'center' }}>{statusText(qrScanner.status)}</ThemedText>
              {qrScanner.token ? (
                <ThemedText selectable style={{ textAlign: 'center', opacity: 0.7 }}>{qrScanner.token}</ThemedText>
              ) : null}
              {qrScanner.error ? (
                <ThemedText selectable style={{ color: '#DC2626', textAlign: 'center' }}>{qrScanner.error}</ThemedText>
              ) : null}
              {qrScanner.status === 'error' || qrScanner.status === 'approved' ? (
                <Pressable
                  onPress={retry}
                  style={{ alignSelf: 'center', backgroundColor: '#111827', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 }}
                >
                  <ThemedText style={{ color: '#FFFFFF' }}>Scan Again</ThemedText>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </View>
    </ThemedView>
  );
}
