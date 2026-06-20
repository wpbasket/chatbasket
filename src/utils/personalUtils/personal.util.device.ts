import { commonAuthApi } from "@/lib/commonLib/authApi/common.api.auth";
import { PersonalStorageSetDeviceStatus } from "@/lib/storage/personalStorage/personal.storage.device";

/**
 * Refreshes the device status (isPrimary) from the backend.
 * This is called during app boot in Personal mode.
 */
export async function PersonalUtilRefreshDeviceStatus() {
    try {
        const me = await commonAuthApi.getMe();
        if (me) {
            await PersonalStorageSetDeviceStatus({
                isPrimary: me.isPrimary,
                deviceName: me.primaryDeviceName || null
            });
            if (typeof me.keys_revision === 'number') {
                const { setStoredKeysRevision } = await import('@/lib/storage/commonStorage/storage.auth');
                await setStoredKeysRevision(me.keys_revision);

                // Proactively fetch own fresh sibling keys if local cached revision is stale or empty compared to me.keys_revision
                try {
                    const { getUserKeysRevision, setUserKeys, getUserKeys } = await import('@/lib/storage/personalStorage/chat/chat.storage');
                    const cachedRevision = await getUserKeysRevision(me.userId);
                    const cachedKeys = await getUserKeys(me.userId);
                    if (cachedKeys.length === 0 || cachedRevision < me.keys_revision) {
                        console.log('[PersonalUtilDevice] Sibling keys revision mismatch or empty (local keys count:', cachedKeys.length, 'local revision:', cachedRevision, 'remote:', me.keys_revision, '). Fetching fresh keys...');
                        const { PersonalProfileApi } = await import('@/lib/personalLib/profileApi/personal.api.profile');
                        const { isValidPublicKeyB64 } = await import('@/lib/personalLib/e2ee/e2ee.crypto');
                        
                        const res = await PersonalProfileApi.getE2EEKey(me.userId);
                        const freshRevision = Number.isFinite(res?.keys_revision) ? Math.max(0, Math.trunc(res.keys_revision)) : 0;
                        const keys = (res?.e2ee_public_keys || [])
                            .filter(isValidPublicKeyB64)
                            .map(device_key => ({ device_key, keys_revision: freshRevision }));
                        await setUserKeys(me.userId, keys);
                        console.log('[PersonalUtilDevice] Proactive sibling keys sync completed.');
                    }
                } catch (keysErr) {
                    console.warn('[PersonalUtilDevice] Failed to proactively sync sibling keys:', keysErr);
                }
            }
        }
    } catch (error) {
        // Non-critical background task
        console.log('[PersonalUtilDevice] Failed to refresh device status:', error);
    }
}
