// lib/personalLib/e2ee/e2ee.keys.ts
//
// E2EE identity keypair lifecycle (native + web parity).
//
// - Private key lives ONLY on this device:
//   - Native: Expo Secure Store (hardware-backed keychain/keystore).
//   - Web: `AppStorage.createSecure` — values AES-GCM-encrypted at rest with a
//     non-extractable WebCrypto master key held in IndexedDB (the same vault
//     the auth session uses).
//   Never uploaded, no recovery phrase, no backup (strict E2EE — accept data loss).
// - Key GENERATION is DEVICE-LEVEL (native and web alike): each device
//   generates its own identity keypair and uploads it to the server.
//   All devices (primary and secondary) participate in E2EE and can send
//   strict E2EE messages. A device promoted to primary
//   in-session (settings → setCentralDevice) generates its keypair on promotion.
// - Public key is uploaded to the backend (`POST /personal/profile/update-e2ee-key`);
//   an "uploaded" flag is persisted so failed uploads retry on later launches.
//   All devices (primary and secondary) upload their own public key to the
//   server, enabling multi-device E2EE support.

import { Platform } from 'react-native';
import type { AppStorage } from '@/lib/storage/storage.wrapper';
import { authState } from '@/state/auth/state.auth';
import { PersonalProfileApi } from '../profileApi/personal.api.profile';
import { generateIdentityKeypair, isValidPublicKeyB64, isValidX25519Keypair, sodiumReady } from './e2ee.crypto';
import { e2eeLog, keyFp } from './e2ee.log';

const TAG = '[E2EE Keys]';

const PRIVATE_KEY_STORE_KEY = 'e2ee_private_key';
const PUBLIC_KEY_STORE_KEY = 'e2ee_public_key';
const PUBLIC_KEY_UPLOADED_STORE_KEY = 'e2ee_public_key_uploaded';

// In-memory copies so hot paths (send/receive) never await the keystore.
let myPrivateKey: string | null = null;
let myPublicKey: string | null = null;
let myPublicKeyUploadConfirmed = false;
let selfKeyVerificationPromise: Promise<boolean> | null = null;
let selfKeyVerifiedForPublicKey: string | null = null;

// Defensive: Platform is undefined in the bare Jest environment — treat
// unknown platforms as unsupported so E2EE safely no-ops there.
const isKnownPlatform = Platform?.OS != null;
const isWeb = Platform?.OS === 'web';

/**
 * True only when the backend has marked this device as the primary device
 * (`null` = status not fetched yet — treated as NOT primary: never generate
 * the identity keypair on an unconfirmed device).
 */
function isPrimaryDevice(): boolean {
    return authState.isPrimary.peek() === true;
}

// In-session primary promotion watcher: handles key initialization/retry if
// E2EE keys were not successfully initialized previously and the device status
// changes to primary (settings → setCentralDevice, or the device-status
// refresh resolving after hydration). Started lazily, once per app lifecycle.
let primaryWatchStarted = false;

function watchForPrimaryPromotion(): void {
    if (primaryWatchStarted) return;
    primaryWatchStarted = true;
    e2eeLog(TAG, 'Promotion watcher armed (will generate keys if this device becomes primary)');
    authState.isPrimary.onChange(({ value }) => {
        if (value === true && !isE2EEReady()) {
            e2eeLog(TAG, 'Device promoted to PRIMARY — starting key initialization');
            void initializeE2EEKeys();
        }
    });
}

// ————————————————————————————————————————————————————————————————————————————
// Keystore — Secure Store on native, encrypted AppStorage vault on web.
// Both backends are lazy-loaded: expo-secure-store touches native modules at
// import time and the web vault needs window/indexedDB, neither of which may
// exist during bundling or in the bare Jest environment.
// ————————————————————————————————————————————————————————————————————————————

type E2EEKeystoreSchema = {
    e2ee_private_key: string;
    e2ee_public_key: string;
    e2ee_public_key_uploaded: string;
};

type E2EEKeystoreKey = keyof E2EEKeystoreSchema;

let webKeystorePromise: Promise<AppStorage<E2EEKeystoreSchema>> | null = null;

function getWebKeystore(): Promise<AppStorage<E2EEKeystoreSchema>> {
    if (!webKeystorePromise) {
        webKeystorePromise = import('@/lib/storage/storage.wrapper').then((m) =>
            m.AppStorage.createSecure<E2EEKeystoreSchema>('secure-e2ee-storage', { webBackend: 'indexeddb' }),
        );
    }
    return webKeystorePromise;
}

async function keystoreGet(key: E2EEKeystoreKey): Promise<string | null> {
    if (isWeb) {
        const store = await getWebKeystore();
        return (await store.get(key)) ?? null;
    }
    const SecureStore = await import('expo-secure-store');
    return SecureStore.getItemAsync(key);
}

async function keystoreSet(key: E2EEKeystoreKey, value: string): Promise<void> {
    if (isWeb) {
        const store = await getWebKeystore();
        await store.set(key, value);
        return;
    }
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(key, value);
}

async function keystoreDelete(key: E2EEKeystoreKey): Promise<void> {
    if (isWeb) {
        const store = await getWebKeystore();
        await store.remove(key);
        return;
    }
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
}

// ————————————————————————————————————————————————————————————————————————————
// Public API
// ————————————————————————————————————————————————————————————————————————————

/** True when this device (native or web) has a usable identity keypair. */
export function isE2EEReady(): boolean {
    return isKnownPlatform && !!myPrivateKey && !!myPublicKey;
}

/** My private key (standard Base64) or null when E2EE is not set up on this device. */
export function getMyPrivateKey(): string | null {
    return myPrivateKey;
}

/** My public key (standard Base64) or null when E2EE is not set up on this device. */
export function getMyPublicKey(): string | null {
    return myPublicKey;
}

export function isMyPublicKeyUploadConfirmed(): boolean {
    return isKnownPlatform && !!myPublicKey && myPublicKeyUploadConfirmed;
}

function setUploadConfirmed(value: boolean): void {
    myPublicKeyUploadConfirmed = value;
    if (!value) selfKeyVerifiedForPublicKey = null;
}

async function persistUploadConfirmed(value: boolean): Promise<void> {
    setUploadConfirmed(value);
    await keystoreSet(PUBLIC_KEY_UPLOADED_STORE_KEY, value ? 'true' : 'false');
}

function clearSelfKeyVerification(): void {
    selfKeyVerificationPromise = null;
    selfKeyVerifiedForPublicKey = null;
}

export async function verifyMyPublicKeyRegistered(): Promise<boolean> {
    if (!isKnownPlatform || !myPublicKey) return false;
    if (selfKeyVerifiedForPublicKey === myPublicKey) return true;
    if (myPublicKeyUploadConfirmed) {
        selfKeyVerifiedForPublicKey = myPublicKey;
        return true;
    }
    if (selfKeyVerificationPromise) return selfKeyVerificationPromise;

    selfKeyVerificationPromise = (async () => {
        await uploadPublicKeyIfNeeded();
        if (myPublicKeyUploadConfirmed) {
            selfKeyVerifiedForPublicKey = myPublicKey;
            return true;
        }
        return false;
    })().finally(() => {
        selfKeyVerificationPromise = null;
    });

    return selfKeyVerificationPromise;
}

export async function requireStrictE2EEReadyForSend(): Promise<
    | { ok: true; publicKey: string; privateKey: string }
    | { ok: false; reason: 'local_key_unavailable' | 'public_key_upload_unconfirmed' }
> {
    await whenKeyInitSettled();
    if (!isE2EEReady() || !myPrivateKey || !myPublicKey) {
        return { ok: false, reason: 'local_key_unavailable' };
    }
    const registered = await verifyMyPublicKeyRegistered();
    if (!registered) {
        return { ok: false, reason: 'public_key_upload_unconfirmed' };
    }
    return { ok: true, publicKey: myPublicKey, privateKey: myPrivateKey };
}

let keyLoadInFlight: Promise<void> | null = null;

/**
 * Initializes the device identity keypair (native and web alike).
 *
 * Loads the keypair from the platform keystore. When none exists, a new keypair
 * is generated and persisted (for both primary and secondary devices).
 * Then schedules public-key upload in the background (retried until confirmed).
 *
 * Never throws — hydration must not be blocked by E2EE setup failures.
 * Concurrent calls coalesce into one run (the hydration fire-and-forget and
 * the promotion watcher may overlap) so a keypair is never generated twice.
 */
export function initializeE2EEKeys(): Promise<void> {
    if (!isKnownPlatform) return Promise.resolve();
    if (keyLoadInFlight) return keyLoadInFlight;

    keyLoadInFlight = doInitializeE2EEKeys().finally(() => {
        keyLoadInFlight = null;
    });
    keyLoadInFlight.then(() => uploadPublicKeyIfNeeded()).catch(() => { });
    return keyLoadInFlight;
}

/**
 * Resolves when any in-flight key initialization settles (instantly when none
 * is running). Ingress processors await this so a cold start / page refresh
 * cannot race key loading and blank content (messages, chat-list previews)
 * that would decrypt fine a moment later. Bounded: key load = sodium ready +
 * keystore reads/generation only; upload runs separately in the background.
 */
export function whenKeyInitSettled(): Promise<void> {
    return keyLoadInFlight ?? Promise.resolve();
}

async function doInitializeE2EEKeys(): Promise<void> {
    try {
        e2eeLog(TAG, 'Init: start', {
            platform: Platform?.OS,
            isPrimary: authState.isPrimary.peek(),
        });
        await sodiumReady();

        let privateKey = await keystoreGet(PRIVATE_KEY_STORE_KEY);
        let publicKey = await keystoreGet(PUBLIC_KEY_STORE_KEY);
        setUploadConfirmed((await keystoreGet(PUBLIC_KEY_UPLOADED_STORE_KEY)) === 'true');

        if (!isValidX25519Keypair(privateKey, publicKey)) {
            await persistUploadConfirmed(false);
            // All devices (primary and secondary) generate their own keypair
            e2eeLog(TAG, 'Init: generating keypair for device', {
                isPrimary: authState.isPrimary.peek(),
            });
            e2eeLog(TAG, 'Init: no keypair on device — generating');
            const keypair = generateIdentityKeypair();
            await keystoreSet(PRIVATE_KEY_STORE_KEY, keypair.privateKey);
            await keystoreSet(PUBLIC_KEY_STORE_KEY, keypair.publicKey);
            await keystoreSet(PUBLIC_KEY_UPLOADED_STORE_KEY, 'false');
            privateKey = keypair.privateKey;
            publicKey = keypair.publicKey;
            e2eeLog(TAG, 'Init: generated new identity keypair', { publicKey: keyFp(publicKey) });
        } else {
            e2eeLog(TAG, 'Init: loaded persisted keypair from keystore', { publicKey: keyFp(publicKey) });
        }

        myPrivateKey = privateKey;
        myPublicKey = publicKey;
        e2eeLog(TAG, 'Init: E2EE READY', { publicKey: keyFp(publicKey) });

    } catch (err) {
        console.warn(`${TAG} initializeE2EEKeys failed (will retry next launch)`, err);
    }
}

/**
 * Persists an identity keypair delivered by the Phase 2 WebRTC key sync
 * (replaces this device's own generated keypair with the account's shared
 * identity key). The keypair is recorded as already uploaded: the originating
 * native device registered this public key with the server.
 */
export async function importIdentityKeypair(privateKey: string, publicKey: string): Promise<boolean> {
    if (!isKnownPlatform || !isValidX25519Keypair(privateKey, publicKey)) return false;

    try {
        await keystoreSet(PRIVATE_KEY_STORE_KEY, privateKey);
        await keystoreSet(PUBLIC_KEY_STORE_KEY, publicKey);
        await keystoreSet(PUBLIC_KEY_UPLOADED_STORE_KEY, 'true');
        myPrivateKey = privateKey;
        myPublicKey = publicKey;
        setUploadConfirmed(true);
        clearSelfKeyVerification();
        e2eeLog(TAG, 'Imported identity keypair (key sync)', { publicKey: keyFp(publicKey) });
        return true;
    } catch (err) {
        console.warn(`${TAG} Failed to import identity keypair`, err);
        return false;
    }
}

/**
 * Uploads the public key to the backend unless already confirmed uploaded.
 * Safe to call repeatedly; failures are retried on the next launch.
 * Device-specific: each device uploads its public key for its specific session,
 * enabling multi-device E2EE support.
 */
export async function uploadPublicKeyIfNeeded(): Promise<void> {
    if (!isKnownPlatform || !myPublicKey) return;

    try {
        const uploaded = await keystoreGet(PUBLIC_KEY_UPLOADED_STORE_KEY);
        if (uploaded === 'true' && myPublicKeyUploadConfirmed) {
            e2eeLog(TAG, 'Upload: public key already confirmed locally — skipping');
            return;
        }
        // All devices (primary and secondary) upload their own public key
        e2eeLog(TAG, 'Upload: sending public key to server', { publicKey: keyFp(myPublicKey) });
        const res = await PersonalProfileApi.updateE2EEKey({ e2ee_public_key: myPublicKey });
        if (res?.status) {
            await persistUploadConfirmed(true);
            if (typeof res.keys_revision === 'number') {
                const { setStoredKeysRevision } = await import('@/lib/storage/commonStorage/storage.auth');
                await setStoredKeysRevision(res.keys_revision);
            }
            selfKeyVerifiedForPublicKey = myPublicKey;
            e2eeLog(TAG, 'Upload: public key CONFIRMED on server', { publicKey: keyFp(myPublicKey), keys_revision: res.keys_revision ?? null });
            uploadRetryAttempt = 0;
            if (uploadRetryTimer) { clearTimeout(uploadRetryTimer); uploadRetryTimer = null; }
        } else {
            e2eeLog(TAG, 'Upload: server did not confirm — will retry', { status: res?.status ?? null });
        }
    } catch (err) {
        // Includes the "profile does not exist yet" case — retried after profile creation
        console.warn(`${TAG} Public key upload failed (scheduling retry)`, err);
        // Schedule background retry with exponential backoff (capped at 60s)
        scheduleUploadRetry();
    }
}

let uploadRetryTimer: ReturnType<typeof setTimeout> | null = null;
let uploadRetryAttempt = 0;

function scheduleUploadRetry(): void {
    if (uploadRetryTimer) return; // already scheduled
    const delays = [5000, 10000, 20000, 40000, 60000]; // exponential backoff
    const delay = delays[Math.min(uploadRetryAttempt, delays.length - 1)];
    uploadRetryAttempt++;
    e2eeLog(TAG, `Upload: retrying in ${delay / 1000}s (attempt ${uploadRetryAttempt})`);
    uploadRetryTimer = setTimeout(async () => {
        uploadRetryTimer = null;
        if (myPublicKeyUploadConfirmed) return; // already confirmed by another path
        await uploadPublicKeyIfNeeded();
    }, delay);
}

/**
 * Deletes the device identity keypair (manual logout / account removal).
 * Callers MUST fetch + decrypt all pending messages BEFORE invoking this —
 * once the private key is gone, undelivered ciphertext is unrecoverable.
 */
export async function deleteLocalE2EEKeys(): Promise<void> {
    myPrivateKey = null;
    myPublicKey = null;
    setUploadConfirmed(false);
    clearSelfKeyVerification();
    if (!isKnownPlatform) return;

    try {
        await keystoreDelete(PRIVATE_KEY_STORE_KEY);
        await keystoreDelete(PUBLIC_KEY_STORE_KEY);
        await keystoreDelete(PUBLIC_KEY_UPLOADED_STORE_KEY);
        e2eeLog(TAG, 'Local identity keypair deleted (logout/cleanup)');
    } catch (err) {
        console.warn(`${TAG} Failed to delete local keys`, err);
    }
}
