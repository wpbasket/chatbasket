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

type RTCIceCandidateLike = RTCIceCandidate & {
  type?: string;
  protocol?: string;
  address?: string;
  port?: number;
  relatedAddress?: string;
  relatedPort?: number;
};

const QR_WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

function getEventType(event: QRWebSocketEvent) {
  return event.type || event.event;
}

function tokenPrefix(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
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

function logQRLogin(step: string, data?: Record<string, unknown>) {
  console.log('[QRLogin]', step, data || {});
}

function logQRLoginError(step: string, error: unknown) {
  const err = error as { message?: string; code?: unknown; type?: unknown };
  console.log('[QRLogin]', step, {
    message: err?.message || String(error),
    code: err?.code,
    type: err?.type,
  });
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
  let added = 0;
  for (const candidate of candidates || []) {
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    const parsed = new RTCIceCandidate(JSON.parse(candidate));
    logQRLogin('candidate:remote:add', candidateSummary(parsed as RTCIceCandidateLike));
    await pc.addIceCandidate(parsed);
    added += 1;
  }
  return added;
}

function waitForIceGatheringComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      logQRLogin('peer:icegathering:timeout', { state: pc.iceGatheringState });
      resolve();
    }, 5000);
    pc.onicegatheringstatechange = () => {
      logQRLogin('peer:icegatheringstatechange', { state: pc.iceGatheringState });
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        resolve();
      }
    };
  });
}

function waitForDataChannelOpen(channel: RTCDataChannel | null, timeoutMs = 3000) {
  if (!channel) {
    return Promise.resolve(false);
  }
  if (channel.readyState === 'open') {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const existingOnOpen = channel.onopen;
    const timeout = setTimeout(() => {
      channel.onopen = existingOnOpen;
      logQRLogin('datachannel:open:timeout', { readyState: channel.readyState });
      resolve(channel.readyState === 'open');
    }, timeoutMs);
    channel.onopen = (event) => {
      existingOnOpen?.call(channel, event);
      clearTimeout(timeout);
      resolve(true);
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
  const pendingRemoteCandidatesRef = useRef<string[]>([]);
  const answerFetchInFlightRef = useRef(false);
  const completedRef = useRef(false);
  const closedByCleanupRef = useRef(false);

  const cleanup = useCallback(() => {
    logQRLogin('cleanup');
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
    pendingRemoteCandidatesRef.current = [];
    answerFetchInFlightRef.current = false;
  }, []);

  const fail = useCallback((message: string) => {
    if (completedRef.current) return;
    logQRLogin('fail', { message });
    setStatus('error');
    setError(message);
    cleanup();
  }, [cleanup]);

  const finishLogin = useCallback(async (qrToken: string, waitForChannel = true) => {
    if (completedRef.current) return;
    completedRef.current = true;
    setStatus('approved');
    try {
      if (waitForChannel) {
        const opened = await waitForDataChannelOpen(channelRef.current);
        logQRLogin('datachannel:pre-callback-wait:done', { opened, readyState: channelRef.current?.readyState || 'missing' });
      }
      logQRLogin('callback:start', { token: tokenPrefix(qrToken) });
      const session = normalizeQRSession(await authApi.callbackQRLogin({ qr_token: qrToken }));
      logQRLogin('callback:done', { hasUserId: Boolean(session.userId), hasSessionId: Boolean(session.sessionId) });
      await setSession(session);
      setAppMode('personal');
      setStatus('done');
      router.replace('/personal/home');
    } catch (error) {
      logQRLoginError('callback:error', error);
      completedRef.current = false;
      fail('Could not finish QR login. Please try again.');
    }
  }, [fail]);

  const fetchAnswer = useCallback(async (qrToken: string) => {
    const pc = pcRef.current;
    if (!pc || answerFetchInFlightRef.current) return;
    answerFetchInFlightRef.current = true;
    setStatus('answering');
    try {
      logQRLogin('answer:fetch:start', { token: tokenPrefix(qrToken) });
      const answer = await authApi.signalQRLogin({ qr_token: qrToken, role: 'browser', sdp: '' });
      logQRLogin('answer:fetch:done', { hasSdp: Boolean(answer.sdp), sdpLength: answer.sdp?.length || 0, candidates: answer.candidates?.length || 0 });
      if (answer.candidates?.length) {
        pendingRemoteCandidatesRef.current = [...pendingRemoteCandidatesRef.current, ...answer.candidates];
        logQRLogin('candidate:remote:queued', { count: pendingRemoteCandidatesRef.current.length });
      }
      if (answer.sdp && !pc.remoteDescription) {
        logQRLogin('peer:setRemoteDescription:start', { type: 'answer' });
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer.sdp }));
        logQRLogin('peer:setRemoteDescription:done', { type: 'answer' });
      }
      if (pc.remoteDescription && pendingRemoteCandidatesRef.current.length) {
        const pending = pendingRemoteCandidatesRef.current;
        pendingRemoteCandidatesRef.current = [];
        const added = await addRemoteCandidates(pc, pending, appliedCandidateKeysRef.current);
        logQRLogin('candidate:remote:flush', { queued: pending.length, added });
      }
      setStatus('waiting');
    } catch (error) {
      logQRLoginError('answer:fetch:error', error);
      fail('Could not connect both devices. Please keep them on the same network and try again.');
    } finally {
      answerFetchInFlightRef.current = false;
    }
  }, [fail]);

  const handleEvent = useCallback((qrToken: string, event: QRWebSocketEvent) => {
    const eventType = getEventType(event);
    logQRLogin('ws:event', { eventType });
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
      logQRLogin('initiate:start');
      const initiated = await authApi.initiateQRLogin();
      logQRLogin('initiate:done', { token: tokenPrefix(initiated.qr_token), expiresIn: initiated.expires_in });
      const expiresInMs = initiated.expires_in * 1000;
      setToken(initiated.qr_token);
      setExpiresAt(new Date(Date.now() + expiresInMs).toISOString());
      expiryTimerRef.current = setTimeout(() => {
        fail('QR code expired. Please try again.');
      }, expiresInMs);

      const pc = createPeerConnection();
      logQRLogin('peer:create', { config: QR_WEBRTC_CONFIG });
      pcRef.current = pc;
      pc.onicecandidate = (event) => {
        if (!event.candidate) {
          logQRLogin('candidate:local:complete');
          return;
        }
        logQRLogin('candidate:local', candidateSummary(event.candidate as RTCIceCandidateLike));
        void authApi.signalQRLogin({
          qr_token: initiated.qr_token,
          role: 'browser',
          sdp: '',
          candidate: JSON.stringify(event.candidate.toJSON()),
        })
          .then(() => logQRLogin('candidate:local:sent'))
          .catch((error) => logQRLoginError('candidate:local:send:error', error));
      };
      pc.oniceconnectionstatechange = () => {
        logQRLogin('peer:iceconnectionstatechange', { state: pc.iceConnectionState });
      };
      pc.onconnectionstatechange = () => {
        logQRLogin('peer:connectionstatechange', { state: pc.connectionState });
      };
      pc.onsignalingstatechange = () => {
        logQRLogin('peer:signalingstatechange', { state: pc.signalingState });
      };

      const channel = pc.createDataChannel('qr-login');
      channelRef.current = channel;
      logQRLogin('datachannel:create', { label: channel.label, readyState: channel.readyState });
      channel.onopen = () => logQRLogin('datachannel:open', { readyState: channel.readyState });
      channel.onerror = () => logQRLogin('datachannel:error', { readyState: channel.readyState });
      channel.onclose = () => logQRLogin('datachannel:close', { readyState: channel.readyState });
      channel.onmessage = (message) => {
        logQRLogin('datachannel:message', { length: String(message.data).length });
        try {
          const event = JSON.parse(String(message.data)) as QRWebSocketEvent;
          if (getEventType(event) === 'APPROVED' || getEventType(event) === 'approve') {
            void finishLogin(initiated.qr_token, false);
          }
        } catch {
          console.log('Unknown QR data channel message', message.data);
        }
      };

      const wsUrl = buildQRWebSocketUrl(initiated.qr_token);
      logQRLogin('ws:connect:start', { url: wsUrl.replace(initiated.qr_token, tokenPrefix(initiated.qr_token)) });
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      await waitForWebSocketOpen(ws);
      logQRLogin('ws:connect:open');
      setStatus('waiting');
      ws.onmessage = (message) => {
        try {
          handleEvent(initiated.qr_token, JSON.parse(String(message.data)) as QRWebSocketEvent);
        } catch {
          console.log('Unknown QR websocket message', message.data);
        }
      };
      ws.onerror = () => {
        logQRLogin('ws:error');
        fail('QR WebSocket failed. Please try again.');
      };
      ws.onclose = (event) => {
        logQRLogin('ws:close', { code: event.code, reason: event.reason, wasClean: event.wasClean, completed: completedRef.current, cleanup: closedByCleanupRef.current });
        if (!completedRef.current && !closedByCleanupRef.current) {
          setStatus((current) => current === 'done' || current === 'approved' ? current : 'error');
          setError('QR connection closed. Please try again.');
        }
      };

      const offer = await pc.createOffer();
      logQRLogin('offer:create:done', { sdpLength: offer.sdp?.length || 0 });
      await pc.setLocalDescription(offer);
      logQRLogin('offer:setLocalDescription:done', { iceGatheringState: pc.iceGatheringState });
      await waitForIceGatheringComplete(pc);
      const offerSdp = pc.localDescription?.sdp || offer.sdp || '';
      logQRLogin('offer:send:start', { sdpLength: offerSdp.length });
      await authApi.signalQRLogin({ qr_token: initiated.qr_token, role: 'browser', sdp: offerSdp });
      logQRLogin('offer:send:done');
    } catch (error) {
      logQRLoginError('start:error', error);
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
