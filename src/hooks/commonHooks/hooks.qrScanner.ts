import { useCallback, useState } from 'react';

type QRScannerStatus = 'idle' | 'scanned' | 'connecting' | 'approving' | 'approved' | 'error';

export function useQRScanner() {
  const [status, setStatus] = useState<QRScannerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setToken(null);
  }, []);

  const scan = useCallback(async (rawToken: string) => {
    setToken(rawToken.trim() || null);
    setStatus('error');
    setError('QR scanner is available on mobile only.');
  }, []);

  return {
    status,
    error,
    token,
    scan,
    reset,
  };
}
