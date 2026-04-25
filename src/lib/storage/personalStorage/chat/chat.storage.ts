// lib/storage/personalStorage/chat/chat.storage.ts

import { Platform } from 'react-native';

/**
 * Unified ChatStorage interface — same async API on all platforms.
 *
 * Native (Android/iOS): expo-sqlite with SQLCipher
 * Web: Encrypted IndexedDB (AES-GCM via non-extractable CryptoKey)
 *
 * All callers import from this file only.
 * The platform-specific import is resolved at build time by Metro/Webpack
 * using the `.native.ts` / `.web.ts` file extension convention.
 *
 * If Metro platform extensions are NOT configured for this path,
 * use the runtime fallback below.
 */

// Runtime platform split (works even without Metro platform extensions):
export async function initChatStorage(): Promise<void> {
    if (Platform.OS === 'web') {
        const mod = await import('./chat.storage.web');
        Object.assign(ChatStorageImpl, mod);
    } else {
        const mod = await import('./chat.storage.native');
        Object.assign(ChatStorageImpl, mod);
    }
    return ChatStorageImpl.initChatStorage!();
}

// Lazy proxy — populated on first initChatStorage() call
const ChatStorageImpl: Record<string, Function> = {};

// Re-export every function as an async relay to the platform impl
export const insertMessage: typeof import('./chat.storage.native').insertMessage =
    (...args: any[]) => (ChatStorageImpl.insertMessage as any)(...args);
export const insertMessages: typeof import('./chat.storage.native').insertMessages =
    (...args: any[]) => (ChatStorageImpl.insertMessages as any)(...args);
export const insertChats: typeof import('./chat.storage.native').insertChats =
    (...args: any[]) => (ChatStorageImpl.insertChats as any)(...args);
export const replaceChats: typeof import('./chat.storage.native').replaceChats =
    (...args: any[]) => (ChatStorageImpl.replaceChats as any)(...args);
export const getChats: typeof import('./chat.storage.native').getChats =
    (...args: any[]) => (ChatStorageImpl.getChats as any)(...args);
export const getMessagesByChat: typeof import('./chat.storage.native').getMessagesByChat =
    (...args: any[]) => (ChatStorageImpl.getMessagesByChat as any)(...args);
export const updateMessageStatus: typeof import('./chat.storage.native').updateMessageStatus =
    (...args: any[]) => (ChatStorageImpl.updateMessageStatus as any)(...args);
export const swapTempIdToRealId: typeof import('./chat.storage.native').swapTempIdToRealId =
    (...args: any[]) => (ChatStorageImpl.swapTempIdToRealId as any)(...args);
export const deleteMessage: typeof import('./chat.storage.native').deleteMessage =
    (...args: any[]) => (ChatStorageImpl.deleteMessage as any)(...args);
export const clearChatMessages: typeof import('./chat.storage.native').clearChatMessages =
    (...args: any[]) => (ChatStorageImpl.clearChatMessages as any)(...args);
export const getDeletedMessageIds: typeof import('./chat.storage.native').getDeletedMessageIds =
    (...args: any[]) => (ChatStorageImpl.getDeletedMessageIds as any)(...args);
export const getLastMessageTimestamp: typeof import('./chat.storage.native').getLastMessageTimestamp =
    (...args: any[]) => (ChatStorageImpl.getLastMessageTimestamp as any)(...args);
export const getPendingOutboxMessages: typeof import('./chat.storage.native').getPendingOutboxMessages =
    (...args: any[]) => (ChatStorageImpl.getPendingOutboxMessages as any)(...args);
export const getMessageByTempId: typeof import('./chat.storage.native').getMessageByTempId =
    (...args: any[]) => (ChatStorageImpl.getMessageByTempId as any)(...args);
export const messageExists: typeof import('./chat.storage.native').messageExists =
    (...args: any[]) => (ChatStorageImpl.messageExists as any)(...args);
export const getMessageCountsByChatId: typeof import('./chat.storage.native').getMessageCountsByChatId =
    (...args: any[]) => (ChatStorageImpl.getMessageCountsByChatId as any)(...args);
export const updateChatCachedAvatarFileId: typeof import('./chat.storage.native').updateChatCachedAvatarFileId =
    (...args: any[]) => (ChatStorageImpl.updateChatCachedAvatarFileId as any)(...args);
export const updateChatCachedAvatarFileIdByUserId: typeof import('./chat.storage.native').updateChatCachedAvatarFileIdByUserId =
    (...args: any[]) => (ChatStorageImpl.updateChatCachedAvatarFileIdByUserId as any)(...args);
export const clearAllChatStorage = async (): Promise<void> => {
    // Must work even when initChatStorage was never called (e.g. fresh boot while logged out)
    if (ChatStorageImpl.clearAllChatStorage) {
        return (ChatStorageImpl.clearAllChatStorage as any)();
    }
    // Load platform impl on-demand for cleanup
    if (Platform.OS === 'web') {
        const mod = await import('./chat.storage.web');
        return mod.clearAllChatStorage();
    } else {
        const mod = await import('./chat.storage.native');
        return mod.clearAllChatStorage();
    }
};
export const recordFailedInsert: typeof import('./chat.storage.native').recordFailedInsert =
    (...args: any[]) => (ChatStorageImpl.recordFailedInsert as any)(...args);
export const getStorageStats: typeof import('./chat.storage.native').getStorageStats =
    (...args: any[]) => (ChatStorageImpl.getStorageStats as any)(...args);

// Media blob functions (web-only — native uses filesystem directly)
// These are no-ops on native (native stores files in Paths.document/chatFiles/)
export const purgeDeletedMessages: typeof import('./chat.storage.native').purgeDeletedMessages =
    (...args: any[]) => (ChatStorageImpl.purgeDeletedMessages as any)(...args);
export const storeMediaBlob = (...args: any[]) =>
    (ChatStorageImpl.storeMediaBlob as any)?.(...args) ?? Promise.resolve();
export const getMediaBlob = (...args: any[]) =>
    (ChatStorageImpl.getMediaBlob as any)?.(...args) ?? Promise.resolve(null);
export const deleteMediaBlob = (...args: any[]) =>
    (ChatStorageImpl.deleteMediaBlob as any)?.(...args) ?? Promise.resolve();
export const cleanupMessageMedia: typeof import('./chat.storage.native').cleanupMessageMedia =
    (...args: any[]) => (ChatStorageImpl.cleanupMessageMedia as any)(...args);
export const cleanupOrphanedMedia: typeof import('./chat.storage.native').cleanupOrphanedMedia =
    (...args: any[]) => (ChatStorageImpl.cleanupOrphanedMedia as any)(...args);
