/**
 * Tests for ackIncomingMessages — Phase C ACK Logic
 *
 * Verifies:
 *  1. Part A: Recipient batch ACK fires for undelivered incoming messages
 *  2. Part B: Sender sync ACK fires for is_from_me + !synced_to_sender_primary (isPrimary only)
 *  3. Debounce: Multiple calls within 50ms are batched into one API call
 *  4. sharedAckTracker prevents duplicate in-flight ACKs
 *  5. skipSenderSync option suppresses Part B
 *  6. Non-primary devices skip sender sync (Part B)
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockAckDeliveryBatch = jest.fn().mockResolvedValue({ acknowledged_count: 1 });
const mockAckDelivery = jest.fn().mockResolvedValue({ acknowledged: true });

jest.mock('@/lib/personalLib/chatApi/chat.transport', () => ({
    ChatTransport: {
        acknowledgeDeliveryBatch: (...args: any[]) => mockAckDeliveryBatch(...args),
        acknowledgeDelivery: (...args: any[]) => mockAckDelivery(...args),
    },
}));

// Mock authState
const mockIsPrimary = jest.fn(() => true);
jest.mock('@/state/auth/state.auth', () => ({
    authState: {
        isPrimary: { peek: () => mockIsPrimary() },
    },
}));

// Mock dependent modules that personal.state.chat.ts imports
jest.mock('@/utils/personalUtils/util.chatPreview', () => ({
    getPreviewText: jest.fn((msg: any) => msg.content || 'File'),
}));

jest.mock('@/utils/personalUtils/util.chatMedia', () => ({
    resolveMediaUrls: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/state/personalState/user/personal.state.user', () => ({
    $personalStateUser: {},
}));

jest.mock('@legendapp/state', () => {
    const original = jest.requireActual('@legendapp/state');
    return {
        ...original,
        // Ensure batch runs synchronously in tests
        batch: (fn: () => void) => fn(),
    };
});

jest.mock('@legendapp/state/react', () => ({
    useValue: jest.fn(),
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { ackIncomingMessages, sharedAckTracker } from '@/state/personalState/chat/personal.state.chat';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<any> = {}): any {
    return {
        message_id: 'msg-' + Math.random().toString(36).slice(2, 8),
        chat_id: 'chat-1',
        is_from_me: false,
        recipient_id: 'user-2',
        content: 'Test',
        message_type: 'text',
        created_at: new Date().toISOString(),
        expires_at: new Date().toISOString(),
        delivered_to_recipient: false,
        delivered_to_recipient_primary: false,
        synced_to_sender_primary: false,
        status: 'sent',
        ...overrides,
    };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    sharedAckTracker.clear();
    mockIsPrimary.mockReturnValue(true);
});

afterEach(() => {
    jest.useRealTimers();
});

describe('ackIncomingMessages', () => {

    // ── Part A: Recipient ACK ─────────────────────────────────────────────

    describe('Part A — Recipient Batch ACK', () => {

        it('fires acknowledgeDeliveryBatch after debounce for incoming messages', () => {
            const msg = makeMessage({ message_id: 'msg-a1' });

            ackIncomingMessages([msg]);

            // Before debounce fires
            expect(mockAckDeliveryBatch).not.toHaveBeenCalled();

            // Advance past debounce (50ms)
            jest.advanceTimersByTime(60);

            expect(mockAckDeliveryBatch).toHaveBeenCalledWith({
                message_ids: ['msg-a1'],
                acknowledged_by: 'recipient',
                success: true,
            });
        });

        it('batches multiple calls within debounce window', () => {
            const msg1 = makeMessage({ message_id: 'msg-b1' });
            const msg2 = makeMessage({ message_id: 'msg-b2' });
            const msg3 = makeMessage({ message_id: 'msg-b3' });

            ackIncomingMessages([msg1]);
            ackIncomingMessages([msg2]);
            ackIncomingMessages([msg3]);

            jest.advanceTimersByTime(60);

            // Should fire ONE batch call with all 3 message IDs
            expect(mockAckDeliveryBatch).toHaveBeenCalledTimes(1);
            const callArgs = mockAckDeliveryBatch.mock.calls[0][0];
            expect(callArgs.message_ids).toContain('msg-b1');
            expect(callArgs.message_ids).toContain('msg-b2');
            expect(callArgs.message_ids).toContain('msg-b3');
        });

        it('skips messages that are already delivered', () => {
            const msg = makeMessage({
                message_id: 'msg-c1',
                delivered_to_recipient: true,
                delivered_to_recipient_primary: true,
            });

            ackIncomingMessages([msg]);
            jest.advanceTimersByTime(60);

            // No batch call because message is already delivered
            expect(mockAckDeliveryBatch).not.toHaveBeenCalled();
        });

        it('skips is_from_me messages (Part A only ACKs received messages)', () => {
            const msg = makeMessage({ message_id: 'msg-d1', is_from_me: true });

            ackIncomingMessages([msg], { skipSenderSync: true });
            jest.advanceTimersByTime(60);

            expect(mockAckDeliveryBatch).not.toHaveBeenCalled();
        });

        it('adds message IDs to sharedAckTracker during in-flight', () => {
            const msg = makeMessage({ message_id: 'msg-e1' });

            ackIncomingMessages([msg]);
            jest.advanceTimersByTime(60);

            expect(sharedAckTracker.has('msg-e1')).toBe(true);
        });

        it('skips messages already in sharedAckTracker', () => {
            const msg = makeMessage({ message_id: 'msg-f1' });
            sharedAckTracker.add('msg-f1');

            ackIncomingMessages([msg]);
            jest.advanceTimersByTime(60);

            expect(mockAckDeliveryBatch).not.toHaveBeenCalled();
        });
    });

    // ── Part B: Sender Sync ACK ───────────────────────────────────────────

    describe('Part B — Sender Sync ACK', () => {

        it('fires individual acknowledgeDelivery for is_from_me + !synced on primary device', () => {
            const msg = makeMessage({
                message_id: 'msg-g1',
                is_from_me: true,
                synced_to_sender_primary: false,
            });
            mockIsPrimary.mockReturnValue(true);

            ackIncomingMessages([msg]);

            // Part B fires immediately (no debounce for individual sender sync)
            expect(mockAckDelivery).toHaveBeenCalledWith({
                message_id: 'msg-g1',
                acknowledged_by: 'sender',
                success: true,
            });
        });

        it('does NOT fire sender sync when skipSenderSync is true', () => {
            const msg = makeMessage({
                message_id: 'msg-h1',
                is_from_me: true,
                synced_to_sender_primary: false,
            });

            ackIncomingMessages([msg], { skipSenderSync: true });

            expect(mockAckDelivery).not.toHaveBeenCalled();
        });

        it('does NOT fire sender sync on non-primary device', () => {
            const msg = makeMessage({
                message_id: 'msg-i1',
                is_from_me: true,
                synced_to_sender_primary: false,
            });
            mockIsPrimary.mockReturnValue(false);

            ackIncomingMessages([msg]);

            expect(mockAckDelivery).not.toHaveBeenCalled();
        });

        it('does NOT fire sender sync for already synced messages', () => {
            const msg = makeMessage({
                message_id: 'msg-j1',
                is_from_me: true,
                synced_to_sender_primary: true,
            });

            ackIncomingMessages([msg]);

            expect(mockAckDelivery).not.toHaveBeenCalled();
        });
    });

    // ── Empty / Edge Cases ────────────────────────────────────────────────

    describe('edge cases', () => {
        it('does nothing for empty message array', () => {
            ackIncomingMessages([]);
            jest.advanceTimersByTime(60);

            expect(mockAckDeliveryBatch).not.toHaveBeenCalled();
            expect(mockAckDelivery).not.toHaveBeenCalled();
        });

        it('handles mixed Part A + Part B messages in single call', () => {
            const incoming = makeMessage({
                message_id: 'msg-mix1',
                is_from_me: false,
                delivered_to_recipient: false,
            });
            const outgoing = makeMessage({
                message_id: 'msg-mix2',
                is_from_me: true,
                synced_to_sender_primary: false,
            });

            ackIncomingMessages([incoming, outgoing]);
            jest.advanceTimersByTime(60);

            // Part A: batch ack for the incoming message
            expect(mockAckDeliveryBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    message_ids: ['msg-mix1'],
                })
            );

            // Part B: individual ack for the outgoing message
            expect(mockAckDelivery).toHaveBeenCalledWith(
                expect.objectContaining({
                    message_id: 'msg-mix2',
                    acknowledged_by: 'sender',
                })
            );
        });

        it('handles messages from multiple chats in single call', () => {
            const msgChat1 = makeMessage({
                message_id: 'msg-multi1',
                chat_id: 'chat-1',
                is_from_me: false,
                delivered_to_recipient: false,
            });
            const msgChat2 = makeMessage({
                message_id: 'msg-multi2',
                chat_id: 'chat-2',
                is_from_me: false,
                delivered_to_recipient: false,
            });

            ackIncomingMessages([msgChat1, msgChat2]);
            jest.advanceTimersByTime(60);

            // Should fire separate batch calls per chat
            expect(mockAckDeliveryBatch).toHaveBeenCalledTimes(2);

            const call1 = mockAckDeliveryBatch.mock.calls[0][0];
            const call2 = mockAckDeliveryBatch.mock.calls[1][0];
            const allIds = [...call1.message_ids, ...call2.message_ids];
            expect(allIds).toContain('msg-multi1');
            expect(allIds).toContain('msg-multi2');
        });

        it('ACKs when delivered_to_recipient=false but delivered_to_recipient_primary=true on primary', () => {
            mockIsPrimary.mockReturnValue(true);
            const msg = makeMessage({
                message_id: 'msg-partial',
                is_from_me: false,
                delivered_to_recipient: false,
                delivered_to_recipient_primary: true,
            });

            ackIncomingMessages([msg]);
            jest.advanceTimersByTime(60);

            // Should still ACK because delivered_to_recipient is false
            expect(mockAckDeliveryBatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    message_ids: ['msg-partial'],
                })
            );
        });

        it('clears sharedAckTracker on batch ACK success', async () => {
            const msg = makeMessage({ message_id: 'msg-cleanup-ok' });

            ackIncomingMessages([msg]);
            jest.advanceTimersByTime(60);

            expect(sharedAckTracker.has('msg-cleanup-ok')).toBe(true);

            // Flush the resolved promise (.then callback)
            await Promise.resolve();

            expect(sharedAckTracker.has('msg-cleanup-ok')).toBe(false);
        });

        it('clears sharedAckTracker on batch ACK failure', async () => {
            mockAckDeliveryBatch.mockRejectedValueOnce(new Error('Network fail'));
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

            const msg = makeMessage({ message_id: 'msg-cleanup-fail' });

            ackIncomingMessages([msg]);
            jest.advanceTimersByTime(60);

            expect(sharedAckTracker.has('msg-cleanup-fail')).toBe(true);

            // Flush the rejected promise (.catch callback)
            await Promise.resolve();
            await Promise.resolve(); // extra tick for catch chain

            expect(sharedAckTracker.has('msg-cleanup-fail')).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Batch ACK failed'),
                expect.anything(),
            );

            warnSpy.mockRestore();
        });

        it('clears sharedAckTracker on sender sync ACK failure', async () => {
            mockAckDelivery.mockRejectedValueOnce(new Error('Sync fail'));
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

            const msg = makeMessage({
                message_id: 'msg-sync-fail',
                is_from_me: true,
                synced_to_sender_primary: false,
            });
            mockIsPrimary.mockReturnValue(true);

            ackIncomingMessages([msg]);

            expect(sharedAckTracker.has('msg-sync-fail')).toBe(true);

            // Flush the rejected promise
            await Promise.resolve();
            await Promise.resolve();

            expect(sharedAckTracker.has('msg-sync-fail')).toBe(false);
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Sync ACK failed'),
                expect.anything(),
            );

            warnSpy.mockRestore();
        });

        it('clears sharedAckTracker on sender sync ACK success', async () => {
            const msg = makeMessage({
                message_id: 'msg-sync-ok',
                is_from_me: true,
                synced_to_sender_primary: false,
            });
            mockIsPrimary.mockReturnValue(true);

            ackIncomingMessages([msg]);

            expect(sharedAckTracker.has('msg-sync-ok')).toBe(true);

            // Flush the resolved promise
            await Promise.resolve();

            expect(sharedAckTracker.has('msg-sync-ok')).toBe(false);
        });
    });
});
