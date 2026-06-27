import { observable } from '@legendapp/state';
import { initializeSecureStorage, restoreAuthState, isOwnKeysInitialized, setOwnKeysInitialized } from './commonStorage/storage.auth';
import { initializeContactsStorage, PersonalStorageLoadContactRequests, PersonalStorageLoadContacts, PersonalStorageRemoveContacts, PersonalStorageRemoveContactRequests } from './personalStorage/personal.storage.contacts';
import { PersonalStorageGetDeviceStatus, PersonalStorageRemoveDeviceStatus } from './personalStorage/personal.storage.device';
import { PersonalStorageGetUser, PersonalStorageRemoveUser, clearProfileStorage } from './personalStorage/profile/personal.storage.user';
import { initChatStorage, clearAllChatStorage, purgeDeletedMessages, cleanupOrphanedMedia, setUserKeys } from './personalStorage/chat/chat.storage';
import { connectionWatcher } from '@/lib/personalLib/chatApi/connection.watcher';
import { wsClient } from '@/lib/personalLib/chatApi/ws.client';
import { authState } from '@/state/auth/state.auth';
import { deleteLocalE2EEKeys, initializeE2EEKeys, uploadPublicKeyIfNeeded } from '@/lib/personalLib/e2ee/e2ee.keys';
import { PersonalProfileApi } from '@/lib/personalLib/profileApi/personal.api.profile';
import { isValidPublicKeyB64 } from '@/lib/personalLib/e2ee/e2ee.crypto';

let hydrationPromise: Promise<void> | null = null;


async function seedOwnSiblingKeysOnce(): Promise<void> {
    const userId = authState.userId.peek();
    if (!userId || await isOwnKeysInitialized()) return;
    try {
        const res = await PersonalProfileApi.getE2EEKey(userId);
        const revision = Number.isFinite(res.keys_revision) ? Math.max(0, Math.trunc(res.keys_revision)) : 0;
        const keys = (res.e2ee_public_keys || [])
            .filter(isValidPublicKeyB64)
            .map(device_key => ({ device_key, keys_revision: revision }));
        await setUserKeys(userId, keys, revision);
        await setOwnKeysInitialized(true);
        console.log('[StorageInit] Own sibling E2EE keys seeded', { count: keys.length, keys_revision: revision });
    } catch (err) {
        console.warn('[StorageInit] Own sibling E2EE key seed failed', err);
    }
}


export const personalStorageHydration$ = observable({
    ready: false,
    loading: false,
});

/**
 * Resets the hydration gate so the next hydratePersonalModules() call
 * will run from scratch (re-open DB, reload contacts, restart watchers).
 * Called during logout — without this, re-login skips all initialization
 * because the resolved promise from the previous session is still cached.
 */
export const resetPersonalHydration = () => {
    hydrationPromise = null;
    personalStorageHydration$.ready.set(false);
    personalStorageHydration$.loading.set(false);
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

    personalStorageHydration$.loading.set(true);

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

            // E2EE: load the device identity keypair (generated here only on the
            // PRIMARY device — isPrimary was loaded by PersonalStorageGetDeviceStatus
            // above) and upload the public key.
            // Never throws; fire-and-forget so hydration is not blocked by network.
            void initializeE2EEKeys();
            void seedOwnSiblingKeysOnce();

            // Phase 4e: Start connection watcher + sync WebSocket state + drain outbox queue
            connectionWatcher.start();

            // Link WebSocket lifecycle to network connectivity
            connectionWatcher.subscribe((isOnline) => {
                wsClient.setNetworkOnline(isOnline);
                // E2EE: retry the public key upload whenever connectivity returns
                if (isOnline) {
                    void uploadPublicKeyIfNeeded();
                }
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
            personalStorageHydration$.ready.set(true);
            console.log('[StorageInit] Personal module hydration complete.');
        } catch (error) {
            console.error('[StorageInit] Hydration failed:', error);
            hydrationPromise = null; // Allow retry on failure
            personalStorageHydration$.ready.set(false);
            throw error;
        } finally {
            personalStorageHydration$.loading.set(false);
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
                await Promise.all([
                    clearAllChatStorage(),
                    clearProfileStorage(),
                    deleteLocalE2EEKeys(),
                    // Wipe the migrated personal scopes in AppStorageIDB (matches
                    // auth.clearSession() so fresh boot == logout cleanup).
                    PersonalStorageRemoveUser(),
                    PersonalStorageRemoveContacts(),
                    PersonalStorageRemoveContactRequests(),
                    PersonalStorageRemoveDeviceStatus(),
                ]);
                console.log('[StorageInit] Cleaned up leftover personal storage (not logged in)');
            } catch (err) {
                console.warn('[StorageInit] Personal storage cleanup failed:', err);
            }
        }
    } catch (error) {
        console.error('[StorageInit] Failed to initialize app storage:', error);
        // Important: Don't re-throw unless it's fatal, or RootLayout might block rendering forever
    }
};
