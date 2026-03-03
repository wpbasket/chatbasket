/**
 * Chat Transport Layer
 *
 * Routes real-time chat actions through WebSocket (when connected) or REST (as fallback).
 * This is the single call-point for all chat actions — state, UI, and Phase D outbox queue
 * all import from here. Never import PersonalChatApi directly for real-time actions.
 *
 * Architecture:
 *   UI / State / Outbox Queue
 *       ↓
 *   chat.transport.ts        ← YOU ARE HERE
 *       ↓ WS connected           ↓ WS disconnected or transport error
 *   ws.client.ts             personal.api.chat.ts (pure REST)
 *
 * WS-first actions:   sendMessage, acknowledgeDelivery, acknowledgeDeliveryBatch,
 *                     markChatRead, unsendMessage, deleteMessageForMe, acknowledgeSyncAction
 * REST-only actions:  getMessages, getPendingMessages, getUserChats, getSyncActions,
 *                     getFileURL, uploadFile, uploadFileWithProgress,
 *                     checkEligibility, createChat
 */
import { wsClient } from './ws.client';
import { PersonalChatApi } from './personal.api.chat';
import type {
    SendMessagePayload,
    AckDeliveryPayload,
    AckDeliveryBatchPayload,
    AckDeliveryResponse,
    AckDeliveryBatchResponse,
    StatusOkayResponse,
    MarkChatReadPayload,
    UnsendMessagePayload,
    DeleteMessageForMePayload,
    AcknowledgeSyncActionPayload,
    MessageEntry,
} from '@/lib/personalLib';

// ─── Transport Core ──────────────────────────────────────────────────────────

/**
 * Attempt WS first. Falls back to REST only on transport errors (timeout, connection drop).
 * Server errors (4xx/5xx) are re-thrown immediately — REST would fail the same way.
 */
async function request<T>(type: string, payload: any, restAction: () => Promise<T>): Promise<T> {
    if (wsClient.isConnected) {
        try {
            return await wsClient.send<T>(type, payload);
        } catch (err) {
            // "[WS Client]" prefix = transport error → safe to retry via REST
            const isTransportError = err instanceof Error && err.message.startsWith('[WS Client]');
            if (!isTransportError) {
                throw err; // Server explicitly rejected — don't mask with REST retry
            }
            console.warn(`[Transport] WS "${type}" failed (transport/timeout), falling back to REST:`, err);
            return restAction();
        }
    }
    return restAction();
}

// ─── WS-first Actions ────────────────────────────────────────────────────────

async function sendMessage(payload: SendMessagePayload): Promise<MessageEntry> {
    return request('send_message', payload, () => PersonalChatApi.sendMessage(payload));
}

async function acknowledgeDelivery(payload: AckDeliveryPayload): Promise<AckDeliveryResponse> {
    return request('ack_delivery', payload, () => PersonalChatApi.acknowledgeDelivery(payload));
}

async function acknowledgeDeliveryBatch(payload: AckDeliveryBatchPayload): Promise<AckDeliveryBatchResponse> {
    return request('ack_delivery_batch', payload, () => PersonalChatApi.acknowledgeDeliveryBatch(payload));
}

async function markChatRead(payload: MarkChatReadPayload): Promise<StatusOkayResponse> {
    return request('mark_read', payload, () => PersonalChatApi.markChatRead(payload));
}

async function unsendMessage(payload: UnsendMessagePayload): Promise<StatusOkayResponse> {
    return request('unsend', payload, () => PersonalChatApi.unsendMessage(payload));
}

async function deleteMessageForMe(payload: DeleteMessageForMePayload): Promise<StatusOkayResponse> {
    return request('delete_for_me', payload, () => PersonalChatApi.deleteMessageForMe(payload));
}

async function acknowledgeSyncAction(payload: AcknowledgeSyncActionPayload): Promise<StatusOkayResponse> {
    return request('ack_sync_action', payload, () => PersonalChatApi.acknowledgeSyncAction(payload));
}

// ─── Export ──────────────────────────────────────────────────────────────────

export const ChatTransport = {
    // WS-first (with REST fallback)
    sendMessage,
    acknowledgeDelivery,
    acknowledgeDeliveryBatch,
    markChatRead,
    unsendMessage,
    deleteMessageForMe,
    acknowledgeSyncAction,

    // REST-only pass-throughs (bulk fetch, file ops, one-time actions)
    // Included here so callers only need one import.
    getMessages:             PersonalChatApi.getMessages,
    getPendingMessages:      PersonalChatApi.getPendingMessages,
    getUserChats:            PersonalChatApi.getUserChats,
    getSyncActions:          PersonalChatApi.getSyncActions,
    getFileURL:              PersonalChatApi.getFileURL,
    uploadFile:              PersonalChatApi.uploadFile,
    uploadFileWithProgress:  PersonalChatApi.uploadFileWithProgress,
    checkEligibility:        PersonalChatApi.checkEligibility,
    createChat:              PersonalChatApi.createChat,
};
