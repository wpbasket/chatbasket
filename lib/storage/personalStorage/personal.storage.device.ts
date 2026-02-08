import { authState } from "@/state/auth/state.auth";
import { AppStorage } from "../storage.wrapper";

const DevicePrimaryKey = 'device-is-primary';
const DeviceNameKey = 'device-primary-name';

// Define the schema for this storage scope
type PersonalDeviceSchema = {
    [DevicePrimaryKey]: boolean;
    [DeviceNameKey]: string;
}

// Instantiate with schema
const deviceStorage = new AppStorage<PersonalDeviceSchema>('personal-device');

export const PersonalStorageSetDeviceStatus = async (status: { isPrimary: boolean | null, deviceName: string | null }): Promise<void> => {
    const { isPrimary, deviceName } = status;

    if (isPrimary !== null) {
        await deviceStorage.set(DevicePrimaryKey, isPrimary);
    } else {
        await deviceStorage.remove(DevicePrimaryKey);
    }

    if (deviceName) {
        await deviceStorage.set(DeviceNameKey, deviceName);
    } else {
        await deviceStorage.remove(DeviceNameKey);
    }

    // Update State
    authState.isPrimary.set(isPrimary as any);
    authState.primaryDeviceName.set(deviceName || null);
}

export const PersonalStorageGetDeviceStatus = async (): Promise<void> => {
    const data = await deviceStorage.getMany([DevicePrimaryKey, DeviceNameKey]);

    authState.isPrimary.set(data[DevicePrimaryKey] ?? null as any);
    authState.primaryDeviceName.set(data[DeviceNameKey] || null);
}

export const PersonalStorageRemoveDeviceStatus = async (): Promise<void> => {
    await deviceStorage.remove(DevicePrimaryKey);
    await deviceStorage.remove(DeviceNameKey);

    authState.isPrimary.set(null as any);
    authState.primaryDeviceName.set(null);
}
