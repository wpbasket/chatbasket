import { authApi } from '@/lib/constantLib/authApi/api.auth';
import { qrScanner$ } from '@/state/auth/state.auth.qrScanner';
import { useCallback, useRef } from 'react';

function sanitizeToken(value: string) {
  return value.trim();
}

function tokenPrefix(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function logQRScanner(step: string, data?: Record<string, unknown>) {
  console.log('[QRScanner]', step, data || {});
}

function logQRScannerError(step: string, error: unknown) {
  const err = error as { message?: string; code?: unknown; type?: unknown };
  console.log('[QRScanner]', step, {
    message: err?.message || String(error),
    code: err?.code,
    type: err?.type,
  });
}

export function useQRScanner() {
  const processingRef = useRef(false);
  const completedRef = useRef(false);

  const cleanup = useCallback(() => {
    logQRScanner('cleanup');
  }, []);

  const reset = useCallback(() => {
    processingRef.current = false;
    completedRef.current = false;
    cleanup();
    qrScanner$.set({
      status: 'idle',
      error: null,
      token: null,
      scannerEnabled: true,
      isInQRScanner: qrScanner$.isInQRScanner.get(),
    });
  }, [cleanup]);

  const fail = useCallback((message: string) => {
    if (completedRef.current) return;
    logQRScanner('fail', { message });
    processingRef.current = false;
    cleanup();
    qrScanner$.status.set('error');
    qrScanner$.error.set(message);
  }, [cleanup]);

  const scan = useCallback(async (rawToken: string) => {
    if (processingRef.current) return;
    const prefix = 'chatbasket://qr-login/';
    if (!rawToken.startsWith(prefix)) {
      fail('Invalid QR code. Please scan a ChatBasket login QR.');
      return;
    }
    const tokenPart = rawToken.replace(prefix, '').trim();
    const qrToken = sanitizeToken(tokenPart);
    const SIGNED_TOKEN_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/i;
    if (!qrToken || !SIGNED_TOKEN_REGEX.test(qrToken)) {
      fail('Invalid QR code format. Please scan again.');
      return;
    }

    logQRScanner('scan:start', { token: tokenPrefix(qrToken) });
    processingRef.current = true;
    completedRef.current = false;
    qrScanner$.token.set(qrToken);
    qrScanner$.error.set(null);
    qrScanner$.scannerEnabled.set(false);
    qrScanner$.status.set('scanned');

    try {
      qrScanner$.status.set('connecting');
      qrScanner$.status.set('approving');
      logQRScanner('approve:start');
      await authApi.approveQRLogin({ qr_token: qrToken });
      logQRScanner('approve:done');

      completedRef.current = true;
      qrScanner$.status.set('approved');
      processingRef.current = false;
    } catch (error) {
      logQRScannerError('scan:error', error);
      fail('Could not approve QR login. Please try again.');
    }
  }, [fail]);

  return { scan, reset };
}
