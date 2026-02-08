import { initializeSecureStorage, restoreAuthState } from './commonStorage/storage.auth';
import { initializeContactsStorage, PersonalStorageLoadContactRequests, PersonalStorageLoadContacts } from './personalStorage/personal.storage.contacts';
import { PersonalStorageGetDeviceStatus } from './personalStorage/personal.storage.device';
import { PersonalStorageGetUser } from './personalStorage/personal.storage.user';
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
                initializeContactsStorage().then(() => Promise.all([
                    PersonalStorageLoadContacts(),
                    PersonalStorageLoadContactRequests()
                ]))
            ]);
        }
    } catch (error) {
        console.error('[StorageInit] Failed to initialize app storage:', error);
        // Important: Don't re-throw unless it's fatal, or RootLayout might block rendering forever
    }
};
