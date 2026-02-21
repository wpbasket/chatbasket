/**
 * WebSocket Client Manager for ChatBasket
 *
 * Manages a persistent WebSocket connection to the backend for real-time chat events.
 * Uses React Native's built-in WebSocket global — no additional packages needed.
 *
 * Architecture:
 * - Server pushes events (new_message, delivery_ack, read_receipt, unsend, delete_for_me)
 * - Client is read-only — all mutations go through REST
 * - Automatic reconnection with exponential backoff
 * - Auth via query params (sessionId + userId) on the WS URL
 */
import { Platform } from 'react-native';
import { authState } from '@/state/auth/state.auth';
import { Url } from '@/lib/constantLib/constants/constants';

// ─── Types ──────────────────────────────────────────────────────────────────

export type WSEventType =
    | 'new_message'
    | 'delivery_ack'
    | 'read_receipt'
    | 'unsend'
    | 'delete_for_me'
    | 'sync_action';

export interface WSEvent {
    type: WSEventType;
    payload: any;
}

export type WSEventHandler = (event: WSEvent) => void;

// ─── Connection State ───────────────────────────────────────────────────────

export type WSConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// ─── Config ─────────────────────────────────────────────────────────────────

const WS_RECONNECT_BASE_DELAY = 1000;   // 1 second
const WS_RECONNECT_MAX_DELAY = 30000;   // 30 seconds
const WS_RECONNECT_MAX_ATTEMPTS = Infinity; // Never stop trying
const WS_PING_INTERVAL = 25000;         // 25 seconds (server expects within 30+10)

// ─── WebSocket Client Manager ───────────────────────────────────────────────

class WSClientManager {
    private ws: WebSocket | null = null;
    private handlers: Set<WSEventHandler> = new Set();
    private reconnectAttempts = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private intentionalClose = false;
    private _state: WSConnectionState = 'disconnected';

    // ── Public API ────────────────────────────────────────────────────────

    /** Current connection state */
    get state(): WSConnectionState {
        return this._state;
    }

    /**
     * Connect to the WebSocket server.
     * Safe to call multiple times — will no-op if already connected/connecting.
     */
    connect(): void {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const wsUrl = this.buildWSUrl();
        if (!wsUrl) {
            console.warn('[WS Client] Cannot connect: missing auth or base URL');
            return;
        }

        this.intentionalClose = false;
        this._state = 'connecting';

        try {
            this.ws = new WebSocket(wsUrl);
            this.setupEventHandlers();
        } catch (err) {
            console.error('[WS Client] Connection error:', err);
            this.scheduleReconnect();
        }
    }

    /**
     * Gracefully disconnect. Will NOT auto-reconnect after this.
     */
    disconnect(): void {
        this.intentionalClose = true;
        this.cleanup();
        this._state = 'disconnected';
    }

    /**
     * Subscribe to all WebSocket events.
     * Returns an unsubscribe function.
     */
    subscribe(handler: WSEventHandler): () => void {
        this.handlers.add(handler);
        return () => {
            this.handlers.delete(handler);
        };
    }

    /**
     * Check if the WebSocket is currently connected.
     */
    get isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    // ── Internal ──────────────────────────────────────────────────────────

    private buildWSUrl(): string | null {
        const baseUrl = Url.BASE_API_URL;
        if (!baseUrl) return null;

        // Convert http(s) to ws(s)
        const wsBase = baseUrl
            .replace(/^https:\/\//, 'wss://')
            .replace(/^http:\/\//, 'ws://')
            .replace(/\/+$/, '');

        // On web, cookies handle auth automatically — no need for query params.
        const isWeb = Platform.OS === 'web';
        if (isWeb) {
            return `${wsBase}/api/personal/chat/ws`;
        }

        // On mobile, pass auth as query params since WebSocket doesn't support custom headers.
        const sessionId = authState.sessionId.get();
        const userId = authState.userId.get();
        if (!sessionId || !userId) return null;
        return `${wsBase}/api/personal/chat/ws?token=${encodeURIComponent(sessionId)}:${encodeURIComponent(userId)}`;
    }

    private setupEventHandlers(): void {
        if (!this.ws) return;

        this.ws.onopen = () => {
            this._state = 'connected';
            this.reconnectAttempts = 0;
            this.startPing();
        };

        this.ws.onmessage = (event: MessageEvent) => {
            const raw = event.data as string;
            console.log(`[WS Client] 📩 RAW MESSAGE received (${raw.length} chars): ${raw}`);
            try {
                const data: WSEvent = JSON.parse(raw);
                this.dispatchEvent(data);
            } catch (err) {
                console.error('[WS Client] ❌ PARSE ERROR:', err);
            }
        };

        this.ws.onerror = () => { };

        this.ws.onclose = (event: CloseEvent) => {
            this.stopPing();
            this.ws = null;

            if (!this.intentionalClose) {
                this._state = 'reconnecting';
                this.scheduleReconnect();
            } else {
                this._state = 'disconnected';
            }
        };
    }

    private dispatchEvent(event: WSEvent): void {
        console.log(`[WS Client] 📤 DISPATCHING event: type=${event.type}`);
        for (const handler of this.handlers) {
            try {
                handler(event);
            } catch (err) {
                console.error(`[WS Client] ❌ handler ERROR for ${event.type}:`, err);
            }
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= WS_RECONNECT_MAX_ATTEMPTS) {
            this._state = 'disconnected';
            return;
        }

        const delay = Math.min(
            WS_RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
            WS_RECONNECT_MAX_DELAY
        );

        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }

    private startPing(): void {
        this.stopPing();
        this.pingTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send('ping');
                } catch (err) {
                    // onclose handler will trigger reconnect
                }
            }
        }, WS_PING_INTERVAL);
    }

    private stopPing(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    private cleanup(): void {
        this.stopPing();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            try {
                this.ws.close(1000, 'client disconnect');
            } catch (err) {
                // Already closed
            }
            this.ws = null;
        }
        this.reconnectAttempts = 0;
    }
}

// ─── Singleton Export ───────────────────────────────────────────────────────

export const wsClient = new WSClientManager();
