/**
 * Tests for chat.transport.ts — Phase C Transport Layer
 *
 * Verifies:
 *  1. WS-first routing: Uses wsClient.send when connected
 *  2. REST fallback: Falls back to PersonalChatApi on transport errors
 *  3. Server error propagation: Re-throws server errors (no REST retry)
 *  4. Disconnected path: Goes straight to REST when WS is not connected
 *  5. All 7 WS-first actions have correct WS type strings
 *  6. REST-only pass-throughs are correctly wired
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockWsSend = jest.fn();
const mockIsConnected = jest.fn(() => false);

jest.mock('@/lib/personalLib/chatApi/ws.client', () => ({
    wsClient: {
        get isConnected() {
            return mockIsConnected();
        },
        send: (...args: any[]) => mockWsSend(...args),
    },
}));

const mockSendMessage = jest.fn();
const mockAckDelivery = jest.fn();
const mockAckDeliveryBatch = jest.fn();
const mockMarkChatRead = jest.fn();
const mockUnsendMessage = jest.fn();
const mockDeleteMessageForMe = jest.fn();
const mockAckSyncAction = jest.fn();
const mockGetMessages = jest.fn();
const mockGetPendingMessages = jest.fn();
const mockGetUserChats = jest.fn();
const mockGetSyncActions = jest.fn();
const mockGetFileURL = jest.fn();
const mockUploadFile = jest.fn();
const mockUploadFileWithProgress = jest.fn();
const mockCheckEligibility = jest.fn();
const mockCreateChat = jest.fn();

jest.mock('@/lib/personalLib/chatApi/personal.api.chat', () => {
    // Use a lazy object that defers to the mock variables at call time,
    // avoiding the TDZ issue caused by jest.mock hoisting.
    return {
        PersonalChatApi: {
            sendMessage: (...args: any[]) => mockSendMessage(...args),
            acknowledgeDelivery: (...args: any[]) => mockAckDelivery(...args),
            acknowledgeDeliveryBatch: (...args: any[]) => mockAckDeliveryBatch(...args),
            markChatRead: (...args: any[]) => mockMarkChatRead(...args),
            unsendMessage: (...args: any[]) => mockUnsendMessage(...args),
            deleteMessageForMe: (...args: any[]) => mockDeleteMessageForMe(...args),
            acknowledgeSyncAction: (...args: any[]) => mockAckSyncAction(...args),
            getMessages: (...args: any[]) => mockGetMessages(...args),
            getPendingMessages: (...args: any[]) => mockGetPendingMessages(...args),
            getUserChats: (...args: any[]) => mockGetUserChats(...args),
            getSyncActions: (...args: any[]) => mockGetSyncActions(...args),
            getFileURL: (...args: any[]) => mockGetFileURL(...args),
            uploadFile: (...args: any[]) => mockUploadFile(...args),
            uploadFileWithProgress: (...args: any[]) => mockUploadFileWithProgress(...args),
            checkEligibility: (...args: any[]) => mockCheckEligibility(...args),
            createChat: (...args: any[]) => mockCreateChat(...args),
        },
    };
});

// ─── Import after mocks ─────────────────────────────────────────────────────

import { ChatTransport } from '@/lib/personalLib/chatApi/chat.transport';

// ─── Helpers ────────────────────────────────────────────────────────────────

const mockMessageEntry = {
    message_id: 'msg-1',
    chat_id: 'chat-1',
    is_from_me: true,
    recipient_id: 'user-2',
    content: 'Hello',
    message_type: 'text',
    created_at: new Date().toISOString(),
    expires_at: new Date().toISOString(),
    delivered_to_recipient: false,
    synced_to_sender_primary: true,
};

beforeEach(() => {
    jest.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ChatTransport', () => {

    // ── WS-first routing ──────────────────────────────────────────────────

    describe('when WS is connected', () => {
        beforeEach(() => {
            mockIsConnected.mockReturnValue(true);
        });

        it('sendMessage routes through WS with correct type string', async () => {
            mockWsSend.mockResolvedValue(mockMessageEntry);
            const payload = { recipient_id: 'user-2', content: 'Hello', message_type: 'text' };

            const result = await ChatTransport.sendMessage(payload);

            expect(mockWsSend).toHaveBeenCalledWith('send_message', payload);
            expect(mockSendMessage).not.toHaveBeenCalled();
            expect(result).toEqual(mockMessageEntry);
        });

        it('acknowledgeDelivery routes through WS with correct type string', async () => {
            const response = { acknowledged: true };
            mockWsSend.mockResolvedValue(response);
            const payload = { message_id: 'msg-1', acknowledged_by: 'recipient' as const, success: true };

            const result = await ChatTransport.acknowledgeDelivery(payload);

            expect(mockWsSend).toHaveBeenCalledWith('ack_delivery', payload);
            expect(mockAckDelivery).not.toHaveBeenCalled();
            expect(result).toEqual(response);
        });

        it('acknowledgeDeliveryBatch routes through WS with correct type string', async () => {
            const response = { acknowledged_count: 3 };
            mockWsSend.mockResolvedValue(response);
            const payload = { message_ids: ['m1', 'm2', 'm3'], acknowledged_by: 'recipient' as const, success: true };

            const result = await ChatTransport.acknowledgeDeliveryBatch(payload);

            expect(mockWsSend).toHaveBeenCalledWith('ack_delivery_batch', payload);
            expect(mockAckDeliveryBatch).not.toHaveBeenCalled();
            expect(result).toEqual(response);
        });

        it('markChatRead routes through WS with correct type string', async () => {
            const response = { status: true, message: 'success' };
            mockWsSend.mockResolvedValue(response);
            const payload = { chat_id: 'chat-1' };

            const result = await ChatTransport.markChatRead(payload);

            expect(mockWsSend).toHaveBeenCalledWith('mark_read', payload);
            expect(mockMarkChatRead).not.toHaveBeenCalled();
            expect(result).toEqual(response);
        });

        it('unsendMessage routes through WS with correct type string', async () => {
            const response = { status: true, message: 'success' };
            mockWsSend.mockResolvedValue(response);
            const payload = { chat_id: 'chat-1', message_ids: ['msg-1'] };

            const result = await ChatTransport.unsendMessage(payload);

            expect(mockWsSend).toHaveBeenCalledWith('unsend', payload);
            expect(mockUnsendMessage).not.toHaveBeenCalled();
            expect(result).toEqual(response);
        });

        it('deleteMessageForMe routes through WS with correct type string', async () => {
            const response = { status: true, message: 'success' };
            mockWsSend.mockResolvedValue(response);
            const payload = { message_ids: ['msg-1'] };

            const result = await ChatTransport.deleteMessageForMe(payload);

            expect(mockWsSend).toHaveBeenCalledWith('delete_for_me', payload);
            expect(mockDeleteMessageForMe).not.toHaveBeenCalled();
            expect(result).toEqual(response);
        });

        it('acknowledgeSyncAction routes through WS with correct type string', async () => {
            const response = { status: true, message: 'success' };
            mockWsSend.mockResolvedValue(response);
            const payload = { action_id: 'act-1' };

            const result = await ChatTransport.acknowledgeSyncAction(payload);

            expect(mockWsSend).toHaveBeenCalledWith('ack_sync_action', payload);
            expect(mockAckSyncAction).not.toHaveBeenCalled();
            expect(result).toEqual(response);
        });
    });

    // ── REST fallback on transport error ─────────────────────────────────

    describe('WS transport error → REST fallback', () => {
        beforeEach(() => {
            mockIsConnected.mockReturnValue(true);
        });

        it('falls back to REST when WS throws a transport error ([WS Client] prefix)', async () => {
            mockWsSend.mockRejectedValue(new Error('[WS Client] Request "send_message" timed out after 10000ms'));
            mockSendMessage.mockResolvedValue(mockMessageEntry);

            const payload = { recipient_id: 'user-2', content: 'Hello', message_type: 'text' };
            const result = await ChatTransport.sendMessage(payload);

            expect(mockWsSend).toHaveBeenCalledWith('send_message', payload);
            expect(mockSendMessage).toHaveBeenCalledWith(payload);
            expect(result).toEqual(mockMessageEntry);
        });

        it('falls back to REST when WS throws connection-related transport error', async () => {
            mockWsSend.mockRejectedValue(new Error('[WS Client] Cannot send "mark_read": WebSocket is not connected'));
            mockMarkChatRead.mockResolvedValue({ status: true, message: 'success' });

            const payload = { chat_id: 'chat-1' };
            const result = await ChatTransport.markChatRead(payload);

            expect(mockMarkChatRead).toHaveBeenCalledWith(payload);
            expect(result).toEqual({ status: true, message: 'success' });
        });
    });

    // ── Server error propagation (no REST retry) ─────────────────────────

    describe('server error → re-throw without REST retry', () => {
        beforeEach(() => {
            mockIsConnected.mockReturnValue(true);
        });

        it('re-throws server errors (no [WS Client] prefix) without falling back to REST', async () => {
            const serverError = new Error('Chat not found');
            mockWsSend.mockRejectedValue(serverError);

            const payload = { chat_id: 'chat-1', message_ids: ['msg-1'] };

            await expect(ChatTransport.unsendMessage(payload)).rejects.toThrow('Chat not found');
            expect(mockUnsendMessage).not.toHaveBeenCalled();
        });

        it('re-throws 403 permission errors without REST retry', async () => {
            const serverError = new Error('Not authorized to unsend this message');
            mockWsSend.mockRejectedValue(serverError);

            const payload = { chat_id: 'chat-1', message_ids: ['msg-1'] };

            await expect(ChatTransport.unsendMessage(payload)).rejects.toThrow('Not authorized');
            expect(mockUnsendMessage).not.toHaveBeenCalled();
        });
    });

    // ── Disconnected path → straight to REST ─────────────────────────────

    describe('when WS is disconnected', () => {
        beforeEach(() => {
            mockIsConnected.mockReturnValue(false);
        });

        it('sends via REST directly when WS is not connected', async () => {
            mockSendMessage.mockResolvedValue(mockMessageEntry);

            const payload = { recipient_id: 'user-2', content: 'Hello', message_type: 'text' };
            const result = await ChatTransport.sendMessage(payload);

            expect(mockWsSend).not.toHaveBeenCalled();
            expect(mockSendMessage).toHaveBeenCalledWith(payload);
            expect(result).toEqual(mockMessageEntry);
        });

        it('acknowledgeDeliveryBatch goes through REST when disconnected', async () => {
            const response = { acknowledged_count: 2 };
            mockAckDeliveryBatch.mockResolvedValue(response);

            const payload = { message_ids: ['m1', 'm2'], acknowledged_by: 'recipient' as const, success: true };
            const result = await ChatTransport.acknowledgeDeliveryBatch(payload);

            expect(mockWsSend).not.toHaveBeenCalled();
            expect(mockAckDeliveryBatch).toHaveBeenCalledWith(payload);
            expect(result).toEqual(response);
        });
    });

    // ── REST-only pass-throughs ──────────────────────────────────────────
    // Note: jest.mock is hoisted above const declarations, so we can't check
    // reference identity (they capture before const init). Instead we verify
    // that calling the pass-through delegates to the underlying mock.

    describe('REST-only pass-throughs', () => {
        it('getMessages delegates to PersonalChatApi.getMessages', async () => {
            const expected = { messages: [], count: 0 };
            mockGetMessages.mockResolvedValue(expected);
            const result = await ChatTransport.getMessages({ chat_id: 'c1', limit: 50, offset: 0 });
            expect(result).toEqual(expected);
        });

        it('getPendingMessages delegates to PersonalChatApi.getPendingMessages', async () => {
            const expected = { messages: [] };
            mockGetPendingMessages.mockResolvedValue(expected);
            const result = await ChatTransport.getPendingMessages({ limit: 50 });
            expect(result).toEqual(expected);
        });

        it('getUserChats delegates to PersonalChatApi.getUserChats', async () => {
            const expected = { chats: [], count: 0 };
            mockGetUserChats.mockResolvedValue(expected);
            const result = await ChatTransport.getUserChats();
            expect(result).toEqual(expected);
        });

        it('getSyncActions delegates to PersonalChatApi.getSyncActions', async () => {
            const expected = { actions: [] };
            mockGetSyncActions.mockResolvedValue(expected);
            const result = await ChatTransport.getSyncActions({ limit: 50 });
            expect(result).toEqual(expected);
        });

        it('getFileURL delegates to PersonalChatApi.getFileURL', async () => {
            mockGetFileURL.mockResolvedValue('https://example.com/file.jpg');
            const result = await ChatTransport.getFileURL({ message_id: 'msg-1' });
            expect(result).toBe('https://example.com/file.jpg');
        });

        it('uploadFile delegates to PersonalChatApi.uploadFile', async () => {
            const expected = { file_id: 'f1' };
            mockUploadFile.mockResolvedValue(expected);
            const result = await ChatTransport.uploadFile(new FormData());
            expect(result).toEqual(expected);
        });

        it('uploadFileWithProgress delegates to PersonalChatApi.uploadFileWithProgress', async () => {
            const expected = { file_id: 'f1' };
            mockUploadFileWithProgress.mockResolvedValue(expected);
            const cb = jest.fn();
            const result = await ChatTransport.uploadFileWithProgress(new FormData(), cb);
            expect(result).toEqual(expected);
        });

        it('checkEligibility delegates to PersonalChatApi.checkEligibility', async () => {
            const expected = { allowed: true };
            mockCheckEligibility.mockResolvedValue(expected);
            const result = await ChatTransport.checkEligibility({ recipient_id: 'u1' });
            expect(result).toEqual(expected);
        });

        it('createChat delegates to PersonalChatApi.createChat', async () => {
            const expected = { chat_id: 'c1' };
            mockCreateChat.mockResolvedValue(expected);
            const result = await ChatTransport.createChat({ recipient_id: 'u1' });
            expect(result).toEqual(expected);
        });
    });

    // ── REST fallback also fails ─────────────────────────────────────────

    describe('WS error + REST error → propagates REST error', () => {
        it('propagates REST error when both WS and REST fail', async () => {
            mockIsConnected.mockReturnValue(true);
            mockWsSend.mockRejectedValue(new Error('[WS Client] Request timed out'));
            mockSendMessage.mockRejectedValue(new Error('Network error'));

            const payload = { recipient_id: 'user-2', content: 'Hello', message_type: 'text' };

            await expect(ChatTransport.sendMessage(payload)).rejects.toThrow('Network error');
            expect(mockWsSend).toHaveBeenCalled();
            expect(mockSendMessage).toHaveBeenCalled();
        });
    });

    // ── Non-Error throw → treated as server error (no REST fallback) ────

    describe('non-Error thrown by WS', () => {
        it('does not fall back to REST when WS throws a non-Error value', async () => {
            mockIsConnected.mockReturnValue(true);
            mockWsSend.mockRejectedValue('string error');

            const payload = { chat_id: 'chat-1', message_ids: ['msg-1'] };

            await expect(ChatTransport.unsendMessage(payload)).rejects.toBe('string error');
            expect(mockUnsendMessage).not.toHaveBeenCalled();
        });
    });
});
