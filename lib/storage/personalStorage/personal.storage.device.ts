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
let deviceStorage: AppStorage<PersonalDeviceSchema> | null = null;

const getStorage = async (): Promise<AppStorage<PersonalDeviceSchema>> => {
    if (!deviceStorage) {
        deviceStorage = await AppStorage.createSecure<PersonalDeviceSchema>('personal-device');
    }
    return deviceStorage;
}

export const PersonalStorageSetDeviceStatus = async (status: { isPrimary: boolean | null, deviceName: string | null }): Promise<void> => {
    const { isPrimary, deviceName } = status;
    const storage = await getStorage();

    if (isPrimary !== null) {
        await storage.set(DevicePrimaryKey, isPrimary);
    } else {
        await storage.remove(DevicePrimaryKey);
    }

    if (deviceName) {
        await storage.set(DeviceNameKey, deviceName);
    } else {
        await storage.remove(DeviceNameKey);
    }

    // Update State
    authState.isPrimary.set(isPrimary as any);
    authState.primaryDeviceName.set(deviceName || null);
}

export const PersonalStorageGetDeviceStatus = async (): Promise<void> => {
    const storage = await getStorage();
    const data = await storage.getMany([DevicePrimaryKey, DeviceNameKey]);

    authState.isPrimary.set(data[DevicePrimaryKey] ?? null as any);
    authState.primaryDeviceName.set(data[DeviceNameKey] || null);
}

export const PersonalStorageRemoveDeviceStatus = async (): Promise<void> => {
    const storage = await getStorage();
    await storage.remove(DevicePrimaryKey);
    await storage.remove(DeviceNameKey);

    authState.isPrimary.set(null as any);
    authState.primaryDeviceName.set(null);
}
