import { batch } from '@legendapp/state';
import { $chatMessagesState, $chatListState } from './personal.state.chat';
import { ChatTransport } from '@/lib/personalLib/chatApi/chat.transport';
import * as ChatStorage from '@/lib/storage/personalStorage/chat/chat.storage';

let syncInterval: any = null;
let isPolling = false;
let hasSynced = false;

/**
 * $syncEngine orchestrates the synchronization of revocation (unsend)
 * and deletion actions across all user devices.
 */
export const $syncEngine = {
    /**
     * Fetch pending sync actions from the backend and apply them to local state.
     */
    async fetchAndApply() {
        if (isPolling) return;
        isPolling = true;

        try {
            const response = await ChatTransport.getSyncActions({ limit: 50 });
            if (!response?.actions || response.actions.length === 0) return;

            // Phase 5a: Persist changes to local storage BEFORE updating state
            const persistFailedIds = new Set<string>();
            for (const action of response.actions) {
                try {
                    const { message_ids } = action.payload;
                    if (Array.isArray(message_ids)) {
                        for (const id of message_ids) {
                            if (action.action_type === 'unsend') {
                                await ChatStorage.updateMessageStatus(id, { message_type: 'unsent' });
                            } else if (action.action_type === 'delete_for_me') {
                                await ChatStorage.deleteMessage(id);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`[SyncEngine] Failed to persist action ${action.id} to storage — will NOT ACK`, e);
                    persistFailedIds.add(action.id);
                }
            }

            // Collect action IDs to ACK after batch completes successfully
            const actionsToAck: string[] = [];

            batch(() => {
                for (const action of response.actions) {
                    // Skip actions that failed to persist — they must not be ACK'd or applied to state
                    if (persistFailedIds.has(action.id)) continue;

                    try {
                        const payload = action.payload;

                        // Handle 'unsend' or 'delete_for_me' signals
                        if (action.action_type === 'unsend' || action.action_type === 'delete_for_me') {
                            const { chat_id, message_ids } = payload;

                            if (chat_id && Array.isArray(message_ids)) {
                                if (action.action_type === 'unsend') {
                                    $chatMessagesState.unsendMessages(chat_id, message_ids);
                                } else {
                                    $chatMessagesState.removeMessages(chat_id, message_ids);
                                    $chatListState.clearPreviewIfLastMessage(chat_id, message_ids);
                                }
                            }
                        }

                        actionsToAck.push(action.id);
                    } catch (actionErr) {
                        console.error(`[SyncEngine] Failed to process action ${action.id}`, actionErr);
                    }
                }
            });

            // ACK after batch completes — prevents ACKing actions whose state update failed
            for (const actionId of actionsToAck) {
                ChatTransport.acknowledgeSyncAction({ action_id: actionId })
                    .catch(err => console.error(`[SyncEngine] ACK failed for ${actionId}`, err));
            }
        } catch (err) {
            console.error('[SyncEngine] Sync fetch failed', err);
        } finally {
            isPolling = false;
        }
    },

    /**
     * Perform a one-time catch-up fetch to apply pending sync actions.
     */
    async catchUp() {
        if (hasSynced) return;
        console.log('[SyncEngine] Performing one-time catch-up');
        try {
            await this.fetchAndApply();
            hasSynced = true; // Only mark synced on success
        } catch (err) {
            console.error('[SyncEngine] Catch-up failed — will retry on next call', err);
        }
    },

    /**
     * @deprecated Polling is disabled per user request. Use catchUp() instead.
     */
    stop() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
    }
};
