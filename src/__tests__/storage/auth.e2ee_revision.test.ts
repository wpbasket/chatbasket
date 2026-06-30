const store = new Map<string, any>();

const mockStorage = {
  set: jest.fn(async (key: string, value: any) => { store.set(key, value); }),
  get: jest.fn(async (key: string) => store.get(key)),
  remove: jest.fn(async (key: string) => { store.delete(key); }),
  setMany: jest.fn(async (values: Record<string, any>) => {
    for (const [key, value] of Object.entries(values)) store.set(key, value);
  }),
  getMany: jest.fn(async (keys: string[]) => {
    const out: Record<string, any> = {};
    for (const key of keys) out[key] = store.get(key);
    return out;
  }),
  clearAll: jest.fn(async () => { store.clear(); }),
};

const mockAuthValues: Record<string, any> = {};
function mockCell(key: string) {
  return {
    set: jest.fn((value: any) => { mockAuthValues[key] = value; }),
    get: jest.fn(() => mockAuthValues[key]),
    peek: jest.fn(() => mockAuthValues[key]),
  };
}

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@/lib/storage/storage.wrapper', () => ({
  AppStorage: { createSecure: jest.fn(async () => mockStorage) },
}));
jest.mock('@/state/auth/state.auth', () => ({
  authState: {
    sessionId: mockCell('sessionId'),
    userId: mockCell('userId'),
    sessionExpiry: mockCell('sessionExpiry'),
    user: mockCell('user'),
    isLoggedIn: mockCell('isLoggedIn'),
    isSentOtp: mockCell('isSentOtp'),
    keys_revision: mockCell('keys_revision'),
    primaryKey: mockCell('primaryKey'),
    set: jest.fn((value: Record<string, any>) => Object.assign(mockAuthValues, value)),
  },
}));
jest.mock('@/state/appMode/state.appMode', () => ({ appMode$: { mode: { set: jest.fn() } } }));
jest.mock('@/lib/storage/personalStorage/personal.storage.device', () => ({
  PersonalStorageGetDeviceStatus: jest.fn(async () => undefined),
  PersonalStorageRemoveDeviceStatus: jest.fn(async () => undefined),
}));
jest.mock('@/lib/storage/storage.init', () => ({ hydratePersonalModules: jest.fn(), resetPersonalHydration: jest.fn() }));

describe('secure auth E2EE revision metadata', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    store.clear();
    for (const key of Object.keys(mockAuthValues)) delete mockAuthValues[key];
    jest.resetModules();
  });

  async function load() {
    const mod = require('@/lib/storage/commonStorage/storage.auth');
    await mod.initializeSecureStorage();
    return mod;
  }

  it('setSession persists keys_revision and resets own_keys_initialized', async () => {
    const auth = await load();

    await auth.setSession({ sessionId: 's1', userId: 'u1', sessionExpiry: '2999-01-01T00:00:00Z', keys_revision: 12 });

    expect(store.get('keys_revision')).toBe(12);
    expect(store.get('own_keys_initialized')).toBe(false);
    expect(mockAuthValues.keys_revision).toBe(12);
  });

  it('own_keys_initialized is local-only and can be toggled', async () => {
    const auth = await load();

    await auth.setOwnKeysInitialized(true);
    expect(await auth.isOwnKeysInitialized()).toBe(true);

    await auth.setOwnKeysInitialized(false);
    expect(await auth.isOwnKeysInitialized()).toBe(false);
  });

  it('setStoredKeysRevision normalizes and persists auth revision', async () => {
    const auth = await load();

    await auth.setStoredKeysRevision(7.9);

    expect(store.get('keys_revision')).toBe(7);
    expect(mockAuthValues.keys_revision).toBe(7);
  });

  it('restoreAuthState restores keys_revision from secure storage', async () => {
    const auth = await load();
    await mockStorage.setMany({ sessionId: 's2', userId: 'u2', sessionExpiry: '2999-01-01T00:00:00Z', keys_revision: 21 });

    await auth.restoreAuthState();

    expect(mockAuthValues.sessionId).toBe('s2');
    expect(mockAuthValues.userId).toBe('u2');
    expect(mockAuthValues.keys_revision).toBe(21);
    expect(mockAuthValues.isLoggedIn).toBe(true);
  });
});
