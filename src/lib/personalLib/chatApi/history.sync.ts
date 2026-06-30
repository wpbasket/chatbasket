import { ChatTransport } from './chat.transport';
import { authState } from '@/state/auth/state.auth';
import { $chatMessagesState, $chatListState } from '@/state/personalState/chat/personal.state.chat';
import { getHistorySyncHaveIds, getHistorySyncPayload } from '../../storage/personalStorage/chat/chat.storage';
import { encryptPayloadEnvelope, decryptPayloadEnvelope } from '../e2ee/e2ee.crypto';
import { getMyPublicKey, getMyPrivateKey, whenKeyInitSettled } from '../e2ee/e2ee.keys';
import type { MessageEntry } from '@/lib/personalLib';

import { observable } from '@legendapp/state';

let hasCompletedHistorySyncThisSession = false;
export const historySyncStatus$ = observable<'idle' | 'syncing' | 'success' | 'failed' | 'primary_offline'>('idle');
let syncTimeoutHandle: NodeJS.Timeout | null = null;
export async function initiateHistorySync(force = false): Promise<void> {
    if (authState.isPrimary.peek() !== false) {
        return; // Guard #6: Only secondary devices request history sync
    }
    if (force) {
        hasCompletedHistorySyncThisSession = false;
    }
    if (hasCompletedHistorySyncThisSession) {
        return; // Throttle: only one successful sync per session
    }

    historySyncStatus$.set('syncing');

    try {
        await whenKeyInitSettled(); // Guard #7: Wait for E2EE keys to load
        const myPublicKey = getMyPublicKey();
        const myPrivateKey = getMyPrivateKey();
        const primaryPublicKey = authState.primaryKey.peek();

        if (!myPublicKey || !myPrivateKey || !primaryPublicKey) {
            console.warn('[HistorySync] E2EE keys not ready for history sync request');
            return;
        }

        // Gather have_ids
        const haveIdsMap = await getHistorySyncHaveIds();

        // Ensure every chat in the chat list is requested, even if it has no local messages (have_ids = [])
        const allChatIds = Object.keys($chatListState.chatsById.peek() || {});
        for (const chatId of allChatIds) {
            if (!haveIdsMap[chatId]) {
                haveIdsMap[chatId] = [];
            }
        }

        const chatsList = Object.entries(haveIdsMap).map(([chatId, haveIds]) => ({
            chat_id: chatId,
            have_ids: haveIds,
        }));

        const payloadObj = { chats: chatsList };
        // Guard #1: E2EEV3Payload type constraint requires serializing structure as 'text' field
        const chatsCipher = encryptPayloadEnvelope(
            { type: 'text', text: JSON.stringify(payloadObj) },
            [primaryPublicKey, myPublicKey]
        );


        await ChatTransport.requestHistorySync({ 
            chats_cipher: chatsCipher, 
            used_primary_key: primaryPublicKey 
        });

        if (syncTimeoutHandle) {
            clearTimeout(syncTimeoutHandle);
        }
        syncTimeoutHandle = setTimeout(() => {
            if (historySyncStatus$.peek() === 'syncing') {
                console.warn('[HistorySync] Timeout waiting for primary response.');
                historySyncStatus$.set('failed');
            }
        }, 30000);

        // We do not wait for the promise blockingly in the trigger path.
        // It will be resolved when the WS event bridge receives 'history_sync_ready'.
    } catch (err: any) {
        if (err?.type === 'key_mismatch') {
            console.warn('[HistorySync] Primary key mismatch. Fetching fresh key and retrying...');
            try {
                const { commonAuthApi } = await import('@/lib/commonLib/authApi/common.api.auth');
                const me = await commonAuthApi.getMe();
                const primaryPublicKey = authState.primaryKey.peek();
                if (me && me.primaryKey && me.primaryKey !== primaryPublicKey) {
                    const { setStoredPrimaryKey } = await import('@/lib/storage/commonStorage/storage.auth');
                    await setStoredPrimaryKey(me.primaryKey);
                    // Retry immediately (force=true)
                    return initiateHistorySync(true);
                }
            } catch (retryErr) {
                console.error('[HistorySync] Failed to recover from key_mismatch:', retryErr);
            }
        }

        if (err?.type === 'primary_offline') {
            console.warn('[HistorySync] Primary device is offline.');
            historySyncStatus$.set('primary_offline');
            return;
        }

        historySyncStatus$.set('failed');
        console.error('[HistorySync] Failed to initiate history sync:', err);
    }
}

export async function processHistorySyncReady(requestId: string): Promise<void> {
    if (authState.isPrimary.peek() !== false) {
        return;
    }
    if (hasCompletedHistorySyncThisSession) {
        return;
    }

    try {
        await whenKeyInitSettled();
        const myPublicKey = getMyPublicKey();
        const myPrivateKey = getMyPrivateKey();

        if (!myPublicKey || !myPrivateKey) {
            console.warn('[HistorySync] E2EE keys not ready for processing history sync ready');
            return;
        }

        const response = await ChatTransport.downloadHistorySync(requestId);
        if (!response.payload_cipher) {
            console.warn('[HistorySync] Payload cipher is empty');
            return;
        }

        const decryptedPayload = decryptPayloadEnvelope(response.payload_cipher, myPublicKey, myPrivateKey);
        if (decryptedPayload.type !== 'text') {
            console.warn('[HistorySync] Invalid payload envelope type:', decryptedPayload.type);
            return;
        }

        const payloadObj = JSON.parse(decryptedPayload.text);
        if (!payloadObj || !Array.isArray(payloadObj.chats)) {
            console.warn('[HistorySync] Invalid inner history sync payload structure');
            return;
        }

        const myUserId = authState.userId.peek() || '';

        // Ingest chats
        let totalInserted = 0;
        for (const chat of payloadObj.chats) {
            if (!chat.chat_id || !Array.isArray(chat.messages)) continue;

            const convertedMessages: MessageEntry[] = chat.messages.map((m: any) => {
                const isFromMe = m.sender_id === myUserId;
                const recipientId = isFromMe ? chat.chat_id : myUserId;
                return {
                    message_id: m.id,
                    chat_id: chat.chat_id,
                    is_from_me: isFromMe,
                    recipient_id: recipientId,
                    content: m.content || '',
                    message_type: m.message_type || 'text',
                    delivered_to_recipient: !!m.delivered_to_recipient,
                    created_at: m.created_at,
                    expires_at: m.expires_at || '',
                    status: 'sent', // Arriving synced messages are already server-confirmed
                } as MessageEntry;
            });

            if (convertedMessages.length > 0) {
                // Guard #3: skip E2EE decryption using allowLocalPlaintext: true
                await $chatMessagesState.setMessages(chat.chat_id, convertedMessages, { allowLocalPlaintext: true });
                totalInserted += convertedMessages.length;
            }
        }

        hasCompletedHistorySyncThisSession = true;
        historySyncStatus$.set('success');
        console.log(`[HistorySync] Completed processing. Inserted ${totalInserted} messages.`);
    } catch (err) {
        historySyncStatus$.set('failed');
        console.error('[HistorySync] Failed to process history sync ready:', err);
    }
}

export async function handlePrimaryUploadRequest(
    requestId: string,
    requesterPublicKey: string,
    chatsCipher: string
): Promise<void> {
    if (authState.isPrimary.peek() !== true) {
        return; // Guard: only primary uploads
    }

    try {
        await whenKeyInitSettled();
        const myPublicKey = getMyPublicKey();
        const myPrivateKey = getMyPrivateKey();

        if (!myPublicKey || !myPrivateKey) {
            console.warn('[HistorySync] E2EE keys not ready for upload handling');
            return;
        }

        const decryptedRequest = decryptPayloadEnvelope(chatsCipher, myPublicKey, myPrivateKey);
        if (decryptedRequest.type !== 'text') {
            console.warn('[HistorySync] Invalid request envelope type:', decryptedRequest.type);
            return;
        }

        const requestObj = JSON.parse(decryptedRequest.text);
        if (!requestObj || !Array.isArray(requestObj.chats)) {
            console.warn('[HistorySync] Invalid inner request structure');
            return;
        }

        const responseChats: any[] = [];
        const myUserId = authState.userId.peek() || '';

        for (const chat of requestObj.chats) {
            if (!chat.chat_id || !Array.isArray(chat.have_ids)) continue;

            const diffMessages = await getHistorySyncPayload(chat.chat_id, chat.have_ids);
            const wireMessages = diffMessages.map((m) => {
                // Guard #2: Convert is_from_me back to sender_id and recipient_id for the wire
                const senderId = m.is_from_me ? myUserId : chat.chat_id;
                const recipientId = m.is_from_me ? chat.chat_id : myUserId;
                return {
                    id: m.message_id,
                    sender_id: senderId,
                    recipient_id: recipientId,
                    message_type: m.message_type,
                    content: m.content || '',
                    created_at: m.created_at,
                    expires_at: m.expires_at || '',
                    delivered_to_recipient: !!m.delivered_to_recipient,
                };
            });

            responseChats.push({
                chat_id: chat.chat_id,
                messages: wireMessages,
            });
        }

        const responseObj = { chats: responseChats };
        const responseCipher = encryptPayloadEnvelope(
            { type: 'text', text: JSON.stringify(responseObj) },
            [requesterPublicKey, myPublicKey]
        );

        await ChatTransport.uploadHistorySync({
            request_id: requestId,
            payload_cipher: responseCipher,
        });
    } catch (err: any) {
        if (err?.status === 410) {
            console.log('[HistorySync] Request superseded/expired (410), upload abandoned silently');
            return;
        }
        console.error('[HistorySync] Failed to upload history sync:', err);
    }
}
