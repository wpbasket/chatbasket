// lib/personalLib/e2ee/e2ee.service.ts
//
// High-level E2EE orchestration for personal chat.
//
// Rules (see docs: personal.e2ee-upgrade.md / personal.e2ee-tasks.md §4):
// - Outgoing: local queue keeps plaintext; encrypt ONLY at send time using the
//   recipient's backend-refreshed public key. Missing local/recipient/self-key
//   confirmation blocks send — no plaintext fallback.
// - Incoming: decrypt V3 by matching this device public key in `key_envelopes`
//   payload BEFORE persistence. Decryption failure → generic failed placeholder;
//   ciphertext must never be shown or persisted as readable content.
// - Own messages echoed back by the server (`is_from_me`) are ciphertext this
//   device cannot decrypt (crypto_box is recipient-keyed); the locally
//   persisted plaintext copy (written by the outbox promotion path) is
//   restored when it exists — e.g. on history reloads after a page refresh —
//   otherwise generic failed placeholder is shown (other devices, Phase 1 limitation).
// - Web parity: web runs the SAME pipeline as native — registry sync, text/media
//   encrypt + decrypt, fail-closed placeholders. All devices (both primary and
//   secondary) generate their own keypair, and messages are encrypted for all
//   registered device keys. Only the media byte source differs (IndexedDB blobs
//   instead of file:// URIs).

import { Platform } from 'react-native';
import mime from 'react-native-mime-types';
import * as ChatStorage from '@/lib/storage/personalStorage/chat/chat.storage';
import type { ChatEntry, MessageEntry } from '../models/personal.model.chat';
import { authState } from '@/state/auth/state.auth';
import { PersonalProfileApi } from '../profileApi/personal.api.profile';
import {
    E2EE_FAILED_TO_LOAD_TEXT,
    decryptMediaBytes,
    decode32ByteKeyB64,
    decryptPayloadEnvelope,
    encode32ByteKeyB64,
    encryptMediaBytes,
    encryptPayloadEnvelope,
    generateMediaKey,
    isV3Envelope,
    isValidPublicKeyB64,
    type E2EEMediaMetadata,
} from './e2ee.crypto';
import { getMyPrivateKey, getMyPublicKey, requireStrictE2EEReadyForSend, whenKeyInitSettled } from './e2ee.keys';
import { e2eeLog, keyFp } from './e2ee.log';
import { getPreviewText } from '@/utils/personalUtils/util.chatPreview';

const TAG = '[E2EE]';
// Defensive: Platform is undefined in the bare Jest environment — treat
// unknown platforms as unsupported so E2EE safely no-ops (pass-through).
const isKnownPlatform = Platform?.OS != null;
const isWeb = Platform?.OS === 'web';

/** Suffix appended to encrypted upload file names. */
export const ENCRYPTED_FILE_SUFFIX = '.enc';

export type E2EEInboundFailureReason =
    | 'local_key_unavailable'
    | 'sender_key_unavailable'
    | 'media_download_transient'
    | 'media_gone'
    | 'auth_failed';

export interface E2EEInboundFailure {
    message_id?: string;
    chat_id?: string;
    reason: E2EEInboundFailureReason;
    recoverable: boolean;
    ack: boolean;
}

export interface ProcessIncomingMessagesResult {
    entries: MessageEntry[];
    failures: E2EEInboundFailure[];
}

export type E2EEStrictSendFailureReason =
    | 'unsupported_platform'
    | 'invalid_recipient'
    | 'invalid_payload'
    | 'local_key_unavailable'
    | 'public_key_upload_unconfirmed'
    | 'recipient_key_unavailable'
    | 'recipient_key_fetch_failed'
    | 'encryption_failed';

export type E2EERecipientKeyRefreshPass = Map<string, Promise<string | null>>;

export interface E2EEStrictOptions {
    recipientKeyRefreshPass?: E2EERecipientKeyRefreshPass;
    recipientKeysRevision?: number;
}

export type ResolveRecipientPublicKeyStrictResult =
    | { ok: true; publicKey: string }
    | { ok: false; reason: E2EEStrictSendFailureReason };

export type ResolveAuthorizedPublicKeysForSendResult =
    | { ok: true; publicKeys: string[]; recipientKey: string }
    | { ok: false; reason: E2EEStrictSendFailureReason };

export type EncryptOutgoingTextStrictResult =
    | { ok: true; wire: string }
    | { ok: false; reason: E2EEStrictSendFailureReason };

export type PrepareOutgoingMediaStrictInput =
    | { kind: 'file'; recipientId: string; localUri: string; originalFileName: string; originalMimeType?: string | null; originalSize?: number | null; messageType?: string | null }
    | { kind: 'blob'; recipientId: string; blob: Blob; originalFileName: string; originalMimeType?: string | null; originalSize?: number | null; messageType?: string | null };

export type PrepareOutgoingMediaStrictResult =
    | { ok: true; media: EncryptedMediaUpload | EncryptedMediaBlobUpload }
    | { ok: false; reason: E2EEStrictSendFailureReason };

export function createE2EERecipientKeyRefreshPass(): E2EERecipientKeyRefreshPass {
    return new Map<string, Promise<string | null>>();
}

export function isRecoverableE2EEInboundFailure(reason: E2EEInboundFailureReason): boolean {
    return reason === 'local_key_unavailable' ||
        reason === 'sender_key_unavailable' ||
        reason === 'media_download_transient';
}

export function shouldAckE2EEInboundFailure(reason: E2EEInboundFailureReason): boolean {
    return !isRecoverableE2EEInboundFailure(reason);
}

function buildInboundFailure(msg: MessageEntry, reason: E2EEInboundFailureReason): E2EEInboundFailure {
    return {
        message_id: msg.message_id,
        chat_id: msg.chat_id,
        reason,
        recoverable: isRecoverableE2EEInboundFailure(reason),
        ack: shouldAckE2EEInboundFailure(reason),
    };
}

function markMessageAsFailed(msg: MessageEntry, reason: E2EEInboundFailureReason, options?: ProcessIncomingOptions): void {
    msg.content = E2EE_FAILED_TO_LOAD_TEXT;
    const failure = buildInboundFailure(msg, reason);
    (msg as any).e2ee_failure_reason = failure.reason;
    (msg as any).e2ee_failure_recoverable = failure.recoverable;
    (msg as any).e2ee_should_ack = failure.ack;
    options?.onFailure?.(failure);
}

function markChatPreviewAsFailed(chat: ChatEntry): void {
    chat.last_message_content = E2EE_FAILED_TO_LOAD_TEXT;
}

// Local copy of the per-type MIME defaults — deliberately NOT imported from
// file.download.ts (which imports this module) to avoid a require cycle.
const MEDIA_DEFAULT_MIME: Record<string, string> = {
    image: 'image/jpeg',
    video: 'video/mp4',
    audio: 'audio/mpeg',
    file: 'application/octet-stream',
};

function normalizeMediaSize(size: number | null | undefined, fallback: number): number | null {
    const raw = size ?? fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

function normalizeMediaMimeType(
    mimeType: string | null | undefined,
    fileName: string,
    messageType?: string | null,
): string {
    if (mimeType?.trim()) return mimeType.trim();
    return mime.lookup(fileName) || MEDIA_DEFAULT_MIME[messageType || 'file'] || 'application/octet-stream';
}

function normalizeMediaFileName(fileName: string | null | undefined): string {
    const name = fileName?.trim();
    return name || 'file';
}

function buildMediaMetadata(input: PrepareOutgoingMediaStrictInput, plainBytes: number): E2EEMediaMetadata {
    const fileName = normalizeMediaFileName(input.originalFileName);
    return {
        fileName,
        mimeType: normalizeMediaMimeType(input.originalMimeType, fileName, input.messageType),
        size: normalizeMediaSize(input.originalSize, plainBytes),
    };
}

function makeEncryptedUploadFileName(): string {
    return `cb-media-${Date.now()}-${Math.random().toString(36).slice(2)}${ENCRYPTED_FILE_SUFFIX}`;
}

function applyMediaMetadata(msg: MessageEntry, meta: E2EEMediaMetadata): void {
    msg.file_name = normalizeMediaFileName(meta.fileName);
    msg.file_mime_type = normalizeMediaMimeType(meta.mimeType, msg.file_name, msg.message_type);
    msg.file_size = meta.size ?? msg.file_size ?? null;
}

export function hydrateEncryptedMediaMetadata(
    msg: MessageEntry,
): E2EEMediaMetadata {
    if (!msg.content || !isV3Envelope(msg.content)) {
        throw new Error(`${TAG} cannot decrypt media metadata — missing v3 envelope`);
    }
    const payload = decryptV3PayloadForThisDevice(msg.content);
    if (payload.type !== 'file') {
        throw new Error(`${TAG} cannot decrypt media metadata — invalid v3 file payload`);
    }
    const meta = filePayloadToMediaMetadata(payload);
    applyMediaMetadata(msg, meta);
    return meta;
}

// ————————————————————————————————————————————————————————————————————————————
// Persistent key registry (never "cache") — user_keys
// ————————————————————————————————————————————————————————————————————————————

function uniqueValidKeys(keys: Array<string | null | undefined>): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const key of keys) {
        if (!isValidPublicKeyB64(key) || seen.has(key)) continue;
        seen.add(key);
        out.push(key);
    }
    return out;
}

function normalizeRevision(revision: number | null | undefined): number {
    return Number.isFinite(revision) ? Math.max(0, Math.trunc(revision as number)) : 0;
}

export async function saveUserKeys(userId: string, publicKeys: Array<string | null | undefined>, keysRevision: number): Promise<void> {
    if (!isKnownPlatform || !userId) return;
    const revision = normalizeRevision(keysRevision);
    const keys = uniqueValidKeys(publicKeys).map(device_key => ({ device_key, keys_revision: revision }));
    try {
        await ChatStorage.setUserKeys(userId, keys, revision);
        e2eeLog(TAG, 'Registry: keys replaced', { userId, count: keys.length, keys_revision: revision });
    } catch (err) {
        console.warn(`${TAG} Failed to save keys for ${userId}`, err);
    }
}

/** Local-only additive helper for decrypted message robustness. */
export async function saveUserPublicKey(userId: string, publicKey: string | null | undefined, keysRevision?: number): Promise<void> {
    if (!isKnownPlatform || !userId || !isValidPublicKeyB64(publicKey)) return;
    try {
        const existing = await ChatStorage.getUserKeys(userId);
        if (existing.some(k => k.device_key === publicKey)) return;
        const revision = normalizeRevision(keysRevision ?? existing[0]?.keys_revision ?? 0);
        await ChatStorage.setUserKeys(userId, [
            ...existing.map(k => ({ device_key: k.device_key, keys_revision: k.keys_revision })),
            { device_key: publicKey, keys_revision: revision },
        ], revision);
        e2eeLog(TAG, 'Registry: key appended', { userId, key: keyFp(publicKey), keys_revision: revision });
    } catch (err) {
        console.warn(`${TAG} Failed to append public key for ${userId}`, err);
    }
}

export async function resolveUserPublicKeys(userId: string): Promise<string[]> {
    if (!isKnownPlatform || !userId) return [];
    try {
        const currentRevision = authState.keys_revision?.peek?.() ?? 0;
        const cachedRevision = await ChatStorage.getUserKeysRevision(userId);
        if (cachedRevision < currentRevision) {
            e2eeLog(TAG, 'Self sibling keys stale, fetching...', { cachedRevision, currentRevision });
            if (typeof PersonalProfileApi?.getE2EEKey === 'function') {
                const res = await PersonalProfileApi.getE2EEKey(userId);
                const freshRevision = Number.isFinite(res?.keys_revision) ? Math.max(0, Math.trunc(res.keys_revision)) : 0;
                const keys = (res?.e2ee_public_keys || [])
                    .filter(isValidPublicKeyB64)
                    .map(device_key => ({ device_key, keys_revision: freshRevision }));
                await ChatStorage.setUserKeys(userId, keys, freshRevision);
            }
        }
    } catch (err) {
        console.warn(`${TAG} Self sibling keys sync failed:`, err);
    }
    try {
        return uniqueValidKeys((await ChatStorage.getUserKeys(userId)).map(k => k.device_key));
    } catch (err) {
        console.warn(`${TAG} Registry lookup failed for ${userId}`, err);
        return [];
    }
}


const recipientKeyFetchInFlight = new Map<string, Promise<string | null>>();


function filePayloadToMediaMetadata(payload: { file_name: string; mime_type: string; size: number | null }): E2EEMediaMetadata {
    return {
        fileName: payload.file_name,
        mimeType: payload.mime_type,
        size: payload.size,
    };
}

function decryptV3PayloadForThisDevice(content: string) {
    const myPublicKey = getMyPublicKey();
    const myPrivateKey = getMyPrivateKey();
    if (!myPublicKey || !myPrivateKey) {
        throw new Error(`${TAG} cannot decrypt v3 payload — no local identity keypair`);
    }
    e2eeLog(TAG, 'Ingress: attempting v3 decrypt', { myKey: keyFp(myPublicKey) });
    const payload = decryptPayloadEnvelope(content, myPublicKey, myPrivateKey);
    e2eeLog(TAG, 'Ingress: v3 decrypt OK', { payloadType: payload.type, myKey: keyFp(myPublicKey) });
    return payload;
}

async function fetchRecipientPublicKeyFromBackend(
    recipientId: string,
    pass?: E2EERecipientKeyRefreshPass,
): Promise<string | null> {
    const existing = pass?.get(recipientId) ?? recipientKeyFetchInFlight.get(recipientId);
    if (existing) return existing;

    const promise = (async () => {
        e2eeLog(TAG, 'Resolve recipient key: backend refresh get-e2ee-key', { recipientId });
        const res = await PersonalProfileApi.getE2EEKey(recipientId);
        const keys = uniqueValidKeys(res?.e2ee_public_keys || []);
        await saveUserKeys(recipientId, keys, res?.keys_revision ?? 0);
        return keys[0] ?? null;
    })();

    if (pass) {
        pass.set(recipientId, promise);
    } else {
        recipientKeyFetchInFlight.set(recipientId, promise);
        promise.finally(() => {
            if (recipientKeyFetchInFlight.get(recipientId) === promise) {
                recipientKeyFetchInFlight.delete(recipientId);
            }
        }).catch(() => undefined);
    }
    return promise;
}

export async function ensureRecipientKeysForRevision(
    recipientId: string,
    requiredRevision: number,
    pass?: E2EERecipientKeyRefreshPass,
): Promise<{ ok: true; keysRevision: number } | { ok: false; reason: E2EEStrictSendFailureReason }> {
    const revision = normalizeRevision(requiredRevision);
    try {
        // When we have a known revision, check if local cache matches before fetching.
        if (revision > 0) {
            const storedRevision = await ChatStorage.getUserKeysRevision(recipientId);
            if (storedRevision === revision && (await ChatStorage.getUserKeys(recipientId)).length > 0) {
                e2eeLog(TAG, 'Ensure recipient keys: cache HIT', { recipientId, revision });
                return { ok: true, keysRevision: revision };
            }
        }

        // Revision unknown (0) or cache stale — always fetch fresh from backend.
        e2eeLog(TAG, 'Ensure recipient keys: fetching from backend', { recipientId, knownRevision: revision });
        await fetchRecipientPublicKeyFromBackend(recipientId, pass);
        const freshRevision = await ChatStorage.getUserKeysRevision(recipientId);
        const freshKeys = await ChatStorage.getUserKeys(recipientId);
        if (freshKeys.length === 0) {
            e2eeLog(TAG, 'Ensure recipient keys: backend returned NO keys', { recipientId, freshRevision });
            return { ok: false, reason: 'recipient_key_unavailable' };
        }
        e2eeLog(TAG, 'Ensure recipient keys: fetched OK', { recipientId, keyCount: freshKeys.length, revision: freshRevision });
        return { ok: true, keysRevision: freshRevision };
    } catch (err) {
        console.warn(`${TAG} Recipient key revision refresh failed for ${recipientId}`, err);
        return { ok: false, reason: 'recipient_key_fetch_failed' };
    }
}

export async function resolveAuthorizedPublicKeysForSend(
    recipientId: string,
    recipientKeysRevision: number,
    myPublicKey: string,
    pass?: E2EERecipientKeyRefreshPass,
): Promise<ResolveAuthorizedPublicKeysForSendResult> {
    if (!isKnownPlatform) return { ok: false, reason: 'unsupported_platform' };
    if (!recipientId) return { ok: false, reason: 'invalid_recipient' };
    if (!isValidPublicKeyB64(myPublicKey)) return { ok: false, reason: 'local_key_unavailable' };

    const revision = normalizeRevision(recipientKeysRevision);
    if (revision > 0) {
        const ensured = await ensureRecipientKeysForRevision(recipientId, revision, pass);
        if (!ensured.ok) return ensured;
    } else {
        const storedRevision = await ChatStorage.getUserKeysRevision(recipientId);
        const storedKeys = await ChatStorage.getUserKeys(recipientId);
        if (storedRevision <= 0 || storedKeys.length === 0) {
            await fetchRecipientPublicKeyFromBackend(recipientId, pass);
        }
    }

    const recipientKeys = uniqueValidKeys((await ChatStorage.getUserKeys(recipientId)).map(k => k.device_key));
    if (recipientKeys.length === 0) return { ok: false, reason: 'recipient_key_unavailable' };

    const ownUserId = authState.userId.peek();
    const ownKeys = ownUserId ? await resolveUserPublicKeys(ownUserId) : [];
    const publicKeys = uniqueValidKeys([myPublicKey, ...ownKeys, ...recipientKeys]);
    return { ok: true, publicKeys, recipientKey: recipientKeys[0] };
}

/**
 * Resolves the recipient's public key for non-strict read/unwrap paths:
 * persistent registry first, then `get-e2ee-key` only on cache miss.
 * `null` is authoritative "server confirmed no E2EE" for non-strict reads.
 */
export async function resolveRecipientPublicKey(recipientId: string): Promise<string | null> {
    if (!isKnownPlatform || !recipientId) return null;

    try {
        const stored = await ChatStorage.getFirstUserKey(recipientId);
        if (isValidPublicKeyB64(stored)) {
            e2eeLog(TAG, 'Resolve recipient key: registry HIT', { recipientId, key: keyFp(stored) });
            return stored;
        }
    } catch (err) {
        console.warn(`${TAG} Registry lookup failed for ${recipientId}`, err);
    }

    try {
        const key = await fetchRecipientPublicKeyFromBackend(recipientId);
        e2eeLog(TAG, 'Resolve recipient key: server result', {
            recipientId,
            key: key === null ? 'null (recipient has no E2EE)' : keyFp(key),
        });
        return key;
    } catch (err) {
        console.warn(`${TAG} get-e2ee-key fallback failed for ${recipientId}`, err);
        return null;
    }
}

export async function resolveRecipientPublicKeyStrict(
    recipientId: string,
    options?: E2EEStrictOptions,
): Promise<ResolveRecipientPublicKeyStrictResult> {
    if (!isKnownPlatform) return { ok: false, reason: 'unsupported_platform' };
    if (!recipientId) return { ok: false, reason: 'invalid_recipient' };

    try {
        // 1. Registry-first: use cached key when available (avoids network round-trip).
        //    The persistent registry is kept fresh by natural refresh paths:
        //    chat list sync, incoming WS messages, pending message sync, and app hydration.
        const stored = await ChatStorage.getFirstUserKey(recipientId);
        if (isValidPublicKeyB64(stored)) {
            e2eeLog(TAG, 'Strict resolve key: registry HIT', {
                recipientId,
                key: keyFp(stored),
            });
            return { ok: true, publicKey: stored };
        }

        // 2. Registry miss (undefined) — fall back to backend refresh
        e2eeLog(TAG, 'Strict resolve key: registry MISS, backend fallback', { recipientId });
        const key = await fetchRecipientPublicKeyFromBackend(recipientId, options?.recipientKeyRefreshPass);
        if (!isValidPublicKeyB64(key)) {
            console.warn(`${TAG} 🚫 Recipient ${recipientId} has NO E2EE key (confirmed by server) — send blocked`);
            return { ok: false, reason: 'recipient_key_unavailable' };
        }
        return { ok: true, publicKey: key };
    } catch (err) {
        console.warn(`${TAG} strict recipient key refresh failed for ${recipientId}`, err);
        return { ok: false, reason: 'recipient_key_fetch_failed' };
    }
}

// ————————————————————————————————————————————————————————————————————————————
// Outgoing text — encrypt at send time only
// ————————————————————————————————————————————————————————————————————————————

/**
 * Strict send context helper: requires local key readiness, confirmed backend
 * self-key, and freshly refreshed recipient key. Failure blocks transport.
 */
async function requireStrictSendContext(
    recipientId: string,
    options?: E2EEStrictOptions,
): Promise<
    | { ok: true; privateKey: string; publicKey: string; recipientKey: string; publicKeys: string[] }
    | { ok: false; reason: E2EEStrictSendFailureReason }
> {
    if (!isKnownPlatform) return { ok: false, reason: 'unsupported_platform' };
    if (!recipientId) return { ok: false, reason: 'invalid_recipient' };

    const ready = typeof requireStrictE2EEReadyForSend === 'function'
        ? await requireStrictE2EEReadyForSend()
        : (() => {
            // Jest legacy mocks may not expose the new strict helper; production module always does.
            const privateKey = getMyPrivateKey();
            return privateKey
                ? { ok: true as const, publicKey: '', privateKey }
                : { ok: false as const, reason: 'local_key_unavailable' as const };
        })();
    if (!ready.ok) return { ok: false, reason: ready.reason };

    const authorized = await resolveAuthorizedPublicKeysForSend(
        recipientId,
        options?.recipientKeysRevision ?? 0,
        ready.publicKey,
        options?.recipientKeyRefreshPass,
    );
    if (!authorized.ok) return { ok: false, reason: authorized.reason };

    return {
        ok: true,
        privateKey: ready.privateKey,
        publicKey: ready.publicKey,
        recipientKey: authorized.recipientKey,
        publicKeys: authorized.publicKeys,
    };
}

/** Encrypts outgoing text strictly. Failure blocks send; no plaintext fallback. */
export async function encryptOutgoingTextStrict(
    recipientId: string,
    plaintext: string,
    options?: E2EEStrictOptions,
): Promise<EncryptOutgoingTextStrictResult> {
    const ctx = await requireStrictSendContext(recipientId, options);
    if (!ctx.ok) return ctx;

    try {
        const wire = encryptPayloadEnvelope({ type: 'text', text: plaintext ?? '' }, ctx.publicKeys);
        e2eeLog(TAG, 'Send text: ENCRYPTED strict V3 envelope', {
            recipientId,
            keyCount: ctx.publicKeys.length,
            recipientKey: keyFp(ctx.recipientKey),
            plaintextChars: (plaintext ?? '').length,
            wireChars: wire.length,
        });
        return { ok: true, wire };
    } catch (err) {
        console.warn(`${TAG} strict encryptOutgoingText failed`, err);
        return { ok: false, reason: 'encryption_failed' };
    }
}

/** Legacy call shape retained for callers during migration; strict failures throw instead of returning plaintext. */
export async function encryptOutgoingText(recipientId: string, plaintext: string): Promise<string> {
    const result = await encryptOutgoingTextStrict(recipientId, plaintext);
    if (!result.ok) {
        throw new Error(`${TAG} strict text encryption blocked: ${result.reason}`);
    }
    return result.wire;
}

// ————————————————————————————————————————————————————————————————————————————
// Incoming messages — single shared ingress processor
// ————————————————————————————————————————————————————————————————————————————

/**
 * Best-effort batch lookup of locally persisted message rows (refresh
 * self-heal for own encrypted echoes). Storage failures degrade to an empty
 * map — callers then blank per spec instead of crashing the ingress path.
 */
async function loadLocalMessagesById(
    messageIds: string[],
): Promise<Map<string, { content?: string | null; file_name?: string | null }>> {
    const byId = new Map<string, { content?: string | null; file_name?: string | null }>();
    if (messageIds.length === 0) return byId;
    // Tolerate storage impls without the lookup (not yet initialized / test doubles).
    if (typeof (ChatStorage as any).getMessagesByIds !== 'function') return byId;
    try {
        const rows = await ChatStorage.getMessagesByIds(messageIds);
        for (const row of rows || []) byId.set(row.message_id, row);
    } catch (err) {
        console.warn(`${TAG} Local message lookup failed — falling back to blanking`, err);
    }
    return byId;
}

export interface ProcessIncomingOptions {
    /**
     * Resolves the sender's user id for an incoming message so the sender's
     * public key can be saved to the registry (MessageEntry has no sender_id;
     * callers usually map chat_id → other_user_id). Optional — decryption
     * itself uses the key carried on the message payload.
     */
    resolveSenderId?: (msg: MessageEntry) => string | null | undefined;
    /** Structured strict receive failure hook for ACK/retry decisions. */
    onFailure?: (failure: E2EEInboundFailure) => void;
    /**
     * Trusted local-storage replay only: permits already-decrypted plaintext rows
     * that carry persisted sender key metadata. Never set for WS/API payloads.
     */
    allowLocalPlaintext?: boolean;
}

/**
 * Processes server-delivered messages IN PLACE before persistence:
 * Decrypts V3 message envelopes before persistence; failure → failed placeholder.
 *
 * Mutates and returns the same array for caller convenience.
 */
export async function processIncomingMessages(
    entries: MessageEntry[],
    options?: ProcessIncomingOptions,
): Promise<MessageEntry[]> {
    if (!isKnownPlatform || entries.length === 0) return entries;
    await whenKeyInitSettled();

    const stats = { decrypted: 0, plaintext: 0, failedBlanked: 0, mediaNormalized: 0 };

    for (const msg of entries) {
        if (isV3Envelope(msg.content)) {
            e2eeLog(TAG, 'Ingress: message is V3 envelope', { messageId: msg.message_id, type: msg.message_type, isFromMe: msg.is_from_me });
            try {
                const payload = decryptV3PayloadForThisDevice(msg.content);
                if (msg.message_type === 'text') {
                    if (payload.type !== 'text') throw new Error('expected text payload');
                    msg.content = payload.text;
                    stats.decrypted++;
                    e2eeLog(TAG, 'Ingress: text decrypted', { messageId: msg.message_id, plainChars: (payload.text ?? '').length });
                } else {
                    if (payload.type !== 'file') throw new Error('expected file payload');
                    applyMediaMetadata(msg, filePayloadToMediaMetadata(payload));
                    // Media metadata already extracted above
                    stats.mediaNormalized++;
                    e2eeLog(TAG, 'Ingress: media metadata decrypted', { messageId: msg.message_id, fileName: msg.file_name, mimeType: msg.file_mime_type });
                }
            } catch (err) {
                const reason = getMyPrivateKey() ? 'auth_failed' : 'local_key_unavailable';
                console.warn(`${TAG} Failed to decrypt v3 message ${msg.message_id} — failed placeholder`, err);
                e2eeLog(TAG, 'Ingress: v3 decrypt FAILED', { messageId: msg.message_id, reason, error: err instanceof Error ? err.message : String(err) });
                markMessageAsFailed(msg, reason, options);
                stats.failedBlanked++;
            }
            continue;
        }

        if (msg.message_type === 'text' && options?.allowLocalPlaintext === true) {
            stats.plaintext++;
            continue;
        }

        if (msg.content) {
            e2eeLog(TAG, 'Ingress: non-V3 server content fail-closed', { messageId: msg.message_id, type: msg.message_type });
            markMessageAsFailed(msg, 'auth_failed', options);
            stats.failedBlanked++;
        }
    }

    e2eeLog(TAG, 'Ingress: batch processed', { total: entries.length, ...stats });
    return entries;
}

export async function processIncomingMessagesWithE2EEReport(
    entries: MessageEntry[],
    options?: Omit<ProcessIncomingOptions, 'onFailure'>,
): Promise<ProcessIncomingMessagesResult> {
    const failures: E2EEInboundFailure[] = [];
    const processed = await processIncomingMessages(entries, {
        ...options,
        onFailure: failure => failures.push(failure),
    });
    return { entries: processed, failures };
}

// ————————————————————————————————————————————————————————————————————————————
// Chat list — registry sync + preview decryption
// ————————————————————————————————————————————————————————————————————————————

/**
 * Processes the server chat list IN PLACE before persistence:
 * 1. Uses locally persisted `user_keys` for the chat counterpart.
 * 2. Decrypts encrypted incoming text previews; any failure → "" per spec.
 *    Own encrypted text previews are restored from the locally persisted
 *    plaintext message row when available (refresh self-heal).
 * 3. Media previews: the server-side preview content for an encrypted media
 *    message is the WRAPPED MEDIA KEY (own and incoming alike) — restores the
 *    plaintext file name from the local message row, mirroring the
 *    live-session preview the WS bridge stores via `getPreviewText`;
 *    no readable local copy → "" (never ciphertext on screen).
 *
 * Mutates and returns the same array for caller convenience.
 */
export async function processIncomingChats(chats: ChatEntry[]): Promise<ChatEntry[]> {
    if (!isKnownPlatform || chats.length === 0) return chats;
    await whenKeyInitSettled();

    const stats = { decrypted: 0, blanked: 0, healed: 0 };
    const failedChats: ChatEntry[] = [];

    for (const chat of chats) {
        if (isV3Envelope(chat.last_message_content)) {
            e2eeLog(TAG, 'Chat preview: V3 envelope detected', { chatId: chat.chat_id, type: chat.last_message_type });
            try {
                const payload = decryptV3PayloadForThisDevice(chat.last_message_content as string);
                chat.last_message_content = payload.type === 'text' ? payload.text : payload.file_name;
                stats.decrypted++;
                e2eeLog(TAG, 'Chat preview: decrypted', { chatId: chat.chat_id, previewType: payload.type });
            } catch (err) {
                failedChats.push(chat);
                stats.blanked++;
                e2eeLog(TAG, 'Chat preview: decrypt FAILED (queueing for heal check)', { chatId: chat.chat_id, error: err instanceof Error ? err.message : String(err) });
            }
            continue;
        }

        if (chat.last_message_content) {
            e2eeLog(TAG, 'Chat preview: non-V3 content fail-closed (queueing for heal check)', { chatId: chat.chat_id });
            failedChats.push(chat);
            stats.blanked++;
        }
    }

    // HEAL PREVIEWS USING LOCAL HISTORY SYNC DATA
    // If decryption failed, check if the message payload exists in local storage as plaintext!
    if (failedChats.length > 0) {
        const messageIdsToHeal = failedChats.map(c => c.last_message_id).filter((id): id is string => !!id);
        if (messageIdsToHeal.length > 0 && typeof ChatStorage.getMessagesByIds === 'function') {
            try {
                const localMessages = await ChatStorage.getMessagesByIds(messageIdsToHeal);
                const localMsgMap = new Map(localMessages.map(m => [m.message_id, m]));
                for (const chat of failedChats) {
                    const localMsg = chat.last_message_id ? localMsgMap.get(chat.last_message_id) : null;
                    if (localMsg) {
                        chat.last_message_content = getPreviewText(localMsg as any);
                        stats.healed++;
                        e2eeLog(TAG, 'Chat preview: HEALED from local storage', { chatId: chat.chat_id });
                    } else {
                        markChatPreviewAsFailed(chat);
                    }
                }
            } catch (err) {
                console.error(`${TAG} Failed to fetch local messages for preview heal:`, err);
                for (const chat of failedChats) markChatPreviewAsFailed(chat);
            }
        } else {
            for (const chat of failedChats) markChatPreviewAsFailed(chat);
        }
    }

    e2eeLog(TAG, 'Chat list: processed', { total: chats.length, ...stats });
    return chats;
}

// ————————————————————————————————————————————————————————————————————————————
// Media — V3 envelope metadata + secretbox bulk bytes
// ————————————————————————————————————————————————————————————————————————————

export interface EncryptedMediaUpload {
    /** file:// URI of the encrypted temp copy to upload. */
    encryptedUri: string;
    /** Opaque encrypted upload file name; original name lives inside encrypted `content`. */
    uploadFileName: string;
    /** V3 envelope JSON — caption → message content. */
    wrappedKey: string;
    /** Deletes the encrypted temp copy. ALWAYS call after the upload settles. */
    cleanup: () => void;
}

/**
 * Prepares an encrypted upload copy of a staged media file (native only).
 *
 * Reads the sender's staged plaintext file (NEVER modified), encrypts the bytes
 * with a fresh secretbox key into a temp `.enc` file under the cache directory,
 * and wraps the key for the recipient.
 *
 * Strict path never falls back to plaintext. Any key/prep failure blocks upload.
 * Web uses `encryptOutgoingMediaBlob` instead (IndexedDB blobs, no file URIs).
 */
export async function prepareOutgoingMediaStrict(
    input: PrepareOutgoingMediaStrictInput,
    options?: E2EEStrictOptions,
): Promise<PrepareOutgoingMediaStrictResult> {
    if (input.kind === 'file' && (!input.localUri || isWeb)) {
        return { ok: false, reason: isWeb ? 'unsupported_platform' : 'invalid_payload' };
    }
    if (input.kind === 'blob' && !input.blob) {
        return { ok: false, reason: 'invalid_payload' };
    }

    const ctx = await requireStrictSendContext(input.recipientId, options);
    if (!ctx.ok) return ctx;

    try {
        if (input.kind === 'file') {
            const { File, Directory, Paths } = await import('expo-file-system');
            const source = new File(input.localUri);
            const fileBytes = new Uint8Array(await source.arrayBuffer());

            const mediaKey = generateMediaKey();
            const metadata = buildMediaMetadata(input, fileBytes.length);
            const encryptedBytes = encryptMediaBytes(fileBytes, mediaKey);
            const wrappedKey = encryptPayloadEnvelope({
                type: 'file',
                file_key: encode32ByteKeyB64(mediaKey),
                file_name: metadata.fileName,
                mime_type: metadata.mimeType,
                size: metadata.size,
            }, ctx.publicKeys);
            const uploadFileName = makeEncryptedUploadFileName();
            e2eeLog(TAG, 'Media upload: file ENCRYPTED strict (fresh secretbox key, encrypted metadata envelope)', {
                recipientId: input.recipientId,
                recipientKey: keyFp(ctx.recipientKey),
                keyCount: ctx.publicKeys.length,
                fileName: metadata.fileName,
                mimeType: metadata.mimeType,
                plainBytes: fileBytes.length,
                encryptedBytes: encryptedBytes.length,
            });

            const tempDir = new Directory(Paths.cache, 'e2eeUploads');
            if (!tempDir.exists) {
                tempDir.create({ intermediates: true });
            }
            const tempFile = new File(tempDir, `${Date.now()}-${Math.random().toString(36).slice(2)}${ENCRYPTED_FILE_SUFFIX}`);

            tempFile.write(encryptedBytes);

            return {
                ok: true,
                media: {
                    encryptedUri: tempFile.uri,
                    uploadFileName,
                    wrappedKey,
                    cleanup: () => {
                        try {
                            if (tempFile.exists) tempFile.delete();
                        } catch { /* ignore */ }
                    },
                },
            };
        }

        const fileBytes = new Uint8Array(await input.blob.arrayBuffer());
        const mediaKey = generateMediaKey();
        const metadata = buildMediaMetadata(input, fileBytes.length);
        const encryptedBytes = encryptMediaBytes(fileBytes, mediaKey);
        const wrappedKey = encryptPayloadEnvelope({
            type: 'file',
            file_key: encode32ByteKeyB64(mediaKey),
            file_name: metadata.fileName,
            mime_type: metadata.mimeType,
            size: metadata.size,
        }, ctx.publicKeys);
        const uploadFileName = makeEncryptedUploadFileName();
        e2eeLog(TAG, 'Media upload (web): blob ENCRYPTED strict (fresh secretbox key, encrypted metadata envelope)', {
            recipientId: input.recipientId,
            recipientKey: keyFp(ctx.recipientKey),
            keyCount: ctx.publicKeys.length,
            fileName: metadata.fileName,
            mimeType: metadata.mimeType,
            plainBytes: fileBytes.length,
            encryptedBytes: encryptedBytes.length,
        });

        return {
            ok: true,
            media: {
                encryptedBlob: new Blob([encryptedBytes] as any, { type: 'application/octet-stream' }),
                uploadFileName,
                wrappedKey,
                cleanup: () => { /* no temp file on web */ },
            },
        };
    } catch (err) {
        console.warn(`${TAG} strict media encryption failed`, err);
        return { ok: false, reason: 'encryption_failed' };
    }
}

export async function encryptOutgoingMediaFile(
    recipientId: string,
    localUri: string,
    originalFileName: string,
): Promise<EncryptedMediaUpload | null> {
    const result = await prepareOutgoingMediaStrict({ kind: 'file', recipientId, localUri, originalFileName });
    if (!result.ok) {
        throw new Error(`${TAG} strict media encryption blocked: ${result.reason}`);
    }
    return result.media as EncryptedMediaUpload;
}

export interface EncryptedMediaBlobUpload {
    /** Encrypted bytes to upload (web — kept in memory, GC reclaims it). */
    encryptedBlob: Blob;
    /** Opaque encrypted upload file name; original name lives inside encrypted `content`. */
    uploadFileName: string;
    /** V3 envelope JSON — caption → message content. */
    wrappedKey: string;
    /** No-op on web (no temp file) — kept so callers can treat both variants alike. */
    cleanup: () => void;
}

/**
 * Web counterpart of `encryptOutgoingMediaFile`: prepares an encrypted upload
 * copy of a staged media Blob (the IndexedDB-staged plaintext is NEVER
 * modified), encrypting the bytes with a fresh secretbox key and wrapping the
 * key for the recipient.
 *
 * Strict path never falls back to plaintext. Any key/prep failure blocks upload.
 */
export async function encryptOutgoingMediaBlob(
    recipientId: string,
    blob: Blob,
    originalFileName: string,
): Promise<EncryptedMediaBlobUpload | null> {
    const result = await prepareOutgoingMediaStrict({ kind: 'blob', recipientId, blob, originalFileName });
    if (!result.ok) {
        throw new Error(`${TAG} strict media encryption blocked: ${result.reason}`);
    }
    return result.media as EncryptedMediaBlobUpload;
}

/** True when a media message carries a V3 E2EE envelope in `content`. */
export function isEncryptedMediaMessage(msg: MessageEntry): boolean {
    return isKnownPlatform && msg.message_type !== 'text' && (isV3Envelope(msg.content) || !!(msg as any)._fileKey);
}

/**
 * Resolves the chat counterpart's user id from the locally persisted chat row
 * (MessageEntry carries no sender_id — for incoming messages `recipient_id`
 * is OUR own id). Defensive: missing impl / storage failure → null.
 */
async function resolveChatCounterpartUserId(chatId: string | undefined): Promise<string | null> {
    if (!chatId) return null;
    try {
        if (typeof ChatStorage.getChatById !== 'function') return null;
        const chat = await ChatStorage.getChatById(chatId);
        return (chat as any)?.other_user_id ?? null;
    } catch (err) {
        console.warn(`${TAG} Chat counterpart lookup failed for ${chatId}`, err);
        return null;
    }
}

/**
 * Decrypts downloaded media bytes in memory: unwraps the symmetric key from
 * `msg.content` with the counterpart's public key (the sender's key for
 * incoming messages, the RECIPIENT's key for own messages — pass it via
 * V3 envelope in `msg.content`, then opens the secretbox. Throws on any failure — callers MUST treat that as a download
 * failure (no ACK on primary; the relay retains the file for retry).
 */
export function decryptIncomingMediaBytes(
    msg: MessageEntry,
    encryptedBytes: Uint8Array,
): Uint8Array {
    e2eeLog(TAG, 'Media download: decrypting v3 in memory', {
        messageId: msg.message_id,
        encryptedBytes: encryptedBytes.length,
        ownMessage: !!msg.is_from_me,
    });

    if (!msg.content || !isV3Envelope(msg.content)) {
        throw new Error(`${TAG} cannot decrypt media — missing v3 envelope`);
    }
    const payload = decryptV3PayloadForThisDevice(msg.content);
    if (payload.type !== 'file') {
        throw new Error(`${TAG} cannot decrypt media — invalid v3 file payload`);
    }
    const fileKeyB64 = payload.file_key;
    const meta = filePayloadToMediaMetadata(payload);
    applyMediaMetadata(msg, meta);

    const plainBytes = decryptMediaBytes(encryptedBytes, decode32ByteKeyB64(fileKeyB64));
    e2eeLog(TAG, 'Media download: DECRYPTED v3', {
        messageId: msg.message_id,
        fileName: msg.file_name,
        mimeType: msg.file_mime_type,
        plainBytes: plainBytes.length,
    });
    return plainBytes;
}
