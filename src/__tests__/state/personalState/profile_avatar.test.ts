/**
 * Tests for profile avatar caching (util.profileAvatar.ts)
 *
 * Edge cases covered:
 * 1. restoreProfileAvatar — user has no avatar → avatarUri = null
 * 2. restoreProfileAvatar — user has avatar but local file missing → avatarUri = null
 * 3. restoreProfileAvatar — user has avatar and local file exists → avatarUri set
 * 4. syncProfileAvatar — server removed avatar → cleanup + null
 * 5. syncProfileAvatar — file ID unchanged, local exists → no download
 * 6. syncProfileAvatar — file ID unchanged, local missing → triggers download
 * 7. syncProfileAvatar — file ID changed → triggers download, sets new URI
 * 8. syncProfileAvatar — fresh install (no old ID) → downloads
 * 9. syncProfileAvatar — download fails → keeps old avatar (no cleanup)
 * 10. syncProfileAvatar — download HTTP error → keeps old avatar
 */

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('react-native', () => ({
    Platform: { OS: 'web' },
}));

jest.mock('@/state/personalState/user/personal.state.user', () => ({
    $personalStateUser: {
        user: { get: jest.fn(() => null) },
        avatarUri: { set: jest.fn(), get: jest.fn(() => null) },
    },
}));

jest.mock('@/lib/storage/personalStorage/profile/profile.storage', () => ({
    getProfileAvatarBlob: jest.fn(),
    storeProfileAvatarBlob: jest.fn(),
    deleteProfileAvatarBlob: jest.fn(),
}));

// Mock fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { restoreProfileAvatar, syncProfileAvatar } from '@/utils/personalUtils/util.profileAvatar';
import { $personalStateUser } from '@/state/personalState/user/personal.state.user';
import { getProfileAvatarBlob, storeProfileAvatarBlob, deleteProfileAvatarBlob } from '@/lib/storage/personalStorage/profile/profile.storage';

// Cast to jest.Mock for convenience
const mockGetProfileAvatarBlob = getProfileAvatarBlob as jest.Mock;
const mockStoreProfileAvatarBlob = storeProfileAvatarBlob as jest.Mock;
const mockDeleteProfileAvatarBlob = deleteProfileAvatarBlob as jest.Mock;
const mockUserGet = ($personalStateUser.user as any).get as jest.Mock;
const mockAvatarUriSet = ($personalStateUser.avatarUri as any).set as jest.Mock;

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeProfile(overrides: Record<string, any> = {}) {
    return {
        user_id: 'user-1',
        name: 'Test User',
        username: 'testuser',
        email: 'test@example.com',
        phone_number: '+1234567890',
        avatar_url: 'https://cdn.example.com/avatar.jpg',
        avatar_file_id: 'file-abc-123',
        is_profile_update_required: false,
        ...overrides,
    };
}

function makeFetchResponse(ok: boolean, status = 200) {
    const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
    return {
        ok,
        status,
        blob: jest.fn().mockResolvedValue(blob),
    };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('restoreProfileAvatar', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('sets avatarUri to null when user has no avatar_file_id', async () => {
        mockUserGet.mockReturnValue({ user_id: 'u1', name: 'Test' });

        await restoreProfileAvatar();

        expect(mockAvatarUriSet).toHaveBeenCalledWith(null);
        expect(mockGetProfileAvatarBlob).not.toHaveBeenCalled();
    });

    it('sets avatarUri to null when user is null', async () => {
        mockUserGet.mockReturnValue(null);

        await restoreProfileAvatar();

        expect(mockAvatarUriSet).toHaveBeenCalledWith(null);
    });

    it('sets avatarUri to null when local file is missing', async () => {
        mockUserGet.mockReturnValue({ user_id: 'u1', avatar_file_id: 'file-1' });
        mockGetProfileAvatarBlob.mockResolvedValue(null);

        await restoreProfileAvatar();

        expect(mockGetProfileAvatarBlob).toHaveBeenCalled();
        expect(mockAvatarUriSet).toHaveBeenCalledWith(null);
    });

    it('sets avatarUri to idb:// when local file exists', async () => {
        mockUserGet.mockReturnValue({ user_id: 'u1', avatar_file_id: 'file-1' });
        mockGetProfileAvatarBlob.mockResolvedValue({ blob: new Blob(), mime: 'image/jpeg' });

        await restoreProfileAvatar();

        expect(mockAvatarUriSet).toHaveBeenCalledWith('idb://ME_PROFILE_AVATAR');
    });
});

describe('syncProfileAvatar', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ── Server removed avatar ───────────────────────────────────────────

    it('cleans up local and sets null when server has no avatar_url', async () => {
        const profile = makeProfile({ avatar_url: null, avatar_file_id: null });

        await syncProfileAvatar(profile as any, 'old-file-id');

        expect(mockDeleteProfileAvatarBlob).toHaveBeenCalled();
        expect(mockAvatarUriSet).toHaveBeenCalledWith(null);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('cleans up local and sets null when server has no avatar_file_id', async () => {
        const profile = makeProfile({ avatar_url: 'https://cdn.example.com/avatar.jpg', avatar_file_id: null });

        await syncProfileAvatar(profile as any, 'old-file-id');

        expect(mockDeleteProfileAvatarBlob).toHaveBeenCalled();
        expect(mockAvatarUriSet).toHaveBeenCalledWith(null);
    });

    // ── File ID unchanged ───────────────────────────────────────────────

    it('skips download when file ID unchanged and local exists', async () => {
        const profile = makeProfile({ avatar_file_id: 'same-id' });
        mockGetProfileAvatarBlob.mockResolvedValue({ blob: new Blob(), mime: 'image/jpeg' });

        await syncProfileAvatar(profile as any, 'same-id');

        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockAvatarUriSet).toHaveBeenCalledWith('idb://ME_PROFILE_AVATAR');
    });

    it('downloads when file ID unchanged but local file is missing', async () => {
        const profile = makeProfile({ avatar_file_id: 'same-id' });
        mockGetProfileAvatarBlob.mockResolvedValue(null);
        mockFetch.mockResolvedValue(makeFetchResponse(true));
        mockStoreProfileAvatarBlob.mockResolvedValue(undefined);

        await syncProfileAvatar(profile as any, 'same-id');

        expect(mockFetch).toHaveBeenCalledWith(profile.avatar_url);
        expect(mockStoreProfileAvatarBlob).toHaveBeenCalled();
        expect(mockAvatarUriSet).toHaveBeenCalledWith(expect.stringMatching(/^idb:\/\/ME_PROFILE_AVATAR\?t=\d+$/));
    });

    // ── File ID changed ─────────────────────────────────────────────────

    it('downloads new avatar when file ID changed', async () => {
        const profile = makeProfile({ avatar_file_id: 'new-id' });
        mockFetch.mockResolvedValue(makeFetchResponse(true));
        mockStoreProfileAvatarBlob.mockResolvedValue(undefined);

        await syncProfileAvatar(profile as any, 'old-id');

        expect(mockFetch).toHaveBeenCalledWith(profile.avatar_url);
        expect(mockStoreProfileAvatarBlob).toHaveBeenCalled();
        expect(mockAvatarUriSet).toHaveBeenCalledWith(expect.stringMatching(/^idb:\/\/ME_PROFILE_AVATAR\?t=\d+$/));
    });

    it('overwrites old blob with same key when file ID changed (no orphan)', async () => {
        const profile = makeProfile({ avatar_file_id: 'new-id' });
        mockFetch.mockResolvedValue(makeFetchResponse(true));
        mockStoreProfileAvatarBlob.mockResolvedValue(undefined);

        await syncProfileAvatar(profile as any, 'old-id');

        // storeProfileAvatarBlob uses the same key regardless of file ID —
        // old blob is overwritten, not orphaned
        expect(mockStoreProfileAvatarBlob).toHaveBeenCalled();
        // No explicit delete needed — overwrite is atomic
        expect(mockDeleteProfileAvatarBlob).not.toHaveBeenCalled();
    });

    // ── Fresh install (no old file ID) ──────────────────────────────────

    it('downloads avatar when old file ID is null (fresh install)', async () => {
        const profile = makeProfile({ avatar_file_id: 'new-id' });
        mockFetch.mockResolvedValue(makeFetchResponse(true));
        mockStoreProfileAvatarBlob.mockResolvedValue(undefined);

        await syncProfileAvatar(profile as any, null);

        expect(mockFetch).toHaveBeenCalledWith(profile.avatar_url);
        expect(mockAvatarUriSet).toHaveBeenCalledWith(expect.stringMatching(/^idb:\/\/ME_PROFILE_AVATAR\?t=\d+$/));
    });

    it('downloads avatar when old file ID is undefined (fresh install)', async () => {
        const profile = makeProfile({ avatar_file_id: 'new-id' });
        mockFetch.mockResolvedValue(makeFetchResponse(true));
        mockStoreProfileAvatarBlob.mockResolvedValue(undefined);

        await syncProfileAvatar(profile as any, undefined);

        expect(mockFetch).toHaveBeenCalled();
        expect(mockAvatarUriSet).toHaveBeenCalledWith(expect.stringMatching(/^idb:\/\/ME_PROFILE_AVATAR\?t=\d+$/));
    });

    // ── Download failures ───────────────────────────────────────────────

    it('keeps existing avatar when download throws network error', async () => {
        const profile = makeProfile({ avatar_file_id: 'new-id' });
        mockFetch.mockRejectedValue(new Error('Network error'));

        await syncProfileAvatar(profile as any, 'old-id');

        expect(mockAvatarUriSet).not.toHaveBeenCalled();
        expect(mockDeleteProfileAvatarBlob).not.toHaveBeenCalled();
    });

    it('keeps existing avatar when server returns HTTP error', async () => {
        const profile = makeProfile({ avatar_file_id: 'new-id' });
        mockFetch.mockResolvedValue(makeFetchResponse(false, 500));

        await syncProfileAvatar(profile as any, 'old-id');

        expect(mockAvatarUriSet).not.toHaveBeenCalled();
        expect(mockDeleteProfileAvatarBlob).not.toHaveBeenCalled();
    });

    it('keeps existing avatar when storeProfileAvatarBlob fails', async () => {
        const profile = makeProfile({ avatar_file_id: 'new-id' });
        mockFetch.mockResolvedValue(makeFetchResponse(true));
        mockStoreProfileAvatarBlob.mockRejectedValue(new Error('IndexedDB full'));

        await syncProfileAvatar(profile as any, 'old-id');

        expect(mockAvatarUriSet).not.toHaveBeenCalled();
    });
});
