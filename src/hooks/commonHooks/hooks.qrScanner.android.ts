import { authApi } from '@/lib/constantLib/authApi/api.auth';
import { useCallback, useRef, useState } from 'react';
import { RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';

type QRScannerStatus = 'idle' | 'scanned' | 'connecting' | 'approving' | 'approved' | 'error';

type QRDataChannelEvent = {
  type: 'APPROVED';
};

type RTCIceCandidateLike = {
  candidate?: string;
  type?: string;
  protocol?: string;
  address?: string;
  port?: number;
  relatedAddress?: string;
  relatedPort?: number;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  toJSON?: () => unknown;
};

type PeerConnectionWithEvents = RTCPeerConnection & {
  addEventListener(type: 'icegatheringstatechange' | 'iceconnectionstatechange' | 'connectionstatechange' | 'signalingstatechange', listener: () => void): void;
  addEventListener(type: 'icecandidate', listener: (event: { candidate: RTCIceCandidateLike | null }) => void): void;
  addEventListener(type: 'datachannel', listener: (event: { channel: RTCDataChannel }) => void): void;
};

const QR_WEBRTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

function withEvents(pc: RTCPeerConnection) {
  return pc as unknown as PeerConnectionWithEvents;
}

function candidateKey(candidate: string) {
  try {
    const parsed = JSON.parse(candidate) as { candidate?: string; sdpMid?: string; sdpMLineIndex?: number };
    return `${parsed.candidate || ''}|${parsed.sdpMid || ''}|${parsed.sdpMLineIndex ?? ''}`;
  } catch {
    return candidate;
  }
}

function candidateSummary(candidate: RTCIceCandidateLike) {
  return {
    type: candidate.type,
    protocol: candidate.protocol,
    address: candidate.address,
    port: candidate.port,
    relatedAddress: candidate.relatedAddress,
    relatedPort: candidate.relatedPort,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    length: candidate.candidate?.length || 0,
  };
}

async function addRemoteCandidates(pc: RTCPeerConnection, candidates: string[] | undefined, seen: Set<string>) {
  if (!pc.remoteDescription) {
    logQRScanner('candidate:remote:skipped:no-remote-description', { count: candidates?.length || 0 });
    return;
  }
  for (const candidate of candidates || []) {
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    const parsed = JSON.parse(candidate) as RTCIceCandidateLike;
    logQRScanner('candidate:remote:add', candidateSummary(parsed));
    await pc.addIceCandidate(parsed);
  }
}

function waitForIceGatheringComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      logQRScanner('peer:icegathering:timeout', { state: pc.iceGatheringState });
      resolve();
    }, 5000);
    withEvents(pc).addEventListener('icegatheringstatechange', () => {
      logQRScanner('peer:icegatheringstatechange', { state: pc.iceGatheringState });
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

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

function createPeerConnection() {
  return new RTCPeerConnection(QR_WEBRTC_CONFIG);
}

export function useQRScanner() {
  const [status, setStatus] = useState<QRScannerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const processingRef = useRef(false);
  const completedRef = useRef(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const appliedCandidateKeysRef = useRef(new Set<string>());

  const cleanup = useCallback(() => {
    logQRScanner('cleanup');
    channelRef.current?.close();
    channelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    appliedCandidateKeysRef.current.clear();
  }, []);

  const reset = useCallback(() => {
    processingRef.current = false;
    completedRef.current = false;
    cleanup();
    setStatus('idle');
    setError(null);
    setToken(null);
  }, [cleanup]);

  const fail = useCallback((message: string) => {
    if (completedRef.current) return;
    logQRScanner('fail', { message });
    processingRef.current = false;
    cleanup();
    setStatus('error');
    setError(message);
  }, [cleanup]);

  const scan = useCallback(async (rawToken: string) => {
    if (processingRef.current) return;
    const qrToken = sanitizeToken(rawToken);
    if (!qrToken) {
      fail('Invalid QR code. Please scan again.');
      return;
    }

    logQRScanner('scan:start', { token: tokenPrefix(qrToken) });
    processingRef.current = true;
    completedRef.current = false;
    setToken(qrToken);
    setError(null);
    setStatus('scanned');

    try {
      setStatus('connecting');
      logQRScanner('offer:fetch:start', { token: tokenPrefix(qrToken) });
      const offer = await authApi.signalQRLogin({ qr_token: qrToken, role: 'mobile', sdp: '' });
      logQRScanner('offer:fetch:done', { hasSdp: Boolean(offer.sdp), sdpLength: offer.sdp?.length || 0 });
      if (!offer.sdp) {
        fail('Browser offer was not found. Please refresh the QR code and scan again.');
        return;
      }

      logQRScanner('peer:create');
      const pc = createPeerConnection();
      const pcEvents = withEvents(pc);
      pcRef.current = pc;
      pcEvents.addEventListener('icecandidate', (event) => {
        if (!event.candidate) {
          logQRScanner('candidate:local:complete');
          return;
        }
        const candidate = typeof event.candidate.toJSON === 'function' ? event.candidate.toJSON() as RTCIceCandidateLike : event.candidate;
        logQRScanner('candidate:local', candidateSummary(candidate as RTCIceCandidateLike));
        void authApi.signalQRLogin({
          qr_token: qrToken,
          role: 'mobile',
          sdp: '',
          candidate: JSON.stringify(candidate),
        })
          .then(() => logQRScanner('candidate:local:sent'))
          .catch((error) => logQRScannerError('candidate:local:send:error', error));
      });
      pcEvents.addEventListener('datachannel', (event) => {
        logQRScanner('datachannel:received', { label: event.channel.label, readyState: event.channel.readyState });
        event.channel.onopen = () => logQRScanner('datachannel:open', { readyState: event.channel.readyState });
        event.channel.onerror = () => logQRScanner('datachannel:error', { readyState: event.channel.readyState });
        event.channel.onclose = () => logQRScanner('datachannel:close', { readyState: event.channel.readyState });
        channelRef.current = event.channel;
      });
      pcEvents.addEventListener('iceconnectionstatechange', () => {
        logQRScanner('peer:iceconnectionstatechange', { state: pc.iceConnectionState });
        if (['failed', 'disconnected'].includes(pc.iceConnectionState)) {
          logQRScanner('peer:optional-datachannel-unavailable', { state: pc.iceConnectionState });
        }
      });
      pcEvents.addEventListener('connectionstatechange', () => {
        logQRScanner('peer:connectionstatechange', { state: pc.connectionState });
      });
      pcEvents.addEventListener('signalingstatechange', () => {
        logQRScanner('peer:signalingstatechange', { state: pc.signalingState });
      });

      logQRScanner('peer:setRemoteDescription:start');
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offer.sdp }));
      await addRemoteCandidates(pc, offer.candidates, appliedCandidateKeysRef.current);
      logQRScanner('peer:setRemoteDescription:done', { remoteCandidates: offer.candidates?.length || 0 });
      const answer = await pc.createAnswer();
      logQRScanner('peer:createAnswer:done', { sdpLength: answer.sdp?.length || 0 });
      await pc.setLocalDescription(answer);
      logQRScanner('peer:setLocalDescription:done', { iceGatheringState: pc.iceGatheringState });
      await waitForIceGatheringComplete(pc);
      logQRScanner('peer:icegathering:after-wait', { state: pc.iceGatheringState });
      const answerSdp = pc.localDescription?.sdp || answer.sdp || '';
      logQRScanner('answer:send:start', { sdpLength: answerSdp.length });
      await authApi.signalQRLogin({ qr_token: qrToken, role: 'mobile', sdp: answerSdp });
      const latestOffer = await authApi.signalQRLogin({ qr_token: qrToken, role: 'mobile', sdp: '' });
      await addRemoteCandidates(pc, latestOffer.candidates, appliedCandidateKeysRef.current);
      logQRScanner('answer:send:done', { remoteCandidates: latestOffer.candidates?.length || 0 });

      setStatus('approving');
      logQRScanner('approve:start');
      await authApi.approveQRLogin({ qr_token: qrToken });
      logQRScanner('approve:done');

      const approval: QRDataChannelEvent = { type: 'APPROVED' };
      if (channelRef.current?.readyState === 'open') {
        channelRef.current.send(JSON.stringify(approval));
        logQRScanner('datachannel:approval:sent');
      } else {
        logQRScanner('datachannel:approval:skipped', { readyState: channelRef.current?.readyState || 'missing' });
      }

      completedRef.current = true;
      setStatus('approved');
      processingRef.current = false;
    } catch (error) {
      logQRScannerError('scan:error', error);
      fail('Could not approve QR login. Please keep both devices on the same network and try again.');
    }
  }, [fail]);

  return {
    status,
    error,
    token,
    scan,
    reset,
  };
}
