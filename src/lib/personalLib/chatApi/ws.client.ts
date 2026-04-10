import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { authState } from '@/state/auth/state.auth';
import { Url } from '@/lib/constantLib/constants/constants';
import { ApiError } from '@/lib/constantLib/models/model.api';

// ─── Types ──────────────────────────────────────────────────────────────────

export type WSEventType =
    | 'new_message'
    | 'delivery_ack'
    | 'read_receipt'
    | 'unsend'
    | 'delete_for_me'
    | 'sync_action'
    | string; // Allow for dynamic response types like 'send_message_response'

export interface WSEvent {
    type: WSEventType;
    payload: any;
    ref?: string;   // Correlation ID for bidirectional calls
    error?: {       // Server-side error details
        code: number;
        type: string;
        message: string;
    };
}

export type WSEventHandler = (event: WSEvent) => void;

// ─── Connection State ───────────────────────────────────────────────────────

export type WSConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// ─── Config ─────────────────────────────────────────────────────────────────

const WS_RECONNECT_BASE_DELAY = 1000;   // 1 second
const WS_RECONNECT_MAX_DELAY = 30000;   // 30 seconds
const WS_RECONNECT_MAX_ATTEMPTS = Infinity; // Never stop trying
const WS_PING_INTERVAL = 25000;         // 25 seconds (server expects within 30+10)
const WS_REQUEST_TIMEOUT = 10000;       // 10 seconds timeout for send() calls

// ─── WebSocket Client Manager ───────────────────────────────────────────────

class WSClientManager {
    private ws: WebSocket | null = null;
    private handlers: Set<WSEventHandler> = new Set();
    private reconnectAttempts = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private intentionalClose = false;
    private _networkOnline = true;
    private _state: WSConnectionState = 'disconnected';

    /** Map of correlation ID -> Promise callbacks */
    private pendingRequests: Map<string, {
        resolve: (value: any) => void;
        reject: (reason: any) => void;
        timeout: ReturnType<typeof setTimeout>;
        type: string;
    }> = new Map();

    /** Callbacks for reconnection events */
    private reconnectSubscribers: Set<() => void> = new Set();

    /** Ping timer — keeps the connection alive on mobile (prevents NAT/firewall silent drops) */
    private pingTimer: ReturnType<typeof setInterval> | null = null;

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
        // Preserve 'reconnecting' state so onopen can detect reconnection
        if (this._state !== 'reconnecting') {
            this._state = 'connecting';
        }

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
     * Notify the client of changes in device connectivity.
     * Force-closes the socket when offline to prevent "ghost connections".
     */
    setNetworkOnline(isOnline: boolean): void {
        this._networkOnline = isOnline;

        if (!isOnline) {
            // Kill the socket immediately when offline. 
            // We don't set intentionalClose=true because we WANT to reconnect when back online.
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            if (this.ws) {
                try {
                    this.ws.close(4001, 'network_offline');
                } catch (err) {
                    // Already closed
                }
            }
        } else {
            // Re-connect when back online
            if (this._state === 'reconnecting' || this._state === 'disconnected') {
                this.reconnectAttempts = 0; // Reset backoff on network recovery
                this.connect();
            }
        }
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
     * Subscribe to successful reconnection events.
     * Useful for triggering "catch-up" syncs.
     */
    onReconnect(handler: () => void): () => void {
        this.reconnectSubscribers.add(handler);
        return () => {
            this.reconnectSubscribers.delete(handler);
        };
    }

    get isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    /**
     * Send a request to the server and wait for a correlated response.
     *
     * @param type The action name (e.g., 'send_message')
     * @param payload The data to send
     * @param signal Optional AbortSignal to cancel the request
     */
    async send<T>(type: string, payload: any, signal?: AbortSignal): Promise<T> {
        if (!this.isConnected) {
            throw new Error(`[WS Client] Cannot send "${type}": WebSocket is not connected`);
        }

        const ref = Crypto.randomUUID();
        const request: WSEvent = { type, payload, ref };

        console.log(`[WS Client] 📤 SENDING request: type=${type} ref=${ref}`);

        return new Promise<T>((resolve, reject) => {
            // Handle abort signal
            const abortHandler = () => {
                if (this.pendingRequests.has(ref)) {
                    this.pendingRequests.delete(ref);
                    clearTimeout(timeout);
                    console.log(`[WS Client] Request "${type}" aborted (ref=${ref})`);
                    reject(new Error(`[WS Client] Request "${type}" aborted`));
                }
            };

            if (signal) {
                if (signal.aborted) {
                    reject(new Error(`[WS Client] Request "${type}" already aborted`));
                    return;
                }
                signal.addEventListener('abort', abortHandler);
            }

            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(ref)) {
                    this.pendingRequests.delete(ref);
                    signal?.removeEventListener('abort', abortHandler);
                    reject(new Error(`[WS Client] Request "${type}" timed out after ${WS_REQUEST_TIMEOUT}ms (ref=${ref})`));
                }
            }, WS_REQUEST_TIMEOUT);

            this.pendingRequests.set(ref, { resolve, reject, timeout, type });

            try {
                this.ws?.send(JSON.stringify(request));
            } catch (err) {
                clearTimeout(timeout);
                this.pendingRequests.delete(ref);
                signal?.removeEventListener('abort', abortHandler);
                reject(err);
            }
        });
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

        // Backend expects token=sessionId:userId
        return `${wsBase}/api/personal/chat/ws?token=${encodeURIComponent(sessionId)}:${encodeURIComponent(userId)}`;
    }

    private setupEventHandlers(): void {
        if (!this.ws) return;

        this.ws.onopen = () => {
            const wasReconnecting = this._state === 'reconnecting';
            this._state = 'connected';
            this.reconnectAttempts = 0;

            // Send periodic pings to prevent NAT/firewall silently dropping idle connections.
            // This is critical on mobile (Android/iOS) where OS-level timeouts can kill sockets
            // without triggering onclose, making isConnected appear true on a dead connection.
            if (this.pingTimer) clearInterval(this.pingTimer);
            this.pingTimer = setInterval(() => {
                if (this.isConnected) {
                    this.ws?.send(JSON.stringify({ type: 'ping' }));
                }
            }, WS_PING_INTERVAL);

            if (wasReconnecting) {
                console.log('[WS Client] 🔄 Reconnected. Notifying subscribers.');
                this.reconnectSubscribers.forEach(h => h());
            }
        };

        this.ws.onmessage = (event: MessageEvent) => {
            const raw = event.data as string;
            // console.log(`[WS Client] 📩 RAW MESSAGE received: ${raw}`);

            try {
                const data: WSEvent = JSON.parse(raw);

                // ── 1. Check if this is a response to a pending request ─────
                if (data.ref && this.pendingRequests.has(data.ref)) {
                    const pending = this.pendingRequests.get(data.ref)!;

                    // Strictly match response type pattern if present
                    if (data.type === pending.type + '_response') {
                        this.pendingRequests.delete(data.ref);
                        clearTimeout(pending.timeout);

                        if (data.error) {
                            console.error(`[WS Client] ❌ Remote error for ${pending.type}:`, data.error);
                            pending.reject(new ApiError(
                                data.error.message || `Server error ${data.error.code}`,
                                data.error.code,
                                data.error.type || 'unknown_error',
                                null
                            ));
                        } else {
                            pending.resolve(data.payload);
                        }
                        return; // Don't dispatch to other listeners if it's a correlated response
                    }
                }

                // ── 2. Otherwise dispatch as a standard broadcast event ─────
                this.dispatchEvent(data);

            } catch (err) {
                console.error('[WS Client] ❌ PARSE ERROR:', err);
            }
        };

        this.ws.onerror = (e: any) => {
            // React Native dumps a massive Event object on network failure.
            // The actual reason is typically captured nicely in `onclose`.
            const msg = e?.message || e?.error?.message;
            if (msg) {
                console.log(`[WS Client] WebSocket Error: ${msg}`);
            } else {
                console.log('[WS Client] WebSocket Error encountered (see onclose for details)');
            }
        };

        this.ws.onclose = (event: CloseEvent) => {
            console.log(`[WS Client] 🔌 Closed (code=${event.code} reason=${event.reason})`);
            this.ws = null;

            // Reject all pending requests as they will never get a response
            this.rejectAllPending(`WebSocket closed (code=${event.code})`);

            if (!this.intentionalClose) {
                this._state = 'reconnecting';
                this.scheduleReconnect();
            } else {
                this._state = 'disconnected';
            }
        };
    }

    private dispatchEvent(event: WSEvent): void {
        // console.log(`[WS Client] 📤 DISPATCHING event: type=${event.type}`);
        for (const handler of this.handlers) {
            try {
                handler(event);
            } catch (err) {
                console.error(`[WS Client] ❌ handler ERROR for ${event.type}:`, err);
            }
        }
    }

    private rejectAllPending(reason: string): void {
        if (this.pendingRequests.size === 0) return;

        console.log(`[WS Client] ⚠️ Rejecting ${this.pendingRequests.size} pending requests: ${reason}`);
        this.pendingRequests.forEach((req, ref) => {
            clearTimeout(req.timeout);
            req.reject(new Error(`[WS Client] Request "${req.type}" failed: ${reason}`));
        });
        this.pendingRequests.clear();
    }

    private scheduleReconnect(): void {
        // Don't waste attempts when the network is known to be offline.
        // setNetworkOnline(true) will call connect() when connectivity returns.
        if (!this._networkOnline) return;

        if (this.reconnectAttempts >= WS_RECONNECT_MAX_ATTEMPTS) {
            this._state = 'disconnected';
            return;
        }

        const delay = Math.min(
            WS_RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
            WS_RECONNECT_MAX_DELAY
        );

        console.log(`[WS Client] ⏳ Scheduling reconnect in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts + 1})`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }


    private cleanup(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }

        this.rejectAllPending('Client disconnecting');

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
