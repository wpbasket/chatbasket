import { requireNativeModule } from 'expo-modules-core';

/**
 * Save result with full metadata for storage
 */
export interface SaveResult {
  success: boolean;
  messageId: string;
  fileName: string;
  folderName: string;      // e.g., "DCIM/Chatbasket/images"
  mimeType: string;
  directory: string;        // e.g., "DCIM" or "Download"
  localUri: string;         // content:// URI (Android) or file:// URI (iOS)
  fileSize: number;
  savedPath: string;        // e.g., "DCIM/Chatbasket/images/photo.jpg"
}

/**
 * File existence check result
 */
export interface FileExistsResult {
  exists: boolean;
  size: number;
  path: string;
  error?: string;
}

/**
 * File info from MediaStore
 */
export interface FileInfo {
  exists: boolean;
  fileName?: string;
  size?: number;
  mimeType?: string;
  dateAdded?: number;
  error?: string;
}

/**
 * Event emitted when a save completes (success or failure)
 */
export interface SaveCompleteEvent {
  messageId: string;
  fileName: string;
  status: 'completed' | 'failed';
  localUri?: string;
  error?: string;
}

interface ChatbasketDownloadsModule {
  /**
   * Save a file from local cache to device public storage
   * Automatically routes to DCIM (images/videos) or Downloads (other files)
   * @param localUri Local file URI (with file:// prefix)
   * @param fileName File name with extension
   * @param messageId Message ID to link save operation to chat message
   * @returns Save metadata with content URI and folder info
   */
  save(
    localUri: string,
    fileName: string,
    messageId: string
  ): Promise<SaveResult>;

  /**
   * Check if file exists at given path
   * @param filePath File path (can include file:// prefix)
   * @returns File existence and size information
   */
  checkFileExists(filePath: string): Promise<FileExistsResult>;

  /**
   * Get file info from MediaStore (Android only)
   * @param contentUri Content URI (content://)
   * @returns File metadata from MediaStore
   */
  getFileInfo(contentUri: string): Promise<FileInfo>;

  /**
   * Delete saved file from MediaStore (Android only)
   * @param contentUri Content URI to delete
   * @returns true if successfully deleted
   */
  deleteFile(contentUri: string): Promise<boolean>;

  /**
   * Listen for save completion events
   * @param eventName 'onSaveComplete'
   * @param listener Callback function
   * @returns Subscription object with remove() method
   */
  addListener(
    eventName: 'onSaveComplete',
    listener: (event: SaveCompleteEvent) => void
  ): { remove: () => void };
}

export default requireNativeModule('ChatbasketDownloads') as ChatbasketDownloadsModule;
