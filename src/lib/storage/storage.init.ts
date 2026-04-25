import { initializeSecureStorage, restoreAuthState } from './commonStorage/storage.auth';
import { initializeContactsStorage, PersonalStorageLoadContactRequests, PersonalStorageLoadContacts } from './personalStorage/personal.storage.contacts';
import { PersonalStorageGetDeviceStatus } from './personalStorage/personal.storage.device';
import { PersonalStorageGetUser } from './personalStorage/profile/personal.storage.user';
import { initChatStorage, clearAllChatStorage, purgeDeletedMessages, cleanupOrphanedMedia } from './personalStorage/chat/chat.storage';
import { connectionWatcher } from '@/lib/personalLib/chatApi/connection.watcher';
import { wsClient } from '@/lib/personalLib/chatApi/ws.client';
import { authState } from '@/state/auth/state.auth';

let hydrationPromise: Promise<void> | null = null;

/**
 * Resets the hydration gate so the next hydratePersonalModules() call
 * will run from scratch (re-open DB, reload contacts, restart watchers).
 * Called during logout — without this, re-login skips all initialization
 * because the resolved promise from the previous session is still cached.
 */
export const resetPersonalHydration = () => {
    hydrationPromise = null;
};

/**
 * Returns the in-flight hydration promise, or null if not started.
 * Callers can `await waitForHydration()` to ensure the DB is ready
 * before touching ChatStorage.
 */
export const waitForHydration = (): Promise<void> | null => hydrationPromise;

/**
 * Hydrates all personal sync modules and starts background services.
 * Safe to call multiple times — will only execute once per app lifecycle.
 */
export const hydratePersonalModules = async (): Promise<void> => {
    // Return existing promise if hydration is already in progress or completed
    if (hydrationPromise) return hydrationPromise;

    hydrationPromise = (async () => {
        try {
            console.log('[StorageInit] Starting personal module hydration...');

            await Promise.all([
                PersonalStorageGetUser(),
                PersonalStorageGetDeviceStatus(),
                initChatStorage(),
                initializeContactsStorage().then(() => Promise.all([
                    PersonalStorageLoadContacts(),
                    PersonalStorageLoadContactRequests()
                ]))
            ]);

            // Phase 4e: Start connection watcher + sync WebSocket state + drain outbox queue
            connectionWatcher.start();

            // Link WebSocket lifecycle to network connectivity
            connectionWatcher.subscribe((isOnline) => {
                wsClient.setNetworkOnline(isOnline);
            });
            // Handle initial state
            wsClient.setNetworkOnline(connectionWatcher.isOnline);


            // Phase D: Purge soft-deleted rows 30s after network is confirmed online.
            const schedulePurge = () => {
                setTimeout(() => {
                    purgeDeletedMessages().catch(err =>
                        console.warn('[StorageInit] purgeDeletedMessages failed:', err)
                    );
                    cleanupOrphanedMedia().catch(err =>
                        console.warn('[StorageInit] cleanupOrphanedMedia failed:', err)
                    );
                }, 30_000);
            };

            if (connectionWatcher.isOnline) {
                schedulePurge();
            } else {
                const unsub = connectionWatcher.subscribe((isOnline) => {
                    if (isOnline) {
                        unsub();
                        schedulePurge();
                    }
                });
            }
            console.log('[StorageInit] Personal module hydration complete.');
        } catch (error) {
            console.error('[StorageInit] Hydration failed:', error);
            hydrationPromise = null; // Allow retry on failure
            throw error;
        }
    })();

    return hydrationPromise;
};

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
            await hydratePersonalModules();
        } else {
            // Safety net: wipe any leftover ChatStorage from a failed/incomplete logout
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
