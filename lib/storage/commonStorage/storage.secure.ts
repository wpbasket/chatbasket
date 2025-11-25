import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { MMKV } from "react-native-mmkv";

export type SecureStorageConfig = {
  id: string;
  encryptionKeyName: string;
};

const isWeb = Platform.OS === "web";
const instances: Record<string, MMKV> = {};

/**
 * Converts secure random bytes into a safe printable 16-char ASCII key.
 * MMKV encryption expects a 16-byte key.
 */
const bytesToPrintableAscii = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map(b => String.fromCharCode(33 + (b % 94))) // printable ASCII range (33–126)
    .join("");
};

/**
 * Fetch or create a secure 16-byte encryption key.
 * Stored inside SecureStore for hardware-backed security.
 */
const getOrCreateEncryptionKey = async (keyName: string): Promise<string> => {
  let existingKey = await SecureStore.getItemAsync(keyName);
  if (existingKey) return existingKey;

  const randomBytes = await Crypto.getRandomBytesAsync(16); // perfect AES128 length
  const printableKey = bytesToPrintableAscii(randomBytes);  // 16 ASCII chars (16 bytes)

  await SecureStore.setItemAsync(keyName, printableKey);
  return printableKey;
};

/**
 * Creates or returns a cached MMKV instance with AES128 encryption enabled.
 */
export const getSecureMMKV = async (
  config: SecureStorageConfig
): Promise<MMKV | null> => {
  if (isWeb) return null;

  // Return existing instance if already created
  if (instances[config.id]) {
    return instances[config.id];
  }

  try {
    const encryptionKey = await getOrCreateEncryptionKey(
      config.encryptionKeyName
    );

    const storage = new MMKV({
      id: config.id,
      encryptionKey,
    });

    instances[config.id] = storage;
    return storage;
  } catch (err) {
    console.log("Failed to initialize secure MMKV:", err);
    return null;
  }
};
