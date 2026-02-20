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
        }
    } catch (error) {
        // Non-critical background task
        console.log('[PersonalUtilDevice] Failed to refresh device status:', error);
    }
}
