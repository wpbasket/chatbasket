import { PersonalUtilRefreshDeviceStatus } from '@/utils/personalUtils/personal.util.device';
import { commonAuthApi } from '@/lib/commonLib/authApi/common.api.auth';
import { PersonalStorageSetDeviceStatus } from '@/lib/storage/personalStorage/personal.storage.device';
import { setStoredKeysRevision } from '@/lib/storage/commonStorage/storage.auth';
import { getUserKeysRevision, setUserKeys, getUserKeys } from '@/lib/storage/personalStorage/chat/chat.storage';
import { PersonalProfileApi } from '@/lib/personalLib/profileApi/personal.api.profile';

jest.mock('@/lib/commonLib/authApi/common.api.auth', () => ({
    commonAuthApi: {
        getMe: jest.fn(),
    },
}));

jest.mock('@/lib/storage/personalStorage/personal.storage.device', () => ({
    PersonalStorageSetDeviceStatus: jest.fn(),
}));

jest.mock('@/lib/storage/commonStorage/storage.auth', () => ({
    setStoredKeysRevision: jest.fn(),
}));

const mockGetUserKeys = jest.fn();
jest.mock('@/lib/storage/personalStorage/chat/chat.storage', () => ({
    getUserKeysRevision: jest.fn(),
    setUserKeys: jest.fn(),
    getUserKeys: (...args: any[]) => mockGetUserKeys(...args),
}));

jest.mock('@/lib/personalLib/profileApi/personal.api.profile', () => ({
    PersonalProfileApi: {
        getE2EEKey: jest.fn(),
    },
}));

jest.mock('@/lib/personalLib/e2ee/e2ee.crypto', () => ({
    isValidPublicKeyB64: (key: any) => typeof key === 'string' && key.length > 0,
}));

describe('PersonalUtilRefreshDeviceStatus E2EE keys sync at startup', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetUserKeys.mockResolvedValue([]);
    });

    it('sets device status and keys_revision, and does not fetch keys if cached revision is up to date', async () => {
        (commonAuthApi.getMe as jest.Mock).mockResolvedValue({
            userId: 'user-1',
            isPrimary: true,
            primaryDeviceName: 'Primary Device',
            keys_revision: 5,
        });
        (getUserKeysRevision as jest.Mock).mockResolvedValue(5);
        mockGetUserKeys.mockResolvedValue([{ device_key: 'key-x', keys_revision: 5 }]);

        await PersonalUtilRefreshDeviceStatus();

        expect(PersonalStorageSetDeviceStatus).toHaveBeenCalledWith({
            isPrimary: true,
            deviceName: 'Primary Device',
        });
        expect(setStoredKeysRevision).toHaveBeenCalledWith(5);
        expect(getUserKeysRevision).toHaveBeenCalledWith('user-1');
        expect(PersonalProfileApi.getE2EEKey).not.toHaveBeenCalled();
        expect(setUserKeys).not.toHaveBeenCalled();
    });

    it('proactively syncs/fetches fresh sibling keys if local cached revision is stale', async () => {
        (commonAuthApi.getMe as jest.Mock).mockResolvedValue({
            userId: 'user-2',
            isPrimary: false,
            primaryDeviceName: 'Primary',
            keys_revision: 8,
        });
        (getUserKeysRevision as jest.Mock).mockResolvedValue(5); // stale cache (5 < 8)
        mockGetUserKeys.mockResolvedValue([{ device_key: 'key-x', keys_revision: 5 }]);
        (PersonalProfileApi.getE2EEKey as jest.Mock).mockResolvedValue({
            keys_revision: 8,
            e2ee_public_keys: ['key-a', 'key-b'],
        });

        await PersonalUtilRefreshDeviceStatus();

        expect(setStoredKeysRevision).toHaveBeenCalledWith(8);
        expect(PersonalProfileApi.getE2EEKey).toHaveBeenCalledWith('user-2');
        expect(setUserKeys).toHaveBeenCalledWith('user-2', [
            { device_key: 'key-a', keys_revision: 8 },
            { device_key: 'key-b', keys_revision: 8 },
        ]);
    });

    it('proactively fetches fresh sibling keys if local cache is empty', async () => {
        (commonAuthApi.getMe as jest.Mock).mockResolvedValue({
            userId: 'user-3',
            isPrimary: false,
            primaryDeviceName: 'Primary',
            keys_revision: 0,
        });
        (getUserKeysRevision as jest.Mock).mockResolvedValue(0);
        mockGetUserKeys.mockResolvedValue([]); // empty cache
        (PersonalProfileApi.getE2EEKey as jest.Mock).mockResolvedValue({
            keys_revision: 0,
            e2ee_public_keys: ['key-first'],
        });

        await PersonalUtilRefreshDeviceStatus();

        expect(PersonalProfileApi.getE2EEKey).toHaveBeenCalledWith('user-3');
        expect(setUserKeys).toHaveBeenCalledWith('user-3', [
            { device_key: 'key-first', keys_revision: 0 },
        ]);
    });
});
