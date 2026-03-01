import { UnavailabilityError } from 'expo-modules-core';
import { FileExistsResult, FileInfo, SaveResult } from './SaveToDeviceModule';

// Web platform no-op implementation
// All functions throw UnavailabilityError since this module is Android-only
export default {
  async save(localUri: string, fileName: string, messageId: string): Promise<SaveResult> {
    throw new UnavailabilityError('SaveToDevice', 'save');
  },

  async checkFileExists(filePath: string): Promise<FileExistsResult> {
    throw new UnavailabilityError('SaveToDevice', 'checkFileExists');
  },

  async getFileInfo(contentUri: string): Promise<FileInfo> {
    throw new UnavailabilityError('SaveToDevice', 'getFileInfo');
  },

  async deleteFile(contentUri: string): Promise<boolean> {
    throw new UnavailabilityError('SaveToDevice', 'deleteFile');
  },

  addListener(_eventName: string, _listener: any) {
    // No-op on web
    return { remove: () => { } };
  },
};
