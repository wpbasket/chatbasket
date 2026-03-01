import { batch } from '@legendapp/state';
import { $chatMessagesState, $chatListState } from './personal.state.chat';
import { PersonalChatApi } from '@/lib/personalLib/chatApi/personal.api.chat';

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
            const response = await PersonalChatApi.getSyncActions({ limit: 50 });
            if (!response?.actions || response.actions.length === 0) return;

            batch(() => {
                for (const action of response.actions) {
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
                                }

                                // 2. If it's an unsend, the backend updated the chat unread count.
                                // Instead of complex tracking, we'll let the next chat list fetch refresh the counts,
                                // or we can trigger a targeted refresh here if we want immediate list updates.
                                if (action.action_type === 'unsend') {
                                    // Implementation Note: We could trigger PersonalChatApi.getUserChats() 
                                    // if we want to sync the Chat List preview immediately.
                                }
                            }
                        }

                        // Always acknowledge successful processing to clear it from the relay
                        PersonalChatApi.acknowledgeSyncAction({ action_id: action.id })
                            .catch(err => console.error(`[SyncEngine] ACK failed for ${action.id}`, err));

                    } catch (actionErr) {
                        console.error(`[SyncEngine] Failed to process action ${action.id}`, actionErr);
                    }
                }
            });
        } catch (err) {
            console.error('[SyncEngine] Polling cycle failed', err);
        } finally {
            isPolling = false;
        }
    },

    /**
     * Perform a one-time catch-up fetch to apply pending sync actions.
     */
    async catchUp() {
        if (hasSynced) return;
        hasSynced = true;
        console.log('[SyncEngine] Performing one-time catch-up');
        await this.fetchAndApply();
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
