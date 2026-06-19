const VALID_KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq=';
const mockGetE2EEKey = jest.fn();
const mockSetUserKeys = jest.fn();
const mockSetOwnKeysInitialized = jest.fn();
const mockIsOwnKeysInitialized = jest.fn();
const mockInitializeE2EEKeys = jest.fn();
const mockUploadPublicKeyIfNeeded = jest.fn();
const mockSubscribe = jest.fn((_cb?: any) => jest.fn());
const mockSetNetworkOnline = jest.fn((_online?: boolean) => undefined);

jest.mock('@legendapp/state', () => ({
  observable: (value: any) => ({
    ready: { set: jest.fn(), get: jest.fn(() => value.ready) },
    loading: { set: jest.fn(), get: jest.fn(() => value.loading) },
  }),
}));
jest.mock('@/lib/storage/commonStorage/storage.auth', () => ({
  initializeSecureStorage: jest.fn(async () => undefined),
  restoreAuthState: jest.fn(async () => undefined),
  isOwnKeysInitialized: (...args: any[]) => mockIsOwnKeysInitialized(...args),
  setOwnKeysInitialized: (...args: any[]) => mockSetOwnKeysInitialized(...args),
}));
jest.mock('@/lib/storage/personalStorage/personal.storage.contacts', () => ({
  initializeContactsStorage: jest.fn(async () => undefined),
  PersonalStorageLoadContacts: jest.fn(async () => undefined),
  PersonalStorageLoadContactRequests: jest.fn(async () => undefined),
}));
jest.mock('@/lib/storage/personalStorage/personal.storage.device', () => ({
  PersonalStorageGetDeviceStatus: jest.fn(async () => undefined),
}));
jest.mock('@/lib/storage/personalStorage/profile/personal.storage.user', () => ({
  PersonalStorageGetUser: jest.fn(async () => undefined),
  clearProfileStorage: jest.fn(async () => undefined),
}));
jest.mock('@/lib/storage/personalStorage/chat/chat.storage', () => ({
  initChatStorage: jest.fn(async () => undefined),
  clearAllChatStorage: jest.fn(async () => undefined),
  purgeDeletedMessages: jest.fn(async () => undefined),
  cleanupOrphanedMedia: jest.fn(async () => undefined),
  setUserKeys: (...args: any[]) => mockSetUserKeys(...args),
}));
jest.mock('@/lib/personalLib/chatApi/connection.watcher', () => ({
  connectionWatcher: { start: jest.fn(), subscribe: (cb: any) => mockSubscribe(cb), isOnline: false },
}));
jest.mock('@/lib/personalLib/chatApi/ws.client', () => ({
  wsClient: { setNetworkOnline: (online: boolean) => mockSetNetworkOnline(online) },
}));
jest.mock('@/state/auth/state.auth', () => ({
  authState: { userId: { peek: () => 'owner-1' } },
}));
jest.mock('@/lib/personalLib/e2ee/e2ee.keys', () => ({
  deleteLocalE2EEKeys: jest.fn(async () => undefined),
  initializeE2EEKeys: (...args: any[]) => mockInitializeE2EEKeys(...args),
  uploadPublicKeyIfNeeded: (...args: any[]) => mockUploadPublicKeyIfNeeded(...args),
}));
jest.mock('@/lib/personalLib/profileApi/personal.api.profile', () => ({
  PersonalProfileApi: { getE2EEKey: (...args: any[]) => mockGetE2EEKey(...args) },
}));
jest.mock('@/lib/personalLib/e2ee/e2ee.crypto', () => ({
  isValidPublicKeyB64: (key: unknown) => key === VALID_KEY,
}));

describe('hydratePersonalModules E2EE self-key seed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockIsOwnKeysInitialized.mockResolvedValue(false);
    mockGetE2EEKey.mockResolvedValue({ e2ee_public_keys: [VALID_KEY, 'bad'], keys_revision: 5 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function flush() {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('fetches self sibling keys once and stores only valid keys with backend revision', async () => {
    let hydratePersonalModules: any;
    jest.isolateModules(() => {
      hydratePersonalModules = require('@/lib/storage/storage.init').hydratePersonalModules;
    });
    await hydratePersonalModules();
    await flush();

    expect(mockInitializeE2EEKeys).toHaveBeenCalled();
    expect(mockGetE2EEKey).toHaveBeenCalledWith('owner-1');
    expect(mockSetUserKeys).toHaveBeenCalledWith('owner-1', [{ device_key: VALID_KEY, keys_revision: 5 }]);
    expect(mockSetOwnKeysInitialized).toHaveBeenCalledWith(true);
  });

  it('does not fetch self keys when own_keys_initialized is already true', async () => {
    mockIsOwnKeysInitialized.mockResolvedValue(true);

    let hydratePersonalModules: any;
    jest.isolateModules(() => {
      hydratePersonalModules = require('@/lib/storage/storage.init').hydratePersonalModules;
    });
    await hydratePersonalModules();
    await flush();

    expect(mockGetE2EEKey).not.toHaveBeenCalled();
    expect(mockSetUserKeys).not.toHaveBeenCalled();
  });
});
