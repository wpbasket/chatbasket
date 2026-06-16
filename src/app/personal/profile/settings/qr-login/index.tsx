import Header from '@/components/header/Header';
import { ThemedText } from '@/components/ui/common/ThemedText';
import { ThemedView } from '@/components/ui/common/ThemedView';
import Sidebar from '@/components/sidebar/Sidebar';
import { ThemedViewWithSidebar } from '@/components/ui/common/ThemedViewWithSidebar';
import { useQRScanner } from '@/hooks/commonHooks/hooks.qrScanner';
import { qrScanner$ } from '@/state/auth/state.auth.qrScanner';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useValue } from '@legendapp/state/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppButton } from '@/components/ui/common/AppButton';

export default function QRLoginScannerScreen() {
  const { rt, theme } = useUnistyles();
  const [permission, requestPermission] = useCameraPermissions();
  const { scan, reset } = useQRScanner();
  const status = useValue(qrScanner$.status);
  const error = useValue(qrScanner$.error);
  const scannerEnabled = useValue(qrScanner$.scannerEnabled);
  const cameraSizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    reset();
    return () => {
      reset();
      qrScanner$.isInQRScanner.set(false);
    };
  }, [reset]);

  const handleScan = useCallback((result: BarcodeScanningResult) => {
    if (!scannerEnabled || status !== 'idle') return;

    // Enforce that the entire QR code must be inside the 280x280 centered viewfinder box
    const { cornerPoints, bounds } = result;
    const { width, height } = cameraSizeRef.current;
    const viewfinderSize = 280;

    if (width > 0 && height > 0) {
      const left = (width - viewfinderSize) / 2;
      const top = (height - viewfinderSize) / 2;
      const right = left + viewfinderSize;
      const bottom = top + viewfinderSize;

      if (cornerPoints && cornerPoints.length > 0) {
        const isInsideViewfinder = cornerPoints.every(
          (pt) => pt.x >= left && pt.x <= right && pt.y >= top && pt.y <= bottom
        );
        if (!isInsideViewfinder) {
          return; // Ignore scans outside the viewfinder
        }
      } else if (bounds) {
        const isInsideViewfinder =
          bounds.origin.x >= left &&
          bounds.origin.y >= top &&
          (bounds.origin.x + bounds.size.width) <= right &&
          (bounds.origin.y + bounds.size.height) <= bottom;
        if (!isInsideViewfinder) {
          return; // Ignore scans outside the viewfinder
        }
      }
    }

    void scan(result.data);
  }, [scan, scannerEnabled, status]);

  const goBack = () => {
    router.back();
  };

  if (Platform.OS === 'web') {
    return (
      <ThemedViewWithSidebar>
        <ThemedViewWithSidebar.Sidebar>
          <Sidebar />
        </ThemedViewWithSidebar.Sidebar>
        <ThemedViewWithSidebar.Main style={styles.mainContainer}>
          <Stack.Screen options={{ headerShown: false }} />
          <ThemedView style={{ paddingTop: rt.insets.top, zIndex: 1, backgroundColor: theme.colors.background }}>
            <Header onBackPress={goBack} centerSection={<ThemedText type="subtitle">QR Login</ThemedText>} />
          </ThemedView>
          <ThemedView style={styles.container}>
            <ThemedView style={[styles.flex1, { marginTop: -20 }]}>
              <ThemedView style={styles.webContainer}>
                <ThemedText type="defaultSemiBold" style={{ textAlign: 'center' }}>QR scanner is available on mobile only.</ThemedText>
              </ThemedView>
            </ThemedView>
          </ThemedView>
        </ThemedViewWithSidebar.Main>
      </ThemedViewWithSidebar>
    );
  }

  const renderContent = () => {
    if (!permission?.granted) {
      return (
        <ThemedView style={styles.centerContainer}>
          <Ionicons name="camera-outline" size={80} color={theme.colors.neutral4} />
          <ThemedText style={styles.permissionText}>Camera permission is required to scan QR login codes.</ThemedText>
          <AppButton
            label="Allow Camera"
            onPress={requestPermission}
            pressedOpacity={0.1}
            labelStyle={{ fontSize: 22 }}
            style={{ paddingLeft: 24, paddingRight: 48 }}
          />
        </ThemedView>
      );
    }

    if (status === 'connecting' || status === 'approving') {
      return (
        <ThemedView style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <ThemedText type="subtitle" style={styles.loadingTitle}>
            {status === 'connecting' ? 'Connecting...' : 'Approving Login...'}
          </ThemedText>
          <ThemedText style={styles.subtitleText}>
            Establishing secure session
          </ThemedText>
        </ThemedView>
      );
    }

    if (status === 'approved') {
      return (
        <ThemedView style={styles.centerContainer}>
          <View style={styles.successIconOuter}>
            <Ionicons name="checkmark-circle" size={80} color="#10b981" />
          </View>
          <ThemedText type="subtitle" style={styles.successTitle}>
            Login Approved!
          </ThemedText>
          <ThemedText style={styles.subtitleText}>
            You have successfully authorized the login session. You can now close this screen.
          </ThemedText>
          <AppButton
            label="Close"
            onPress={goBack}
            pressedOpacity={0.1}
            labelStyle={{ fontSize: 22, color: theme.colors.errorText }}
            style={{ paddingLeft: 24, paddingRight: 48 }}
          />
        </ThemedView>
      );
    }

    if (status === 'error') {
      return (
        <ThemedView style={styles.centerContainer}>
          <View style={styles.errorIconOuter}>
            <Ionicons name="alert-circle" size={80} color="#ef4444" />
          </View>
          <ThemedText type="subtitle" style={styles.errorTitle}>
            Login Failed
          </ThemedText>
          <ThemedText style={styles.subtitleText}>
            {error || 'An unexpected error occurred. Please try again.'}
          </ThemedText>
          <AppButton
            label="Try Again"
            onPress={reset}
            pressedOpacity={0.1}
            labelStyle={{ fontSize: 22 }}
            style={{ paddingLeft: 24, paddingRight: 48 }}
          />
        </ThemedView>
      );
    }

    // Default 'idle' state (Camera active)
    return (
      <ThemedView style={styles.scannerContainer}>
        <View style={styles.cameraWrapper}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScan}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              cameraSizeRef.current = { width, height };
            }}
          />
          {/* Viewfinder overlay */}
          <View style={styles.overlayContainer} pointerEvents="none">
            <View style={styles.overlayMask} />
            <View style={styles.viewfinderFrame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
          </View>
        </View>
        <ThemedView style={styles.instructionsContainer}>
          <ThemedText style={styles.instructionsText}>
            Scan the QR code shown on the login page.
          </ThemedText>
        </ThemedView>
      </ThemedView>
    );
  };

  return (
    <ThemedViewWithSidebar>
      <ThemedViewWithSidebar.Sidebar>
        <Sidebar />
      </ThemedViewWithSidebar.Sidebar>
      <ThemedViewWithSidebar.Main style={styles.mainContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ThemedView style={{ paddingTop: rt.insets.top, zIndex: 1, backgroundColor: theme.colors.background }}>
          <Header onBackPress={goBack} centerSection={<ThemedText type="subtitle">QR Login</ThemedText>} />
        </ThemedView>
        <ThemedView style={styles.container}>
          <ThemedView style={[styles.flex1, { marginTop: -20 }]}>
            {renderContent()}
          </ThemedView>
        </ThemedView>
      </ThemedViewWithSidebar.Main>
    </ThemedViewWithSidebar>
  );
}

const styles = StyleSheet.create((theme) => ({
  mainContainer: {
    flex: 1,
    gap: 20,
  },
  container: {
    flex: 1,
    gap: 20,
    paddingHorizontal: 0,
  },
  flex1: {
    flex: 1,
    gap: 15,
  },
  webContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  scannerContainer: {
    flex: 1,
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayMask: {
    position: 'absolute',
    width: 1480, // 280 + 2 * 600
    height: 1480,
    borderRadius: 624, // 24 + 600
    borderWidth: 600,
    borderColor: 'rgba(0, 0, 0, 0.6)',
  },
  viewfinderFrame: {
    width: 280,
    height: 280,
    position: 'relative',
    // backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#00bb77',
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
    borderTopLeftRadius: 24,
  },
  topRight: {
    top: 0,
    right: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderTopRightRadius: 24,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 24,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 24,
  },
  permissionText: {
    textAlign: 'center',
    fontSize: 16,
    color: theme.colors.textSecondary,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  loadingTitle: {
    marginTop: 8,
    fontWeight: 'bold',
  },
  successTitle: {
    color: '#10b981',
    fontWeight: 'bold',
  },
  errorTitle: {
    color: theme.colors.errorText,
    fontWeight: 'bold',
  },
  subtitleText: {
    textAlign: 'center',
    fontSize: 15,
    color: theme.colors.textSecondary,
    paddingHorizontal: 24,
    lineHeight: 22,
    marginBottom: 16,
  },
  instructionsContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionsText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  successIconOuter: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 999,
    padding: 16,
  },
  errorIconOuter: {
    backgroundColor: theme.colors.errorBackground,
    borderRadius: 999,
    padding: 16,
  },
}));
