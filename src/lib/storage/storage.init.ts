import { initializeSecureStorage, restoreAuthState } from './commonStorage/storage.auth';
import { initializeContactsStorage, PersonalStorageLoadContactRequests, PersonalStorageLoadContacts } from './personalStorage/personal.storage.contacts';
import { PersonalStorageGetDeviceStatus } from './personalStorage/personal.storage.device';
import { PersonalStorageGetUser } from './personalStorage/personal.storage.user';
import { initChatStorage, clearAllChatStorage, purgeDeletedMessages, cleanupOrphanedMedia } from './personalStorage/chat/chat.storage';
import { connectionWatcher } from '@/lib/personalLib/chatApi/connection.watcher';
import { outboxQueue } from '@/lib/personalLib/chatApi/outbox.queue';
import { authState } from '@/state/auth/state.auth';

/**
 * Orchestrates the initialization of all storage modules and restores app state.
 * Should be called once in the Root Layout.
 */
export const initializeAppStorage = async (): Promise<void> => {
    try {
        // 1. Initialize core secure storage (Auth)
        await initializeSecureStorage();

        // 2. Restore core Auth state (Session, UserId)
        await restoreAuthState();

        // 3. If logged in, hydrate the rest of the persistent state
        if (authState.isLoggedIn.get()) {
            await Promise.all([
                PersonalStorageGetUser(),
                PersonalStorageGetDeviceStatus(),
                initChatStorage(),
                initializeContactsStorage().then(() => Promise.all([
                    PersonalStorageLoadContacts(),
                    PersonalStorageLoadContactRequests()
                ]))
            ]);

            // Phase 4e: Start connection watcher + drain outbox queue
            connectionWatcher.start();
            outboxQueue.processQueue();

            // Phase D: Purge soft-deleted rows 60s after network is confirmed online.
            // This ensures initial sync + WebSocket events have been processed first,
            // so getDeletedMessageIds guards are no longer needed for those messages.
            const schedulePurge = () => {
                setTimeout(() => {
                    purgeDeletedMessages().catch(err =>
                        console.warn('[StorageInit] purgeDeletedMessages failed:', err)
                    );
                    cleanupOrphanedMedia().catch(err =>
                        console.warn('[StorageInit] cleanupOrphanedMedia failed:', err)
                    );
                }, 60_000);
            };

            if (connectionWatcher.isOnline) {
                schedulePurge();
            } else {
                // Wait for the first online transition, then start the 60s timer
                const unsub = connectionWatcher.subscribe((isOnline) => {
                    if (isOnline) {
                        unsub();
                        schedulePurge();
                    }
                });
            }
        } else {
            // Safety net: wipe any leftover ChatStorage from a failed/incomplete logout
            // (e.g. browser crashed, force-close, etc.)
            try {
                await clearAllChatStorage();
                console.log('[StorageInit] Cleaned up leftover ChatStorage (not logged in)');
            } catch (err) {
                console.warn('[StorageInit] ChatStorage cleanup failed:', err);
            }
        }
    } catch (error) {
        console.error('[StorageInit] Failed to initialize app storage:', error);
        // Important: Don't re-throw unless it's fatal, or RootLayout might block rendering forever
    }
};
