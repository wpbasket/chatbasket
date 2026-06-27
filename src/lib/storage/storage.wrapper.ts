// CANDIDATE replacement for storage.wrapper.ts — UNDER TEST.
// Differences vs original:
//   - WebBackend = 'sync' | 'indexeddb'  (AsyncStorage / 'async' removed)
//   - New 'indexeddb' web backend: per-scope object store in a shared
//     AppStorageIDB database. Encrypt-before-transaction pattern (mirrors
//     chat.storage.web.ts) to avoid IDB TransactionInactiveError.
//   - createSecure forwards webBackend (defaults to 'indexeddb').
// Native (MMKV) path is byte-for-byte identical to the original.
// WebVault (non-extractable AES-GCM master key in IndexedDB) unchanged.

import { Platform } from 'react-native';
import { createMMKV, type MMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

/**
 * WebVault: Handles non-extractable cryptographic keys for the web.
 * Uses IndexedDB to store CryptoKey objects directly (so they can't be read as strings).
 */
class WebVault {
    private static DB_NAME = 'AppStorageVault';
    private static STORE_NAME = 'Keys';
    private static KEY_NAME = 'MasterKey';
    private static cryptoKey: CryptoKey | null = null;

    static async getOrCreateKey(): Promise<CryptoKey> {
        if (this.cryptoKey) return this.cryptoKey;

        if (typeof indexedDB === 'undefined') {
            throw new Error('IndexedDB not supported');
        }

        // Step 1: Read-only check for existing key
        const existingKey = await new Promise<CryptoKey | undefined>((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore(this.STORE_NAME);
            };
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction(this.STORE_NAME, 'readonly');
                const getReq = tx.objectStore(this.STORE_NAME).get(this.KEY_NAME);
                getReq.onsuccess = () => resolve(getReq.result as CryptoKey | undefined);
                getReq.onerror = () => reject(getReq.error);
            };
            request.onerror = () => reject(request.error);
        });

        if (existingKey) {
            this.cryptoKey = existingKey;
            return existingKey;
        }

        // Step 2: Generate key OUTSIDE any transaction (async crypto work)
        const key = await window.crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false, // extractable: false (CANNOT BE STOLEN BY SCRIPTS)
            ['encrypt', 'decrypt']
        );

        // Step 3: Store key in a fresh read-write transaction
        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const putReq = tx.objectStore(this.STORE_NAME).put(key, this.KEY_NAME);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            };
            request.onerror = () => reject(request.error);
        });

        this.cryptoKey = key;
        return key;
    }

    static async encrypt(data: string): Promise<string> {
        const key = await this.getOrCreateKey();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedData = new TextEncoder().encode(data);

        const ciphertextBuffer = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encodedData
        );

        // Package as a JSON string with a special flag
        const payload = {
            __cb_enc: true,
            ct: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer))),
            iv: btoa(String.fromCharCode(...iv))
        };

        return JSON.stringify(payload);
    }

    static async decrypt(encryptedPayload: string): Promise<string> {
        try {
            const payload = JSON.parse(encryptedPayload);
            if (!payload.__cb_enc || !payload.ct || !payload.iv) return encryptedPayload;

            const key = await this.getOrCreateKey();
            const ivArray = new Uint8Array(atob(payload.iv).split('').map(c => c.charCodeAt(0)));
            const cipherArray = new Uint8Array(atob(payload.ct).split('').map(c => c.charCodeAt(0)));

            const decryptedBuffer = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: ivArray },
                key,
                cipherArray
            );

            return new TextDecoder().decode(decryptedBuffer);
        } catch (e) {
            // If decryption fails or it's not JSON, return as-is (fallback)
            return encryptedPayload;
        }
    }
}

type WebBackend = 'sync' | 'indexeddb';

// ─── IndexedDB engine (web only) ───────────────────────────────────────────
// Single shared DB (v1) with ONE object store 'kv'. Each record is keyed by
// `${scope}\u0000${key}` (null separator never appears in scope/key names).
// This avoids per-scope version bumps entirely — version bumps are blocked by
// any other open connection (DevTools, another tab, a leaked connection), so a
// fixed v1 schema with composite keys is the robust pattern. clearAll(scope)
// deletes a key range covering exactly that scope's prefix.

const IDB_DB_NAME = 'AppStorageIDB';
const IDB_STORE = 'kv';
const SEP = '\u0000';
let _idbDb: IDBDatabase | null = null;
let _idbReady: Promise<IDBDatabase> | null = null;

function openIdb(): Promise<IDBDatabase> {
    if (_idbDb) return Promise.resolve(_idbDb);
    if (_idbReady) return _idbReady;
    _idbReady = new Promise<IDBDatabase>((resolve, reject) => {
        // Fixed v1 schema: AppStorageIDB + single 'kv' store.
        const req = indexedDB.open(IDB_DB_NAME, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(IDB_STORE)) {
                req.result.createObjectStore(IDB_STORE);
            }
        };
        req.onsuccess = () => { _idbDb = req.result; resolve(_idbDb); };
        req.onerror = () => { _idbReady = null; reject(req.error); };
    });
    return _idbReady;
}

function ckey(scope: string, key: string): string {
    return scope + SEP + key;
}

function scopeRange(scope: string): IDBKeyRange {
    // lower inclusive = scope + SEP, upper exclusive = scope + next char after SEP
    // → covers every key `scope\u0000*` without touching other scopes.
    return IDBKeyRange.bound(scope + SEP, scope + '\u0001', false, true);
}

function idbPut(scope: string, key: string, value: string): Promise<void> {
    return openIdb().then(db => new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).put(value, ckey(scope, key));
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    }));
}

function idbGet(scope: string, key: string): Promise<string | null> {
    return openIdb().then(db => new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(ckey(scope, key));
        req.onsuccess = () => resolve(req.result === undefined ? null : (req.result as string));
        req.onerror = () => reject(req.error);
    }));
}

function idbDelete(scope: string, key: string): Promise<void> {
    return openIdb().then(db => new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).delete(ckey(scope, key));
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    }));
}

function idbClear(scope: string): Promise<void> {
    return openIdb().then(db => new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const req = tx.objectStore(IDB_STORE).delete(scopeRange(scope));
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    }));
}

export class AppStorage<T extends Record<string, any>> {
    private mmkv: MMKV | null = null;
    private id: string;
    private disableWebPrefix: boolean;
    private webBackend: WebBackend;
    private isSecure: boolean = false;

    constructor(id: string, config?: any, options?: { disableWebPrefix?: boolean, webBackend?: WebBackend, isSecure?: boolean }) {
        this.id = id;
        this.disableWebPrefix = options?.disableWebPrefix ?? false;
        this.webBackend = options?.webBackend ?? 'indexeddb';
        this.isSecure = options?.isSecure ?? false;

        if (Platform.OS !== 'web') {
            this.mmkv = createMMKV({ id, ...config });
        }
    }

    static async createSecure<T extends Record<string, any>>(id: string, options?: { webBackend?: WebBackend }): Promise<AppStorage<T>> {
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

        return new AppStorage<T>(id, { encryptionKey }, {
            isSecure: true,
            webBackend: options?.webBackend ?? 'indexeddb',
        });
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
            try {
                // ENCRYPT BEFORE OPENING THE IDB TRANSACTION.
                // Awaiting crypto.subtle inside an open IDB tx causes auto-commit
                // (TransactionInactiveError) — mirrors chat.storage.web.ts pattern.
                let finalVal = valStr;
                if (this.isSecure) {
                    finalVal = await WebVault.encrypt(valStr);
                }

                if (this.webBackend === 'sync') {
                    const webKey = this.getWebKey(keyStr);
                    if (typeof window !== 'undefined') {
                        window.localStorage.setItem(webKey, finalVal);
                    }
                } else {
                    await idbPut(this.id, keyStr, finalVal);
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
            // IndexedDB reads fail LOUD: a missing/broken read is a real bug the
            // caller must see. localStorage reads are sync and infallible, so
            // they keep the silent-null contract.
            if (this.webBackend === 'sync') {
                const webKey = this.getWebKey(keyStr);
                if (typeof window !== 'undefined') {
                    valStr = window.localStorage.getItem(webKey);
                }
            } else {
                valStr = await idbGet(this.id, keyStr);
                if (this.isSecure && valStr) {
                    valStr = await WebVault.decrypt(valStr);
                }
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
            // IndexedDB is async-only — getSync returns null on the indexeddb backend
            // (same behavior as the old 'async' backend). Only 'sync' (localStorage)
            // can serve a synchronous read.
            if (this.webBackend !== 'sync') return null;
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
            if (this.webBackend === 'sync') {
                const webKey = this.getWebKey(keyStr);
                return typeof window !== 'undefined' && !!window.localStorage.getItem(webKey);
            }
            const val = await idbGet(this.id, keyStr);
            return val !== null;
        } else {
            return this.mmkv?.contains(keyStr) ?? false;
        }
    }

    async remove<K extends keyof T>(key: K): Promise<void> {
        const keyStr = String(key);
        if (Platform.OS === 'web') {
            try {
                if (this.webBackend === 'sync') {
                    const webKey = this.getWebKey(keyStr);
                    if (typeof window !== 'undefined') {
                        window.localStorage.removeItem(webKey);
                    }
                } else {
                    await idbDelete(this.id, keyStr);
                }
            } catch (e) {
                console.error(`[AppStorage] Failed to remove ${keyStr}`, e);
            }
        } else {
            this.mmkv?.remove(keyStr);
        }
    }

    async clearAll(): Promise<void> {
        if (Platform.OS === 'web') {
            if (this.webBackend === 'sync') {
                const prefix = this.disableWebPrefix ? '' : `${this.id}-`;
                if (typeof window !== 'undefined') {
                    Object.keys(window.localStorage).forEach(k => {
                        if (k.startsWith(prefix)) window.localStorage.removeItem(k);
                    });
                }
            } else {
                // Per-scope object store → clear() removes exactly this scope's keys.
                try {
                    await idbClear(this.id);
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
