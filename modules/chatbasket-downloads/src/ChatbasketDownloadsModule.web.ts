import { UnavailabilityError } from 'expo-modules-core';

// Web platform no-op implementation
// All functions throw UnavailabilityError since this module is Android-only
export default {
  async save(localUri: string, fileName: string, messageId: string): Promise<any> {
    throw new UnavailabilityError('ChatbasketDownloads', 'save');
  },

  async checkFileExists(filePath: string): Promise<any> {
    throw new UnavailabilityError('ChatbasketDownloads', 'checkFileExists');
  },

  async getFileInfo(contentUri: string): Promise<any> {
    throw new UnavailabilityError('ChatbasketDownloads', 'getFileInfo');
  },

  async deleteFile(contentUri: string): Promise<boolean> {
    throw new UnavailabilityError('ChatbasketDownloads', 'deleteFile');
  },

  addListener(_eventName: string, _listener: any) {
    // No-op on web
    return { remove: () => { } };
  },
};
