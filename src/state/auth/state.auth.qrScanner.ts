import { observable } from '@legendapp/state';

type QRScannerStatus = 'idle' | 'scanned' | 'connecting' | 'approving' | 'approved' | 'error';

export const qrScanner$ = observable({
  status: 'idle' as QRScannerStatus,
  error: null as string | null,
  token: null as string | null,
  scannerEnabled: true,
  isInQRScanner: false,
});
