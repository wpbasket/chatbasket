import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

type WebBackend = 'async' | 'sync';

export class AppStorage<T extends Record<string, any>> {
    private mmkv: MMKV | null = null;
    private id: string;
    private disableWebPrefix: boolean;
    private webBackend: WebBackend;

    constructor(id: string, config?: any, options?: { disableWebPrefix?: boolean, webBackend?: WebBackend }) {
        this.id = id;
        this.disableWebPrefix = options?.disableWebPrefix ?? false;
        this.webBackend = options?.webBackend ?? 'async';

        if (Platform.OS !== 'web') {
            this.mmkv = new MMKV({ id, ...config });
        }
    }

    static async createSecure<T extends Record<string, any>>(id: string): Promise<AppStorage<T>> {
        let encryptionKey: string | undefined;

        if (Platform.OS !== 'web') {
            const keyName = `${id}-encryption-key`;
            try {
                const existingKey = await SecureStore.getItemAsync(keyName);
                if (existingKey) {
                    encryptionKey = existingKey;
                } else {
                    const randomBytes = await Crypto.getRandomBytesAsync(16);
                    encryptionKey = Array.from(randomBytes)
                        .map(b => String.fromCharCode(33 + (b % 94)))
                        .join("");

                    await SecureStore.setItemAsync(keyName, encryptionKey);
                }
            } catch (e) {
                console.error(`[AppStorage] Failed to initialize secure storage for ${id}:`, e);
                throw new Error(`Failed to initialize secure storage for ${id}`);
            }
        }

        return new AppStorage<T>(id, { encryptionKey });
    }

    private getWebKey(key: string): string {
        return this.disableWebPrefix ? key : `${this.id}-${key}`;
    }

    /**
     * Smart JSON Parser: Handles migration from raw strings (legacy) to JSON strings.
     */
    private _safeParse(val: string | null): any {
        if (val === null) return null;
        try {
            return JSON.parse(val);
        } catch {
            // Migration Fallback: If it's not valid JSON, it's likely a legacy raw string
            return val;
        }
    }

    async set<K extends keyof T>(key: K, value: T[K]): Promise<void> {
        const keyStr = String(key);
        const valStr = JSON.stringify(value);

        if (Platform.OS === 'web') {
            const webKey = this.getWebKey(keyStr);
            try {
                if (this.webBackend === 'sync') {
                    if (typeof window !== 'undefined') {
                        window.localStorage.setItem(webKey, valStr);
                    }
                } else {
                    await AsyncStorage.setItem(webKey, valStr);
                }
            } catch (e) {
                console.error(`[AppStorage] Failed to set ${keyStr}`, e);
            }
        } else {
            this.mmkv?.set(keyStr, valStr);
        }
    }

    /**
     * Set multiple keys at once.
     */
    async setMany(values: Partial<T>): Promise<void> {
        await Promise.all(
            Object.entries(values)
                .filter(([_, v]) => v !== undefined)
                .map(([k, v]) => this.set(k as keyof T, v as any))
        );
    }

    async get<K extends keyof T>(key: K): Promise<T[K] | null> {
        const keyStr = String(key);
        let valStr: string | null = null;

        if (Platform.OS === 'web') {
            const webKey = this.getWebKey(keyStr);
            try {
                if (this.webBackend === 'sync') {
                    if (typeof window !== 'undefined') {
                        valStr = window.localStorage.getItem(webKey);
                    }
                } else {
                    valStr = await AsyncStorage.getItem(webKey);
                }
            } catch (e) {
                console.error(`[AppStorage] Failed to get ${keyStr}`, e);
                return null;
            }
        } else {
            valStr = this.mmkv?.getString(keyStr) || null;
        }

        return this._safeParse(valStr);
    }

    getSync<K extends keyof T>(key: K): T[K] | null {
        const keyStr = String(key);
        let valStr: string | null = null;

        if (Platform.OS === 'web') {
            if (this.webBackend === 'async') return null;
            if (typeof window !== 'undefined') {
                valStr = window.localStorage.getItem(this.getWebKey(keyStr));
            }
        } else {
            valStr = this.mmkv?.getString(keyStr) || null;
        }

        return this._safeParse(valStr);
    }

    /**
     * Sync Get Multiple (Native & Web Sync).
     */
    getSyncMany<K extends keyof T>(keys: K[]): Partial<T> {
        const results: Partial<T> = {};
        for (const key of keys) {
            const val = this.getSync(key);
            if (val !== null) {
                results[key] = val;
            }
        }
        return results;
    }

    /**
     * Get multiple keys at once.
     */
    async getMany<K extends keyof T>(keys: K[]): Promise<Partial<T>> {
        const results: Partial<T> = {};
        await Promise.all(keys.map(async (key) => {
            const val = await this.get(key);
            if (val !== null) {
                results[key] = val;
            }
        }));
        return results;
    }

    async getWithDefault<K extends keyof T>(key: K, defaultValue: T[K]): Promise<T[K]> {
        const val = await this.get(key);
        return val ?? defaultValue;
    }

    getSyncWithDefault<K extends keyof T>(key: K, defaultValue: T[K]): T[K] {
        const val = this.getSync(key);
        return val ?? defaultValue;
    }

    async update<K extends keyof T>(key: K, updater: (current: T[K] | null) => T[K]): Promise<void> {
        const current = await this.get(key);
        const next = updater(current);
        await this.set(key, next);
    }

    async has<K extends keyof T>(key: K): Promise<boolean> {
        const keyStr = String(key);
        if (Platform.OS === 'web') {
            const webKey = this.getWebKey(keyStr);
            if (this.webBackend === 'sync') {
                return typeof window !== 'undefined' && !!window.localStorage.getItem(webKey);
            }
            const val = await AsyncStorage.getItem(webKey);
            return val !== null;
        } else {
            return this.mmkv?.contains(keyStr) ?? false;
        }
    }

    async remove<K extends keyof T>(key: K): Promise<void> {
        const keyStr = String(key);
        if (Platform.OS === 'web') {
            const webKey = this.getWebKey(keyStr);
            try {
                if (this.webBackend === 'sync') {
                    if (typeof window !== 'undefined') {
                        window.localStorage.removeItem(webKey);
                    }
                } else {
                    await AsyncStorage.removeItem(webKey);
                }
            } catch (e) {
                console.error(`[AppStorage] Failed to remove ${keyStr}`, e);
            }
        } else {
            this.mmkv?.delete(keyStr);
        }
    }

    async clearAll(): Promise<void> {
        if (Platform.OS === 'web') {
            const prefix = this.disableWebPrefix ? '' : `${this.id}-`;
            if (this.webBackend === 'sync') {
                if (typeof window !== 'undefined') {
                    Object.keys(window.localStorage).forEach(k => {
                        if (k.startsWith(prefix)) window.localStorage.removeItem(k);
                    });
                }
            } else {
                // Scoped clear for AsyncStorage on Web
                try {
                    const allKeys = await AsyncStorage.getAllKeys();
                    const targetKeys = allKeys.filter(k => k.startsWith(prefix));
                    if (targetKeys.length > 0) {
                        await AsyncStorage.multiRemove(targetKeys);
                    }
                } catch (e) {
                    console.error(`[AppStorage] Failed to clearAll for ${this.id}`, e);
                }
            }
        } else {
            this.mmkv?.clearAll();
        }
    }

    addOnValueChangedListener(listener: (key: string) => void): () => void {
        if (Platform.OS === 'web') return () => { };
        const sub = this.mmkv?.addOnValueChangedListener(listener);
        return () => sub?.remove();
    }
}
