/**
 * Tests for ws.event.bridge.ts — Phase C WS Event Bridge
 *
 * Verifies:
 *  1. new_message → updates active chat state + chat list preview
 *  2. delivery_ack → marks messages delivered
 *  3. read_receipt → marks messages read
 *  4. unsend → tombstones messages
 *  5. delete_for_me → removes messages
 *  6. sync_action → triggers sync engine
 *  7. ping_response → silently ignored (no error)
 *  8. Unknown events → logged, no crash
 *  9. Sender-sync Part B fires for is_from_me messages in active chat
 * 10. Reconnect triggers sync + pending message fetch
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockAddMessage = jest.fn();
const mockDebouncedMarkRead = jest.fn();
const mockMarkChatRead = jest.fn();
const mockUnsendMessages = jest.fn();
const mockRemoveMessages = jest.fn();
const mockMarkMessagesDelivered = jest.fn();
const mockMarkMessagesDeliveredUpTo = jest.fn();
const mockMarkMessagesReadUpTo = jest.fn();
const mockSyncPendingMessages = jest.fn();
const mockUpsertChat = jest.fn();
const mockFetchAndApply = jest.fn();
const mockAckIncomingMessages = jest.fn();

// Mock the state modules — use wrapper functions to avoid TDZ from jest.mock hoisting
jest.mock('@/state/personalState/chat/personal.state.chat', () => ({
    $chatMessagesState: {
        activeChatId: { peek: jest.fn(() => null) },
        chats: { peek: jest.fn(() => ({})) },
        addMessage: (...args: any[]) => mockAddMessage(...args),
        debouncedMarkRead: (...args: any[]) => mockDebouncedMarkRead(...args),
        unsendMessages: (...args: any[]) => mockUnsendMessages(...args),
        removeMessages: (...args: any[]) => mockRemoveMessages(...args),
        markMessagesDelivered: (...args: any[]) => mockMarkMessagesDelivered(...args),
        markMessagesDeliveredUpTo: (...args: any[]) => mockMarkMessagesDeliveredUpTo(...args),
        markMessagesReadUpTo: (...args: any[]) => mockMarkMessagesReadUpTo(...args),
        syncPendingMessages: (...args: any[]) => mockSyncPendingMessages(...args),
    },
    $chatListState: {
        chatsById: {},
        upsertChat: (...args: any[]) => mockUpsertChat(...args),
        markChatRead: (...args: any[]) => mockMarkChatRead(...args),
    },
    sharedAckTracker: new Set<string>(),
    ackIncomingMessages: (...args: any[]) => mockAckIncomingMessages(...args),
}));

jest.mock('@/state/personalState/chat/personal.state.sync', () => ({
    $syncEngine: {
        fetchAndApply: (...args: any[]) => mockFetchAndApply(...args),
    },
}));

jest.mock('@/utils/personalUtils/util.chatPreview', () => ({
    getPreviewText: jest.fn((msg) => msg.content || 'File'),
}));

// Track wsClient subscriptions through our mock
let wsSubscribeHandler: ((event: any) => void) | null = null;
let wsReconnectHandler: (() => void) | null = null;

jest.mock('@/lib/personalLib/chatApi/ws.client', () => ({
    wsClient: {
        subscribe: jest.fn((handler: any) => {
            wsSubscribeHandler = handler;
            return () => { wsSubscribeHandler = null; };
        }),
        onReconnect: jest.fn((handler: any) => {
            wsReconnectHandler = handler;
            return () => { wsReconnectHandler = null; };
        }),
        connect: jest.fn(),
        disconnect: jest.fn(),
    },
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { startWSEventBridge, stopWSEventBridge } from '@/state/personalState/chat/ws.event.bridge';
import { $chatMessagesState, $chatListState, sharedAckTracker } from '@/state/personalState/chat/personal.state.chat';
import { wsClient } from '@/lib/personalLib/chatApi/ws.client';

// ─── Helpers ────────────────────────────────────────────────────────────────

function dispatch(type: string, payload: any, ref?: string) {
    if (!wsSubscribeHandler) throw new Error('Bridge not started — no subscribe handler');
    wsSubscribeHandler({ type, payload, ref });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.clearAllMocks();
    sharedAckTracker.clear();
    wsSubscribeHandler = null;
    wsReconnectHandler = null;
});

describe('WS Event Bridge', () => {

    describe('lifecycle', () => {
        it('subscribes to wsClient and connects on start', () => {
            startWSEventBridge();

            expect(wsClient.connect).toHaveBeenCalled();
            expect(wsSubscribeHandler).not.toBeNull();
            expect(wsReconnectHandler).not.toBeNull();

            stopWSEventBridge();
        });

        it('unsubscribes and disconnects on stop', () => {
            startWSEventBridge();
            stopWSEventBridge();

            expect(wsClient.disconnect).toHaveBeenCalled();
        });

        it('does not double-subscribe on multiple start calls', () => {
            startWSEventBridge();
            startWSEventBridge(); // should no-op

            const { wsClient } = require('@/lib/personalLib/chatApi/ws.client');
            expect(wsClient.subscribe).toHaveBeenCalledTimes(1);

            stopWSEventBridge();
        });
    });

    describe('new_message', () => {
        beforeEach(() => {
            startWSEventBridge();
        });

        afterEach(() => {
            stopWSEventBridge();
        });

        it('adds message to active chat and auto-reads when chat is open', () => {
            // Set active chat to match incoming message
            ($chatMessagesState.activeChatId.peek as jest.Mock).mockReturnValue('chat-1');
            ($chatMessagesState.chats.peek as jest.Mock).mockReturnValue({});

            dispatch('new_message', {
                message_id: 'msg-1',
                chat_id: 'chat-1',
                content: 'Hello!',
                message_type: 'text',
                is_from_me: false,
                created_at: new Date().toISOString(),
            });

            expect(mockAddMessage).toHaveBeenCalledWith('chat-1', expect.objectContaining({
                message_id: 'msg-1',
                status: 'sent', // Bridge sets status='sent' if missing
            }));
            expect(mockDebouncedMarkRead).toHaveBeenCalledWith('chat-1');
            expect(mockMarkChatRead).toHaveBeenCalledWith('chat-1');
        });

        it('fires sender-sync (Part B) ackIncomingMessages for is_from_me in active chat', () => {
            ($chatMessagesState.activeChatId.peek as jest.Mock).mockReturnValue('chat-1');
            ($chatMessagesState.chats.peek as jest.Mock).mockReturnValue({});

            dispatch('new_message', {
                message_id: 'msg-2',
                chat_id: 'chat-1',
                content: 'From other device',
                message_type: 'text',
                is_from_me: true,
                created_at: new Date().toISOString(),
            });

            // addMessage is called (which internally does skipSenderSync:true)
            expect(mockAddMessage).toHaveBeenCalled();
            // Then ackIncomingMessages is called explicitly for Part B sender-sync
            expect(mockAckIncomingMessages).toHaveBeenCalledWith([
                expect.objectContaining({ message_id: 'msg-2', is_from_me: true }),
            ]);
        });

        it('upserts chat list preview for new messages', () => {
            ($chatMessagesState.activeChatId.peek as jest.Mock).mockReturnValue(null);

            dispatch('new_message', {
                message_id: 'msg-3',
                chat_id: 'chat-new',
                content: 'First message',
                message_type: 'text',
                is_from_me: false,
                created_at: '2025-01-01T00:00:00Z',
            });

            expect(mockUpsertChat).toHaveBeenCalledWith(
                expect.objectContaining({
                    chat_id: 'chat-new',
                    last_message_content: 'First message',
                    last_message_id: 'msg-3',
                    unread_count: 1,
                })
            );
        });

        it('skips duplicate messages in active chat', () => {
            ($chatMessagesState.activeChatId.peek as jest.Mock).mockReturnValue('chat-1');
            ($chatMessagesState.chats.peek as jest.Mock).mockReturnValue({
                'chat-1': {
                    messagesById: { 'msg-1': { message_id: 'msg-1' } },
                },
            });

            dispatch('new_message', {
                message_id: 'msg-1',
                chat_id: 'chat-1',
                content: 'Duplicate',
                message_type: 'text',
                is_from_me: true,
                created_at: new Date().toISOString(),
            });

            expect(mockAddMessage).not.toHaveBeenCalled();
        });

        it('ignores invalid payloads (missing chat_id or message_id)', () => {
            dispatch('new_message', { content: 'no ids' });

            expect(mockAddMessage).not.toHaveBeenCalled();
            expect(mockUpsertChat).not.toHaveBeenCalled();
        });
    });

    describe('delivery_ack', () => {
        beforeEach(() => startWSEventBridge());
        afterEach(() => stopWSEventBridge());

        it('calls markMessagesDeliveredUpTo when delivered_at is present', () => {
            dispatch('delivery_ack', {
                chat_id: 'chat-1',
                message_ids: ['msg-1', 'msg-2'],
                delivered_at: '2025-06-01T10:00:00Z',
            });

            expect(mockMarkMessagesDeliveredUpTo).toHaveBeenCalledWith('chat-1', '2025-06-01T10:00:00Z');
        });

        it('calls markMessagesDelivered when no delivered_at', () => {
            dispatch('delivery_ack', {
                chat_id: 'chat-1',
                message_ids: ['msg-1', 'msg-2'],
            });

            expect(mockMarkMessagesDelivered).toHaveBeenCalledWith('chat-1', ['msg-1', 'msg-2']);
        });

        it('supports singular message_id (Phase A compat)', () => {
            dispatch('delivery_ack', {
                chat_id: 'chat-1',
                message_id: 'msg-single',
            });

            expect(mockMarkMessagesDelivered).toHaveBeenCalledWith('chat-1', ['msg-single']);
        });

        it('removes message IDs from sharedAckTracker', () => {
            sharedAckTracker.add('msg-1');
            sharedAckTracker.add('msg-2');

            dispatch('delivery_ack', {
                chat_id: 'chat-1',
                message_ids: ['msg-1', 'msg-2'],
            });

            expect(sharedAckTracker.has('msg-1')).toBe(false);
            expect(sharedAckTracker.has('msg-2')).toBe(false);
        });
    });

    describe('read_receipt', () => {
        beforeEach(() => startWSEventBridge());
        afterEach(() => stopWSEventBridge());

        it('calls markMessagesReadUpTo with chat_id and read_at', () => {
            dispatch('read_receipt', {
                chat_id: 'chat-1',
                reader_id: 'user-2',
                read_at: '2025-06-01T12:00:00Z',
            });

            expect(mockMarkMessagesReadUpTo).toHaveBeenCalledWith('chat-1', '2025-06-01T12:00:00Z');
        });

        it('ignores invalid payload (missing chat_id)', () => {
            dispatch('read_receipt', { reader_id: 'user-2' });

            expect(mockMarkMessagesReadUpTo).not.toHaveBeenCalled();
        });
    });

    describe('unsend', () => {
        beforeEach(() => startWSEventBridge());
        afterEach(() => stopWSEventBridge());

        it('calls unsendMessages with chat_id, message_ids, and sender_id', () => {
            dispatch('unsend', {
                chat_id: 'chat-1',
                message_ids: ['msg-1', 'msg-2'],
                sender_id: 'user-sender',
            });

            expect(mockUnsendMessages).toHaveBeenCalledWith('chat-1', ['msg-1', 'msg-2'], 'user-sender');
        });

        it('ignores invalid payload (missing message_ids)', () => {
            dispatch('unsend', { chat_id: 'chat-1' });

            expect(mockUnsendMessages).not.toHaveBeenCalled();
        });
    });

    describe('delete_for_me', () => {
        beforeEach(() => startWSEventBridge());
        afterEach(() => stopWSEventBridge());

        it('removes messages from the specified chat', () => {
            dispatch('delete_for_me', {
                chat_id: 'chat-1',
                message_ids: ['msg-1'],
            });

            expect(mockRemoveMessages).toHaveBeenCalledWith('chat-1', ['msg-1']);
        });

        it('falls back to active chat when payload has no chat_id', () => {
            ($chatMessagesState.activeChatId.peek as jest.Mock).mockReturnValue('chat-active');

            dispatch('delete_for_me', {
                message_ids: ['msg-1'],
            });

            expect(mockRemoveMessages).toHaveBeenCalledWith('chat-active', ['msg-1']);
        });

        it('ignores invalid payload (missing message_ids)', () => {
            dispatch('delete_for_me', { chat_id: 'chat-1' });

            expect(mockRemoveMessages).not.toHaveBeenCalled();
        });
    });

    describe('sync_action', () => {
        beforeEach(() => startWSEventBridge());
        afterEach(() => stopWSEventBridge());

        it('triggers $syncEngine.fetchAndApply', () => {
            dispatch('sync_action', {});

            expect(mockFetchAndApply).toHaveBeenCalled();
        });
    });

    describe('ping_response', () => {
        beforeEach(() => startWSEventBridge());
        afterEach(() => stopWSEventBridge());

        it('is silently consumed without errors or state changes', () => {
            // Should NOT throw
            expect(() => dispatch('ping_response', { type: 'pong' })).not.toThrow();

            // No state mutations should have been triggered
            expect(mockAddMessage).not.toHaveBeenCalled();
            expect(mockUpsertChat).not.toHaveBeenCalled();
            expect(mockFetchAndApply).not.toHaveBeenCalled();
        });
    });

    describe('unknown events', () => {
        beforeEach(() => startWSEventBridge());
        afterEach(() => stopWSEventBridge());

        it('logs a warning but does not crash', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

            expect(() => dispatch('some_unknown_event', { data: 'foo' })).not.toThrow();
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('UNKNOWN'), expect.anything());

            warnSpy.mockRestore();
        });
    });

    describe('ref-based events are ignored', () => {
        beforeEach(() => startWSEventBridge());
        afterEach(() => stopWSEventBridge());

        it('drops events with a ref field (handled by wsClient.send)', () => {
            dispatch('send_message_response', { message_id: 'msg-1' }, 'some-ref');

            expect(mockAddMessage).not.toHaveBeenCalled();
            expect(mockUpsertChat).not.toHaveBeenCalled();
        });
    });

    describe('reconnect handler', () => {
        it('triggers sync and pending message fetch on reconnect', () => {
            startWSEventBridge();

            // Simulate reconnect
            wsReconnectHandler?.();

            expect(mockFetchAndApply).toHaveBeenCalled();
            expect(mockSyncPendingMessages).toHaveBeenCalled();

            stopWSEventBridge();
        });
    });

    // ── error event type ─────────────────────────────────────────────────

    describe('error event', () => {
        beforeEach(() => startWSEventBridge());
        afterEach(() => stopWSEventBridge());

        it('logs server error without crashing', () => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation();

            expect(() => {
                wsSubscribeHandler!({
                    type: 'error',
                    payload: null,
                    error: { code: 500, message: 'Internal server error' },
                });
            }).not.toThrow();

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Server reported error'),
                expect.objectContaining({ code: 500 }),
            );

            errorSpy.mockRestore();
        });
    });

    // ── new_message with existing chat entry ─────────────────────────────

    describe('new_message — existing chat entry', () => {
        beforeEach(() => startWSEventBridge());
        afterEach(() => stopWSEventBridge());

        it('updates existing chat list preview and increments unread_count', () => {
            ($chatMessagesState.activeChatId.peek as jest.Mock).mockReturnValue(null);

            // Set up an existing chat entry in chatsById
            const existingEntry = {
                chat_id: 'chat-existing',
                other_user_id: 'user-2',
                last_message_content: 'Old message',
                last_message_id: 'msg-old',
                unread_count: 2,
                last_message_type: 'text',
                last_message_is_from_me: false,
                last_message_created_at: '2025-01-01T00:00:00Z',
                last_message_status: 'sent',
            };
            ($chatListState as any).chatsById['chat-existing'] = { peek: jest.fn(() => existingEntry) };

            dispatch('new_message', {
                message_id: 'msg-new',
                chat_id: 'chat-existing',
                content: 'Updated message',
                message_type: 'text',
                is_from_me: false,
                created_at: '2025-06-01T10:00:00Z',
            });

            expect(mockUpsertChat).toHaveBeenCalledWith(
                expect.objectContaining({
                    chat_id: 'chat-existing',
                    last_message_content: 'Updated message',
                    last_message_id: 'msg-new',
                    unread_count: 3, // incremented from 2
                }),
            );

            // Cleanup
            delete ($chatListState as any).chatsById['chat-existing'];
        });

        it('does NOT auto-read for is_from_me messages in active chat', () => {
            ($chatMessagesState.activeChatId.peek as jest.Mock).mockReturnValue('chat-1');
            ($chatMessagesState.chats.peek as jest.Mock).mockReturnValue({});

            dispatch('new_message', {
                message_id: 'msg-mine',
                chat_id: 'chat-1',
                content: 'My own message from another device',
                message_type: 'text',
                is_from_me: true,
                created_at: new Date().toISOString(),
            });

            // addMessage should be called
            expect(mockAddMessage).toHaveBeenCalled();
            // But debouncedMarkRead and markChatRead should NOT be called
            expect(mockDebouncedMarkRead).not.toHaveBeenCalled();
            expect(mockMarkChatRead).not.toHaveBeenCalled();
        });
    });

    // ── delivery_ack edge cases ──────────────────────────────────────────

    describe('delivery_ack — edge cases', () => {
        beforeEach(() => startWSEventBridge());
        afterEach(() => stopWSEventBridge());

        it('warns and skips when message_ids is empty', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

            dispatch('delivery_ack', {
                chat_id: 'chat-1',
            });

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('MISSING message_ids'));
            expect(mockMarkMessagesDelivered).not.toHaveBeenCalled();
            expect(mockMarkMessagesDeliveredUpTo).not.toHaveBeenCalled();

            warnSpy.mockRestore();
        });

        it('falls back to activeChatId when no chat_id in payload', () => {
            ($chatMessagesState.activeChatId.peek as jest.Mock).mockReturnValue('chat-fallback');

            dispatch('delivery_ack', {
                message_ids: ['msg-1'],
            });

            expect(mockMarkMessagesDelivered).toHaveBeenCalledWith('chat-fallback', ['msg-1']);
        });

        it('warns when neither chat_id nor activeChatId is available', () => {
            ($chatMessagesState.activeChatId.peek as jest.Mock).mockReturnValue(null);
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

            dispatch('delivery_ack', {
                message_ids: ['msg-1'],
            });

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('NO targetChatId'));
            expect(mockMarkMessagesDelivered).not.toHaveBeenCalled();

            warnSpy.mockRestore();
        });
    });

    // ── delete_for_me preview clearing ───────────────────────────────────

    describe('delete_for_me — clears chat list preview', () => {
        beforeEach(() => startWSEventBridge());
        afterEach(() => stopWSEventBridge());

        it('clears preview when deleted message was the last preview message', () => {
            const mockAssign = jest.fn();
            ($chatListState as any).chatsById['chat-1'] = {
                peek: jest.fn(() => ({ chat_id: 'chat-1', last_message_id: 'msg-1' })),
                assign: mockAssign,
            };

            dispatch('delete_for_me', {
                chat_id: 'chat-1',
                message_ids: ['msg-1'],
            });

            expect(mockRemoveMessages).toHaveBeenCalledWith('chat-1', ['msg-1']);
            expect(mockAssign).toHaveBeenCalledWith({
                last_message_content: null,
                last_message_type: null,
            });

            delete ($chatListState as any).chatsById['chat-1'];
        });

        it('does NOT clear preview when deleted message is not the last preview', () => {
            const mockAssign = jest.fn();
            ($chatListState as any).chatsById['chat-1'] = {
                peek: jest.fn(() => ({ chat_id: 'chat-1', last_message_id: 'msg-other' })),
                assign: mockAssign,
            };

            dispatch('delete_for_me', {
                chat_id: 'chat-1',
                message_ids: ['msg-1'],
            });

            expect(mockRemoveMessages).toHaveBeenCalledWith('chat-1', ['msg-1']);
            expect(mockAssign).not.toHaveBeenCalled();

            delete ($chatListState as any).chatsById['chat-1'];
        });

        it('handles no targetChatId gracefully (no chat_id, no active chat)', () => {
            ($chatMessagesState.activeChatId.peek as jest.Mock).mockReturnValue(null);

            expect(() => {
                dispatch('delete_for_me', {
                    message_ids: ['msg-1'],
                });
            }).not.toThrow();

            expect(mockRemoveMessages).not.toHaveBeenCalled();
        });
    });
});
