import { authApi } from '@/lib/constantLib/authApi/api.auth';
import { Url } from '@/lib/constantLib/constants/constants';
import { loginOrSignup$ } from '@/state/auth/state.auth.loginOrSignup';
import { useCallback, useEffect, useRef } from 'react';


type QRWebSocketEvent = {
  type?: string;
  event?: string;
};

function getEventType(event: QRWebSocketEvent) {
  return event.type || event.event;
}

function tokenPrefix(value: string) {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
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

function buildQRWebSocketUrl(token: string) {
  const base = (Url.BASE_API_URL || '').replace(/\/+$/, '');
  const url = new URL('/api/auth/qr/ws', base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  return url.toString();
}

const qr$ = loginOrSignup$.qr;

export function useQRLogin() {
  const wsRef = useRef<WebSocket | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishingLoginRef = useRef(false);
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
  }, []);

  const fail = useCallback((message: string) => {
    if (completedRef.current) return;
    logQRLogin('fail', { message });
    qr$.status.set('error');
    qr$.error.set(message);
    cleanup();
  }, [cleanup]);

  const finishLogin = useCallback(async (qrToken: string) => {
    if (completedRef.current || finishingLoginRef.current) return;
    finishingLoginRef.current = true;
    qr$.status.set('approved');
    try {
      logQRLogin('callback:start', { token: tokenPrefix(qrToken) });
      const session = await authApi.callbackQRLogin({ qr_token: qrToken });
      logQRLogin('callback:done', { hasUserId: Boolean(session.userId), hasSessionId: Boolean(session.sessionId) });
      completedRef.current = true;
      qr$.status.set('done');
      qr$.session.set(session);
    } catch (error) {
      logQRLoginError('callback:error', error);
      fail('Could not finish QR login. Please try again.');
    } finally {
      finishingLoginRef.current = false;
    }
  }, [fail]);

  const handleEvent = useCallback((qrToken: string, event: QRWebSocketEvent) => {
    const eventType = getEventType(event);
    logQRLogin('ws:event', { eventType });
    switch (eventType) {
      case 'approve':
      case 'APPROVED':
        void finishLogin(qrToken);
        break;
      default:
        console.log('Unknown QR login event', eventType);
    }
  }, [finishLogin]);

  const start = useCallback(async () => {
    cleanup();
    qr$.token.set(null);
    qr$.expiresAt.set(null);
    qr$.error.set(null);
    qr$.status.set('loading');
    qr$.session.set(null);
    closedByCleanupRef.current = false;
    completedRef.current = false;
    
    try {
      logQRLogin('initiate:start');
      const initiated = await authApi.initiateQRLogin();
      logQRLogin('initiate:done', { token: tokenPrefix(initiated.qr_token), expiresIn: initiated.expires_in });
      const expiresInMs = initiated.expires_in * 1000;
      qr$.token.set(initiated.qr_token);
      qr$.expiresAt.set(new Date(Date.now() + expiresInMs).toISOString());
      expiryTimerRef.current = setTimeout(() => {
        fail('QR code expired. Please try again.');
      }, expiresInMs);

      const wsUrl = buildQRWebSocketUrl(initiated.qr_token);
      logQRLogin('ws:connect:start', { url: wsUrl.replace(initiated.qr_token, tokenPrefix(initiated.qr_token)) });
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      await waitForWebSocketOpen(ws);
      logQRLogin('ws:connect:open');
      qr$.status.set('waiting');
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
          const current = qr$.status.get();
          if (current !== 'done' && current !== 'approved') {
            qr$.status.set('error');
          }
          qr$.error.set('QR connection closed. Please try again.');
        }
      };
    } catch (error) {
      logQRLoginError('start:error', error);
      fail('Could not start QR login. Please try again.');
    }
  }, [cleanup, fail, handleEvent]);

  useEffect(() => {
    void start();
    return cleanup;
  }, [cleanup, start]);

  return { retry: start };
}
