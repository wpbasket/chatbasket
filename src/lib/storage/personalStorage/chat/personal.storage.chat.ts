import { clearAllChatStorage } from "./chat.storage";

/**
 * Removes all chat-related data from personal storage.
 * Follows the PersonalStorage naming convention for consistency with contacts/user.
 */
export const PersonalStorageRemoveChat = async (): Promise<void> => {
  await clearAllChatStorage();
};
