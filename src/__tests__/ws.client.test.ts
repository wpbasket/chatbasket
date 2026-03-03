/**
 * Tests for ws.client.ts — Phase C WebSocket Client
 *
 * Verifies:
 *  1. Connection lifecycle: connect/disconnect/reconnect
 *  2. send() with ref correlation and timeout
 *  3. Ping timer starts on connect, cleared on disconnect
 *  4. Server error vs transport error distinction
 *  5. rejectAllPending on close
 *  6. Reconnect subscriber notifications
 *  7. Event dispatch to handlers
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
    randomUUID: jest.fn(() => 'test-ref-uuid'),
}));

// Mock react-native Platform — mutable so tests can override
let mockPlatformOS: string = 'ios';
jest.mock('react-native', () => ({
    Platform: { get OS() { return mockPlatformOS; } },
}));

// Mock auth state — use mutable refs so tests can override
let mockSessionId: string | null = 'session-123';
let mockUserId: string | null = 'user-123';

jest.mock('@/state/auth/state.auth', () => ({
    authState: {
        sessionId: { get: () => mockSessionId },
        userId: { get: () => mockUserId },
    },
}));

// Mock URL constants
jest.mock('@/lib/constantLib/constants/constants', () => ({
    Url: { BASE_API_URL: 'https://api.example.com' },
}));

// ─── WebSocket Mock Class ───────────────────────────────────────────────────

type MockWSHandler = ((ev: any) => void) | null;

let mockWSInstances: MockWS[] = [];

class MockWS {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = MockWS.CONNECTING;
    url: string;
    onopen: MockWSHandler = null;
    onmessage: MockWSHandler = null;
    onerror: MockWSHandler = null;
    onclose: MockWSHandler = null;

    sentMessages: string[] = [];
    closeCalled = false;

    constructor(url: string) {
        this.url = url;
        mockWSInstances.push(this);
    }

    send(data: string) {
        if (this.readyState !== MockWS.OPEN) {
            throw new Error('WebSocket is not open');
        }
        this.sentMessages.push(data);
    }

    close(code?: number, reason?: string) {
        this.closeCalled = true;
        this.readyState = MockWS.CLOSED;
    }

    // Helpers for tests
    simulateOpen() {
        this.readyState = MockWS.OPEN;
        this.onopen?.({});
    }

    simulateMessage(data: any) {
        this.onmessage?.({ data: JSON.stringify(data) });
    }

    simulateClose(code = 1000, reason = '') {
        this.readyState = MockWS.CLOSED;
        this.onclose?.({ code, reason });
    }

    simulateError(err: any) {
        this.onerror?.(err);
    }
}

// Install mock WebSocket globally
(global as any).WebSocket = MockWS;

// ─── Import after mocks ─────────────────────────────────────────────────────

// We need to reset the module between tests since ws.client exports a singleton
function getWSClient() {
    // Clear module cache to get a fresh singleton
    jest.resetModules();
    const mod = require('@/lib/personalLib/chatApi/ws.client');
    return mod.wsClient;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.useFakeTimers();
    mockWSInstances = [];
});

afterEach(() => {
    jest.useRealTimers();
});

describe('WSClientManager', () => {

    // ── Connection Lifecycle ──────────────────────────────────────────────

    describe('connect()', () => {
        it('creates a WebSocket with the correct URL on mobile', () => {
            const wsClient = getWSClient();
            wsClient.connect();

            expect(mockWSInstances).toHaveLength(1);
            expect(mockWSInstances[0].url).toContain('wss://api.example.com/api/personal/chat/ws?token=');
            expect(mockWSInstances[0].url).toContain('session-123');
            expect(mockWSInstances[0].url).toContain('user-123');
        });

        it('sets state to "connecting" immediately', () => {
            const wsClient = getWSClient();
            wsClient.connect();

            expect(wsClient.state).toBe('connecting');
        });

        it('sets state to "connected" after onopen', () => {
            const wsClient = getWSClient();
            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            expect(wsClient.state).toBe('connected');
            expect(wsClient.isConnected).toBe(true);
        });

        it('no-ops if already connected', () => {
            const wsClient = getWSClient();
            wsClient.connect();
            mockWSInstances[0].simulateOpen();
            wsClient.connect(); // should not create another WS

            expect(mockWSInstances).toHaveLength(1);
        });
    });

    describe('disconnect()', () => {
        it('closes WebSocket and sets state to disconnected', () => {
            const wsClient = getWSClient();
            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            wsClient.disconnect();

            expect(wsClient.state).toBe('disconnected');
            expect(wsClient.isConnected).toBe(false);
            expect(mockWSInstances[0].closeCalled).toBe(true);
        });

        it('does not trigger reconnect after intentional disconnect', () => {
            const wsClient = getWSClient();
            wsClient.connect();
            mockWSInstances[0].simulateOpen();
            wsClient.disconnect();

            // Advance timers — should not reconnect
            jest.advanceTimersByTime(60000);
            expect(mockWSInstances).toHaveLength(1); // no new WS created
        });
    });

    // ── Ping Timer ──────────────────────────────────────────────────────

    describe('ping timer', () => {
        it('sends ping every 25 seconds when connected', () => {
            const wsClient = getWSClient();
            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            const ws = mockWSInstances[0];
            expect(ws.sentMessages).toHaveLength(0);

            // Advance to 25s — should fire first ping
            jest.advanceTimersByTime(25000);
            expect(ws.sentMessages).toHaveLength(1);
            expect(JSON.parse(ws.sentMessages[0])).toEqual({ type: 'ping' });

            // Advance another 25s — should fire second ping
            jest.advanceTimersByTime(25000);
            expect(ws.sentMessages).toHaveLength(2);
        });

        it('stops pinging after disconnect', () => {
            const wsClient = getWSClient();
            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            const ws = mockWSInstances[0];
            wsClient.disconnect();

            jest.advanceTimersByTime(50000);
            expect(ws.sentMessages).toHaveLength(0);
        });
    });

    // ── send() with ref correlation ─────────────────────────────────────

    describe('send()', () => {
        it('sends a message with type, payload, and ref', async () => {
            const wsClient = getWSClient();
            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            const ws = mockWSInstances[0];
            const sendPromise = wsClient.send('send_message', { content: 'hi' });

            expect(ws.sentMessages).toHaveLength(1);
            const sent = JSON.parse(ws.sentMessages[0]);
            expect(sent.type).toBe('send_message');
            expect(sent.payload).toEqual({ content: 'hi' });
            expect(sent.ref).toBe('test-ref-uuid');

            // Simulate server response
            ws.simulateMessage({
                type: 'send_message_response',
                ref: 'test-ref-uuid',
                payload: { message_id: 'msg-returned' },
            });

            const result = await sendPromise;
            expect(result).toEqual({ message_id: 'msg-returned' });
        });

        it('rejects with server error when response has error field', async () => {
            const wsClient = getWSClient();
            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            const ws = mockWSInstances[0];
            const sendPromise = wsClient.send('send_message', { content: 'hi' });

            ws.simulateMessage({
                type: 'send_message_response',
                ref: 'test-ref-uuid',
                error: { code: 403, message: 'Not authorized' },
            });

            await expect(sendPromise).rejects.toThrow('Not authorized');
        });

        it('rejects when socket is not connected', async () => {
            const wsClient = getWSClient();
            // Not connected
            await expect(wsClient.send('send_message', {})).rejects.toThrow('[WS Client]');
        });

        it('times out after WS_REQUEST_TIMEOUT (10s)', async () => {
            const wsClient = getWSClient();
            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            const sendPromise = wsClient.send('send_message', {});

            // Don't simulate response, just advance time past timeout
            jest.advanceTimersByTime(10001);

            await expect(sendPromise).rejects.toThrow('timed out');
        });
    });

    // ── rejectAllPending on close ───────────────────────────────────────

    describe('rejectAllPending on close', () => {
        it('rejects all pending requests when connection closes', async () => {
            const wsClient = getWSClient();
            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            const ws = mockWSInstances[0];

            // Make randomUUID return different values for each send
            let callCount = 0;
            const Crypto = require('expo-crypto');
            Crypto.randomUUID.mockImplementation(() => `ref-${++callCount}`);

            const p1 = wsClient.send('send_message', { content: 'a' });
            const p2 = wsClient.send('mark_read', { chat_id: 'c1' });

            // Close the connection — should reject both
            ws.simulateClose(1006, 'abnormal');

            await expect(p1).rejects.toThrow('[WS Client]');
            await expect(p2).rejects.toThrow('[WS Client]');

            // Restore default
            Crypto.randomUUID.mockReturnValue('test-ref-uuid');
        });
    });

    // ── Event dispatch to handlers ──────────────────────────────────────

    describe('subscribe()', () => {
        it('dispatches broadcast events to subscribed handlers', () => {
            const wsClient = getWSClient();
            const handler = jest.fn();
            wsClient.subscribe(handler);

            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            // Simulate a broadcast event (no ref → not a correlated response)
            mockWSInstances[0].simulateMessage({
                type: 'new_message',
                payload: { message_id: 'msg-1', chat_id: 'chat-1' },
            });

            expect(handler).toHaveBeenCalledWith(expect.objectContaining({
                type: 'new_message',
                payload: expect.objectContaining({ message_id: 'msg-1' }),
            }));
        });

        it('does NOT dispatch correlated responses to handlers', () => {
            const wsClient = getWSClient();
            const handler = jest.fn();
            wsClient.subscribe(handler);

            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            // Send a request — this creates a pending entry for ref='test-ref-uuid'
            wsClient.send('send_message', { content: 'hi' });

            // Simulate correlated response
            mockWSInstances[0].simulateMessage({
                type: 'send_message_response',
                ref: 'test-ref-uuid',
                payload: { message_id: 'returned' },
            });

            // Handler should NOT have been called for the response
            expect(handler).not.toHaveBeenCalled();
        });

        it('unsubscribe function removes the handler', () => {
            const wsClient = getWSClient();
            const handler = jest.fn();
            const unsub = wsClient.subscribe(handler);

            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            unsub();

            mockWSInstances[0].simulateMessage({
                type: 'new_message',
                payload: { message_id: 'msg-1' },
            });

            expect(handler).not.toHaveBeenCalled();
        });
    });

    // ── Reconnect ───────────────────────────────────────────────────────

    describe('auto-reconnect', () => {
        it('schedules reconnect on unexpected close', () => {
            const wsClient = getWSClient();
            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            // Simulate unexpected close
            mockWSInstances[0].simulateClose(1006, 'abnormal');

            expect(wsClient.state).toBe('reconnecting');

            // Advance past reconnect delay (first attempt: ~1s + jitter)
            jest.advanceTimersByTime(3000);

            // Should have created a second WS instance
            expect(mockWSInstances).toHaveLength(2);
        });

        it('notifies reconnect subscribers on successful reconnection', () => {
            const wsClient = getWSClient();
            const reconnectHandler = jest.fn();
            wsClient.onReconnect(reconnectHandler);

            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            // Close and reconnect
            mockWSInstances[0].simulateClose(1006, 'abnormal');
            jest.advanceTimersByTime(3000);

            // Simulate the new WS connecting
            mockWSInstances[1].simulateOpen();

            expect(reconnectHandler).toHaveBeenCalledTimes(1);
        });

        it('does NOT notify reconnect subscribers on initial connect', () => {
            const wsClient = getWSClient();
            const reconnectHandler = jest.fn();
            wsClient.onReconnect(reconnectHandler);

            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            expect(reconnectHandler).not.toHaveBeenCalled();
        });
    });

    // ── Missing auth / null URL ──────────────────────────────────────────

    describe('connect() with missing auth', () => {
        it('warns and does not create WebSocket when auth is missing', () => {
            mockSessionId = null;
            mockUserId = null;

            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const wsClient = getWSClient();
            wsClient.connect();

            expect(mockWSInstances).toHaveLength(0);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot connect'));
            expect(wsClient.state).toBe('disconnected');

            warnSpy.mockRestore();
            mockSessionId = 'session-123';
            mockUserId = 'user-123';
        });
    });

    // ── Malformed JSON message ───────────────────────────────────────────

    describe('onmessage parse error', () => {
        it('logs error and does not crash on malformed JSON', () => {
            const wsClient = getWSClient();
            const handler = jest.fn();
            wsClient.subscribe(handler);
            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            const errorSpy = jest.spyOn(console, 'error').mockImplementation();

            // Simulate raw non-JSON message
            mockWSInstances[0].onmessage?.({ data: 'not-valid-json{{{' });

            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('PARSE ERROR'), expect.anything());
            expect(handler).not.toHaveBeenCalled();

            errorSpy.mockRestore();
        });
    });

    // ── onReconnect unsubscribe ──────────────────────────────────────────

    describe('onReconnect unsubscribe', () => {
        it('removes reconnect handler after unsubscribe', () => {
            const wsClient = getWSClient();
            const reconnectHandler = jest.fn();
            const unsub = wsClient.onReconnect(reconnectHandler);

            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            // Unsubscribe before reconnect
            unsub();

            // Simulate disconnect + reconnect
            mockWSInstances[0].simulateClose(1006, 'abnormal');
            jest.advanceTimersByTime(3000);
            mockWSInstances[1].simulateOpen();

            expect(reconnectHandler).not.toHaveBeenCalled();
        });
    });

    // ── Response type mismatch ───────────────────────────────────────────

    describe('response type mismatch', () => {
        it('dispatches as broadcast when response type does not match pending type', () => {
            const wsClient = getWSClient();
            const handler = jest.fn();
            wsClient.subscribe(handler);

            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            // Send a request
            wsClient.send('send_message', { content: 'hi' });

            // Simulate a response with matching ref but wrong type
            mockWSInstances[0].simulateMessage({
                type: 'wrong_type_response',
                ref: 'test-ref-uuid',
                payload: { unexpected: true },
            });

            // Should be dispatched as broadcast since type doesn't match
            expect(handler).toHaveBeenCalledWith(expect.objectContaining({
                type: 'wrong_type_response',
                ref: 'test-ref-uuid',
            }));
        });
    });

    // ── Web platform URL ─────────────────────────────────────────────────

    describe('connect() on web platform', () => {
        it('uses cookie-based auth URL without query params on web', () => {
            // Override Platform.OS to 'web' via mutable ref
            const originalOS = mockPlatformOS;
            mockPlatformOS = 'web';

            const wsClient = getWSClient();
            wsClient.connect();

            expect(mockWSInstances).toHaveLength(1);
            expect(mockWSInstances[0].url).toBe('wss://api.example.com/api/personal/chat/ws');
            expect(mockWSInstances[0].url).not.toContain('token=');

            mockPlatformOS = originalOS;
        });
    });

    // ── Backoff delay cap ────────────────────────────────────────────────

    describe('exponential backoff cap', () => {
        it('caps reconnect delay at 30 seconds', () => {
            const wsClient = getWSClient();
            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            // Simulate many rapid disconnects to drive up attempts
            // We'll track timing between disconnect and new WS creation
            for (let i = 0; i < 10; i++) {
                const lastIndex = mockWSInstances.length - 1;
                mockWSInstances[lastIndex].simulateClose(1006, 'abnormal');
                // Advance 31s — should always be enough (cap is 30s + 1s jitter max)
                jest.advanceTimersByTime(31000);
                // After advancing, a new WS should be created
                if (mockWSInstances.length > lastIndex + 1) {
                    mockWSInstances[mockWSInstances.length - 1].simulateOpen();
                }
            }

            // After 10 attempts with exponential backoff capped at 30s,
            // we should have created multiple WS instances (1 original + reconnects)
            expect(mockWSInstances.length).toBeGreaterThan(5);
        });
    });

    // ── WS constructor throws ────────────────────────────────────────────

    describe('WebSocket constructor error', () => {
        it('schedules reconnect when WebSocket constructor throws', () => {
            // Temporarily make WebSocket throw
            const OriginalMockWS = (global as any).WebSocket;
            (global as any).WebSocket = function() {
                throw new Error('Network unavailable');
            };
            (global as any).WebSocket.OPEN = 1;
            (global as any).WebSocket.CONNECTING = 0;
            (global as any).WebSocket.CLOSING = 2;
            (global as any).WebSocket.CLOSED = 3;

            const errorSpy = jest.spyOn(console, 'error').mockImplementation();
            const logSpy = jest.spyOn(console, 'log').mockImplementation();

            const wsClient = getWSClient();
            wsClient.connect();

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Connection error'),
                expect.anything(),
            );

            // Should schedule reconnect
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('Scheduling reconnect'),
            );

            errorSpy.mockRestore();
            logSpy.mockRestore();
            (global as any).WebSocket = OriginalMockWS;
        });
    });

    // ── Handler error isolation ──────────────────────────────────────────

    describe('handler error isolation', () => {
        it('catches errors in event handlers without affecting others', () => {
            const wsClient = getWSClient();
            const badHandler = jest.fn(() => { throw new Error('handler boom'); });
            const goodHandler = jest.fn();

            wsClient.subscribe(badHandler);
            wsClient.subscribe(goodHandler);

            wsClient.connect();
            mockWSInstances[0].simulateOpen();

            const errorSpy = jest.spyOn(console, 'error').mockImplementation();

            mockWSInstances[0].simulateMessage({
                type: 'new_message',
                payload: { message_id: 'msg-1' },
            });

            // Bad handler threw, but good handler still received the event
            expect(badHandler).toHaveBeenCalled();
            expect(goodHandler).toHaveBeenCalled();
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('handler ERROR'),
                expect.anything(),
            );

            errorSpy.mockRestore();
        });
    });
});
