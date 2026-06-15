import { authApi } from '@/lib/constantLib/authApi/api.auth';
import { Url } from '@/lib/constantLib/constants/constants';
import { setSession } from '@/lib/storage/commonStorage/storage.auth';
import { setAppMode } from '@/state/appMode/state.appMode';
import { router } from 'expo-router';
import type { QRCallbackResponse, SessionResponse } from '@/lib/constantLib';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

type QRLoginStatus = 'idle' | 'loading' | 'waiting' | 'answering' | 'approved' | 'done' | 'error';

type QRWebSocketEvent = {
  type?: string;
  event?: string;
};

const QR_WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

function getEventType(event: QRWebSocketEvent) {
  return event.type || event.event;
}

function waitForWebSocketOpen(ws: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('QR WebSocket failed'));
    ws.onclose = () => reject(new Error('QR WebSocket closed'));
  });
}

function candidateKey(candidate: string) {
  try {
    const parsed = JSON.parse(candidate) as { candidate?: string; sdpMid?: string; sdpMLineIndex?: number };
    return `${parsed.candidate || ''}|${parsed.sdpMid || ''}|${parsed.sdpMLineIndex ?? ''}`;
  } catch {
    return candidate;
  }
}

async function addRemoteCandidates(pc: RTCPeerConnection, candidates: string[] | undefined, seen: Set<string>) {
  if (!pc.remoteDescription) return;
  for (const candidate of candidates || []) {
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
  }
}

function waitForIceGatheringComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 5000);
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        resolve();
      }
    };
  });
}

function buildQRWebSocketUrl(token: string) {
  const base = (Url.BASE_API_URL || '').replace(/\/+$/, '');
  const url = new URL('/api/auth/qr/ws', base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  return url.toString();
}

function createPeerConnection() {
  if (Platform.OS !== 'web') {
    throw new Error('QR login is available on web only');
  }
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('WebRTC is not supported in this browser');
  }
  return new RTCPeerConnection(QR_WEBRTC_CONFIG);
}

function normalizeQRSession(response: QRCallbackResponse): SessionResponse {
  return {
    userId: response.AuthUser?.ID || '',
    name: response.AuthUser?.Name || '',
    email: response.AuthUser?.Email || '',
    sessionId: response.SessionID || '',
    sessionExpiry: response.SessionExpiry || '',
    isPrimary: true,
  };
}

export function useQRLogin() {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [status, setStatus] = useState<QRLoginStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedCandidateKeysRef = useRef(new Set<string>());
  const completedRef = useRef(false);
  const closedByCleanupRef = useRef(false);

  const cleanup = useCallback(() => {
    closedByCleanupRef.current = true;
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    appliedCandidateKeysRef.current.clear();
  }, []);

  const fail = useCallback((message: string) => {
    if (completedRef.current) return;
    setStatus('error');
    setError(message);
    cleanup();
  }, [cleanup]);

  const finishLogin = useCallback(async (qrToken: string) => {
    if (completedRef.current) return;
    completedRef.current = true;
    setStatus('approved');
    try {
      const session = normalizeQRSession(await authApi.callbackQRLogin({ qr_token: qrToken }));
      await setSession(session);
      setAppMode('personal');
      setStatus('done');
      router.replace('/personal/home');
    } catch {
      completedRef.current = false;
      fail('Could not finish QR login. Please try again.');
    }
  }, [fail]);

  const fetchAnswer = useCallback(async (qrToken: string) => {
    const pc = pcRef.current;
    if (!pc) return;
    setStatus('answering');
    try {
      const answer = await authApi.signalQRLogin({ qr_token: qrToken, role: 'browser', sdp: '' });
      if (answer.sdp && !pc.remoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer.sdp }));
      }
      await addRemoteCandidates(pc, answer.candidates, appliedCandidateKeysRef.current);
      if (!answer.sdp) {
        setStatus('waiting');
        return;
      }
      setStatus('waiting');
    } catch {
      fail('Could not connect both devices. Please keep them on the same network and try again.');
    }
  }, [fail]);

  const handleEvent = useCallback((qrToken: string, event: QRWebSocketEvent) => {
    const eventType = getEventType(event);
    switch (eventType) {
      case 'signal':
      case 'ANSWER_SAVED':
        void fetchAnswer(qrToken);
        break;
      case 'approve':
      case 'APPROVED':
        void finishLogin(qrToken);
        break;
      case 'OFFER_SAVED':
        break;
      default:
        console.log('Unknown QR login event', eventType);
    }
  }, [fetchAnswer, finishLogin]);

  const start = useCallback(async () => {
    cleanup();
    closedByCleanupRef.current = false;
    completedRef.current = false;
    setError(null);
    setStatus('loading');
    try {
      const initiated = await authApi.initiateQRLogin();
      const expiresInMs = initiated.expires_in * 1000;
      setToken(initiated.qr_token);
      setExpiresAt(new Date(Date.now() + expiresInMs).toISOString());
      expiryTimerRef.current = setTimeout(() => {
        fail('QR code expired. Please try again.');
      }, expiresInMs);

      const pc = createPeerConnection();
      pcRef.current = pc;
      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        void authApi.signalQRLogin({
          qr_token: initiated.qr_token,
          role: 'browser',
          sdp: '',
          candidate: JSON.stringify(event.candidate.toJSON()),
        }).catch(() => undefined);
      };
      pc.oniceconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.iceConnectionState)) {
          console.log('QR WebRTC connection state', pc.iceConnectionState);
        }
      };

      const channel = pc.createDataChannel('qr-login');
      channelRef.current = channel;
      channel.onmessage = (message) => {
        try {
          const event = JSON.parse(String(message.data)) as QRWebSocketEvent;
          if (getEventType(event) === 'APPROVED' || getEventType(event) === 'approve') {
            void finishLogin(initiated.qr_token);
          }
        } catch {
          console.log('Unknown QR data channel message', message.data);
        }
      };

      const ws = new WebSocket(buildQRWebSocketUrl(initiated.qr_token));
      wsRef.current = ws;
      await waitForWebSocketOpen(ws);
      setStatus('waiting');
      ws.onmessage = (message) => {
        try {
          handleEvent(initiated.qr_token, JSON.parse(String(message.data)) as QRWebSocketEvent);
        } catch {
          console.log('Unknown QR websocket message', message.data);
        }
      };
      ws.onerror = () => fail('QR WebSocket failed. Please try again.');
      ws.onclose = () => {
        if (!completedRef.current && !closedByCleanupRef.current) {
          setStatus((current) => current === 'done' || current === 'approved' ? current : 'error');
          setError('QR connection closed. Please try again.');
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc);
      await authApi.signalQRLogin({ qr_token: initiated.qr_token, role: 'browser', sdp: pc.localDescription?.sdp || offer.sdp || '' });
    } catch {
      fail('Could not start QR login. Please try again.');
    }
  }, [cleanup, fail, finishLogin, handleEvent]);

  useEffect(() => {
    void start();
    return cleanup;
  }, [cleanup, start]);

  return {
    token,
    expiresAt,
    status,
    error,
    retry: start,
  };
}
