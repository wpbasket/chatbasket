// lib/personalLib/e2ee/e2ee.service.ts
//
// High-level E2EE orchestration for personal chat.
//
// Rules (see docs: personal.e2ee-upgrade.md / personal.e2ee-tasks.md §4):
// - Outgoing: local queue keeps plaintext; encrypt ONLY at send time using the
//   recipient's backend-refreshed public key. Missing local/recipient/self-key
//   confirmation blocks send — no plaintext fallback.
// - Incoming: decrypt using `sender_e2ee_public_key` carried on the message
//   payload BEFORE persistence. Decryption failure → generic failed placeholder;
//   ciphertext must never be shown or persisted as readable content.
// - Own messages echoed back by the server (`is_from_me`) are ciphertext this
//   device cannot decrypt (crypto_box is recipient-keyed); the locally
//   persisted plaintext copy (written by the outbox promotion path) is
//   restored when it exists — e.g. on history reloads after a page refresh —
//   otherwise generic failed placeholder is shown (other devices, Phase 1 limitation).
// - Web parity (until Phase 2): web runs the SAME pipeline as native — registry
//   sync, text/media encrypt + decrypt, fail-closed placeholders. Key GENERATION is
//   primary-device-only on both platforms (`authState.isPrimary`): secondary/
//   unknown devices hold no keys until promotion or the Phase 2 key sync, and
//   degrade gracefully exactly like a key-less native device. Only the media
//   byte source differs (IndexedDB blobs instead of file:// URIs).

import { Platform } from 'react-native';
import mime from 'react-native-mime-types';
import * as ChatStorage from '@/lib/storage/personalStorage/chat/chat.storage';
import type { ChatEntry, MessageEntry } from '../models/personal.model.chat';
import { PersonalProfileApi } from '../profileApi/personal.api.profile';
import {
    E2EE_FAILED_TO_LOAD_TEXT,
    decryptMediaBytes,
    decryptText,
    encryptMediaBytes,
    encryptText,
    generateMediaKey,
    isEncryptedContent,
    isValidPublicKeyB64,
    unwrapMediaEnvelope,
    wrapMediaEnvelope,
    type E2EEMediaMetadata,
} from './e2ee.crypto';
import { getMyPrivateKey, requireStrictE2EEReadyForSend, whenKeyInitSettled } from './e2ee.keys';
import { e2eeLog, keyFp } from './e2ee.log';

const TAG = '[E2EE]';
// Defensive: Platform is undefined in the bare Jest environment — treat
// unknown platforms as unsupported so E2EE safely no-ops (pass-through).
const isKnownPlatform = Platform?.OS != null;
const isWeb = Platform?.OS === 'web';

/** Suffix appended to encrypted upload file names. */
export const ENCRYPTED_FILE_SUFFIX = '.enc';


/** Strict fail-closed rollout boundary. Plaintext from E2EE-capable senders at/after this point is invalid. */
export const E2EE_STRICT_ROLLOUT_AT = '2026-06-12T00:00:00.000Z';
const E2EE_STRICT_ROLLOUT_TS = Date.parse(E2EE_STRICT_ROLLOUT_AT);

export type E2EEInboundFailureReason =
    | 'local_key_unavailable'
    | 'sender_key_unavailable'
    | 'media_download_transient'
    | 'media_gone'
    | 'auth_failed'
    | 'plaintext_after_strict_cutoff';

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
}

export type ResolveRecipientPublicKeyStrictResult =
    | { ok: true; publicKey: string }
    | { ok: false; reason: E2EEStrictSendFailureReason };

export type EncryptOutgoingTextStrictResult =
    | { ok: true; wire: string; recipient_e2ee_public_key_used: string }
    | { ok: false; reason: E2EEStrictSendFailureReason };

export type PrepareOutgoingMediaStrictInput =
    | { kind: 'file'; recipientId: string; localUri: string; originalFileName: string; originalMimeType?: string | null; originalSize?: number | null; messageType?: string | null }
    | { kind: 'blob'; recipientId: string; blob: Blob; originalFileName: string; originalMimeType?: string | null; originalSize?: number | null; messageType?: string | null };

export type PrepareOutgoingMediaStrictResult =
    | { ok: true; media: EncryptedMediaUpload | EncryptedMediaBlobUpload; recipient_e2ee_public_key_used: string }
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

function isAtOrAfterStrictRollout(iso: string | null | undefined): boolean {
    const ts = Date.parse(iso || '');
    if (!Number.isFinite(ts)) return true; // fail closed when timestamp is absent/malformed
    return ts >= E2EE_STRICT_ROLLOUT_TS;
}

function isStrictPlaintextViolation(createdAt: string | null | undefined, senderKey: string | null | undefined): boolean {
    return isValidPublicKeyB64(senderKey) && isAtOrAfterStrictRollout(createdAt);
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

function getStoredMediaCounterpartKey(msg: MessageEntry, unwrapKeyB64?: string | null): string | null | undefined {
    if (unwrapKeyB64 !== undefined) return unwrapKeyB64;
    return msg.is_from_me
        ? (msg as any).recipient_e2ee_public_key_used
        : msg.sender_e2ee_public_key;
}

export function hydrateEncryptedMediaMetadata(
    msg: MessageEntry,
    unwrapKeyB64?: string | null,
): E2EEMediaMetadata {
    const myPrivateKey = getMyPrivateKey();
    if (!myPrivateKey) {
        throw new Error(`${TAG} cannot decrypt media metadata — no local private key`);
    }
    const counterpartKey = getStoredMediaCounterpartKey(msg, unwrapKeyB64);
    if (!isValidPublicKeyB64(counterpartKey)) {
        throw new Error(`${TAG} cannot decrypt media metadata — missing unwrap public key`);
    }
    if (!msg.content) {
        throw new Error(`${TAG} cannot decrypt media metadata — missing envelope`);
    }
    const envelope = unwrapMediaEnvelope(msg.content, counterpartKey, myPrivateKey);
    applyMediaMetadata(msg, envelope.meta);
    return envelope.meta;
}

// ————————————————————————————————————————————————————————————————————————————
// Persistent key registry (never "cache") — user_keys
// ————————————————————————————————————————————————————————————————————————————

/**
 * Stores a user's public key in the persistent registry.
 * `null` is stored too — it records "user has no E2EE" after a server check.
 * Invalid (non-44-char/non-Base64) values are ignored.
 */
export async function saveUserPublicKey(userId: string, publicKey: string | null | undefined): Promise<void> {
    if (!isKnownPlatform || !userId || publicKey === undefined) return;
    if (publicKey !== null && !isValidPublicKeyB64(publicKey)) return;
    try {
        const existing = await ChatStorage.getUserE2eePublicKey(userId);
        if (existing === publicKey) return; // no change — skip the write
        await ChatStorage.setUserE2eePublicKey(userId, publicKey);
        e2eeLog(TAG, 'Registry: key updated', {
            userId,
            key: publicKey === null ? 'null (user has no E2EE)' : keyFp(publicKey),
            previous: existing === undefined ? '(none)' : existing === null ? 'null' : keyFp(existing),
        });
    } catch (err) {
        console.warn(`${TAG} Failed to save public key for ${userId}`, err);
    }
}

/**
 * Resolves the recipient's latest public key for send-time encryption:
 * persistent registry first, then the `get-e2ee-key` endpoint (result is
 * persisted). Returns null when the recipient has no E2EE set up.
 */
const recipientKeyFetchInFlight = new Map<string, Promise<string | null>>();

async function fetchRecipientPublicKeyFromBackend(
    recipientId: string,
    pass?: E2EERecipientKeyRefreshPass,
): Promise<string | null> {
    const existing = pass?.get(recipientId) ?? recipientKeyFetchInFlight.get(recipientId);
    if (existing) return existing;

    const promise = (async () => {
        e2eeLog(TAG, 'Resolve recipient key: backend refresh get-e2ee-key', { recipientId });
        const res = await PersonalProfileApi.getE2EEKey(recipientId);
        const raw = res?.e2ee_public_key ?? null;
        if (raw === null) {
            await saveUserPublicKey(recipientId, null);
            return null;
        }
        if (!isValidPublicKeyB64(raw)) {
            console.warn(`${TAG} get-e2ee-key returned invalid public key for ${recipientId}`);
            return null;
        }
        await saveUserPublicKey(recipientId, raw);
        return raw;
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

/**
 * Resolves the recipient's public key for non-strict read/unwrap paths:
 * persistent registry first, then `get-e2ee-key` only on cache miss.
 * `null` is authoritative "server confirmed no E2EE" for non-strict reads.
 */
export async function resolveRecipientPublicKey(recipientId: string): Promise<string | null> {
    if (!isKnownPlatform || !recipientId) return null;

    try {
        const stored = await ChatStorage.getUserE2eePublicKey(recipientId);
        if (isValidPublicKeyB64(stored)) {
            e2eeLog(TAG, 'Resolve recipient key: registry HIT', { recipientId, key: keyFp(stored) });
            return stored;
        }
        if (stored === null) {
            e2eeLog(TAG, 'Resolve recipient key: registry NULL', { recipientId });
            return null;
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
        const key = await fetchRecipientPublicKeyFromBackend(recipientId, options?.recipientKeyRefreshPass);
        if (!isValidPublicKeyB64(key)) {
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
    | { ok: true; privateKey: string; recipientKey: string }
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

    const recipient = await resolveRecipientPublicKeyStrict(recipientId, options);
    if (!recipient.ok) return { ok: false, reason: recipient.reason };

    return { ok: true, privateKey: ready.privateKey, recipientKey: recipient.publicKey };
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
        const wire = encryptText(plaintext ?? '', ctx.recipientKey, ctx.privateKey);
        e2eeLog(TAG, 'Send text: ENCRYPTED strict', {
            recipientId,
            recipientKey: keyFp(ctx.recipientKey),
            plaintextChars: (plaintext ?? '').length,
            wireChars: wire.length,
        });
        return { ok: true, wire, recipient_e2ee_public_key_used: ctx.recipientKey };
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
    allowPersistedPlaintext?: boolean;
}

/**
 * Processes server-delivered messages IN PLACE before persistence:
 * 1. Saves `sender_e2ee_public_key` into the persistent registry (when the
 *    sender id can be resolved).
 * 2. Decrypts incoming encrypted text content; failure → "" (never ciphertext).
 * 3. Own encrypted `is_from_me` echoes: restores the locally persisted
 *    plaintext copy when one exists (refresh self-heal); otherwise blanks to
 *    "" (multi-device self-copy is not decryptable in Phase 1 by design).
 *
 * Mutates and returns the same array for caller convenience.
 */
export async function processIncomingMessages(
    entries: MessageEntry[],
    options?: ProcessIncomingOptions,
): Promise<MessageEntry[]> {
    if (!isKnownPlatform || entries.length === 0) return entries;

    // Cold start / page refresh: key loading may still be in flight — wait for
    // it to settle so content isn't failed by a race (bounded, never throws).
    await whenKeyInitSettled();

    const myPrivateKey = getMyPrivateKey();
    const stats = { decrypted: 0, plaintext: 0, persistedPlaintext: 0, ownEchoRestored: 0, ownEchoBlanked: 0, failedBlanked: 0, mediaNormalized: 0 };

    // Pre-pass (refresh self-heal): the server echoes our own messages back as
    // ciphertext this device cannot decrypt. When a locally persisted plaintext
    // copy exists for the same message_id (outbox promotion wrote it), restore
    // it instead of showing a failed placeholder.
    const ownEchoIds = entries
        .filter(m => m.is_from_me && m.message_type === 'text' && isEncryptedContent(m.content))
        .map(m => m.message_id);
    const localOwnById = await loadLocalMessagesById(ownEchoIds);

    // Registry sync is deduped: latest message key wins, one write per sender.
    const senderIdByMessageId = new Map<string, string>();
    const senderKeyByMessageId = new Map<string, string | null>();
    const senderKeys = new Map<string, string | null>();
    for (const msg of entries) {
        if (msg.is_from_me) continue;
        const senderId = options?.resolveSenderId?.(msg) ?? undefined;
        if (senderId) senderIdByMessageId.set(msg.message_id, senderId);
        if (msg.sender_e2ee_public_key !== undefined) {
            const key = isValidPublicKeyB64(msg.sender_e2ee_public_key) ? msg.sender_e2ee_public_key : null;
            senderKeyByMessageId.set(msg.message_id, key);
            if (senderId) senderKeys.set(senderId, key);
        }
    }
    for (const [senderId, key] of senderKeys) {
        await saveUserPublicKey(senderId, key);
    }

    const registryKeysBySenderId = new Map<string, string | null | undefined>();
    for (const senderId of new Set(senderIdByMessageId.values())) {
        try {
            registryKeysBySenderId.set(senderId, await ChatStorage.getUserE2eePublicKey(senderId));
        } catch (err) {
            console.warn(`${TAG} Registry lookup failed for inbound sender ${senderId}`, err);
            registryKeysBySenderId.set(senderId, undefined);
        }
    }

    const getKnownSenderKey = (msg: MessageEntry): string | null => {
        const payloadKey = senderKeyByMessageId.get(msg.message_id);
        if (isValidPublicKeyB64(payloadKey)) return payloadKey;
        const senderId = senderIdByMessageId.get(msg.message_id);
        if (!senderId) return null;
        const stored = registryKeysBySenderId.get(senderId);
        return isValidPublicKeyB64(stored) ? stored : null;
    };

    for (const msg of entries) {
        // Encrypted media metadata lives inside the v2 content envelope. The
        // server/Appwrite fields are intentionally opaque (`*.enc`, octet-stream).
        // Keep `content` encrypted for download-time key unwrap; hydrate only the
        // UI/storage metadata from the authenticated envelope.
        if (
            msg.message_type !== 'text' &&
            isEncryptedContent(msg.content)
        ) {
            const senderKey = getKnownSenderKey(msg);
            if (!msg.is_from_me && isValidPublicKeyB64(senderKey)) {
                msg.sender_e2ee_public_key = senderKey;
            }
            const unwrapKey = msg.is_from_me ? await resolveMediaUnwrapKey(msg) : senderKey;
            if (!myPrivateKey) {
                markMessageAsFailed(msg, 'local_key_unavailable', options);
                stats.failedBlanked++;
                e2eeLog(TAG, 'Ingress: cannot decrypt media metadata — no local private key', { messageId: msg.message_id });
                continue;
            }
            if (!isValidPublicKeyB64(unwrapKey)) {
                markMessageAsFailed(msg, 'sender_key_unavailable', options);
                stats.failedBlanked++;
                e2eeLog(TAG, 'Ingress: cannot decrypt media metadata — missing/invalid unwrap key', {
                    messageId: msg.message_id,
                    unwrapKey: keyFp(unwrapKey),
                });
                continue;
            }
            try {
                const meta = hydrateEncryptedMediaMetadata(msg, unwrapKey);
                stats.mediaNormalized++;
                e2eeLog(TAG, 'Ingress: encrypted media metadata hydrated', {
                    messageId: msg.message_id,
                    fileName: meta.fileName,
                    mimeType: meta.mimeType,
                    size: meta.size,
                });
            } catch (err) {
                console.warn(`${TAG} Failed to decrypt media metadata ${msg.message_id} — failed placeholder`, err);
                markMessageAsFailed(msg, 'auth_failed', options);
                stats.failedBlanked++;
            }
            continue;
        }

        // Text decryption (only structurally-encrypted content). Legacy plaintext
        // before cutoff remains readable; plaintext at/after cutoff from an
        // E2EE-capable sender becomes the generic failed-message placeholder.
        if (msg.message_type !== 'text' || !isEncryptedContent(msg.content)) {
            if (msg.message_type === 'text') {
                const senderKey = getKnownSenderKey(msg);
                const isPersistedDecryptedPlaintext =
                    options?.allowPersistedPlaintext === true &&
                    !msg.is_from_me &&
                    isValidPublicKeyB64(msg.sender_e2ee_public_key);

                if (
                    !msg.is_from_me &&
                    isStrictPlaintextViolation(msg.created_at, senderKey) &&
                    !isPersistedDecryptedPlaintext
                ) {
                    markMessageAsFailed(msg, 'plaintext_after_strict_cutoff', options);
                    stats.failedBlanked++;
                    e2eeLog(TAG, 'Ingress: plaintext after strict cutoff failed closed', {
                        messageId: msg.message_id,
                        senderKey: keyFp(senderKey),
                    });
                } else {
                    stats.plaintext++;
                    if (isPersistedDecryptedPlaintext && isAtOrAfterStrictRollout(msg.created_at)) {
                        stats.persistedPlaintext++;
                        e2eeLog(TAG, 'Ingress: persisted decrypted plaintext replay allowed', {
                            messageId: msg.message_id,
                            senderKey: keyFp(msg.sender_e2ee_public_key),
                        });
                    }
                }
            }
            continue;
        }

        if (msg.is_from_me) {
            // Own ciphertext echoed by the server — undecryptable on this device.
            // Restore the locally persisted plaintext copy (outbox promotion)
            // when it exists; other devices show the generic failed placeholder.
            const localContent = localOwnById.get(msg.message_id)?.content;
            const localChars = localContent ? localContent.length : 0;
            if (localContent && !isEncryptedContent(localContent)) {
                msg.content = localContent;
                stats.ownEchoRestored++;
                e2eeLog(TAG, 'Ingress: own echo restored from local copy', {
                    messageId: msg.message_id,
                    plaintextChars: localChars,
                });
            } else {
                msg.content = E2EE_FAILED_TO_LOAD_TEXT;
                stats.ownEchoBlanked++;
                e2eeLog(TAG, 'Ingress: own encrypted echo failed placeholder (is_from_me)', { messageId: msg.message_id });
            }
            continue;
        }

        const senderKey = getKnownSenderKey(msg);
        if (!myPrivateKey) {
            markMessageAsFailed(msg, 'local_key_unavailable', options);
            stats.failedBlanked++;
            e2eeLog(TAG, 'Ingress: cannot decrypt — no local private key', { messageId: msg.message_id });
            continue;
        }
        if (!isValidPublicKeyB64(senderKey)) {
            markMessageAsFailed(msg, 'sender_key_unavailable', options);
            stats.failedBlanked++;
            e2eeLog(TAG, 'Ingress: cannot decrypt — missing/invalid sender key', {
                messageId: msg.message_id,
                senderKey: keyFp(senderKey),
            });
            continue;
        }

        try {
            msg.content = decryptText(msg.content, senderKey, myPrivateKey);
            msg.sender_e2ee_public_key = senderKey;
            stats.decrypted++;
            e2eeLog(TAG, 'Ingress: DECRYPTED', {
                messageId: msg.message_id,
                senderKey: keyFp(senderKey),
                plaintextChars: msg.content.length,
            });
        } catch (err) {
            console.warn(`${TAG} Failed to decrypt message ${msg.message_id} — failed placeholder`, err);
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
 * 1. Saves each chat's `other_user_e2ee_public_key` into the registry
 *    (metadata sync — the active key validation path).
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

    // Cold start / page refresh: key loading may still be in flight — wait for
    // it to settle so previews aren't failed by a race (bounded, never throws).
    await whenKeyInitSettled();

    const myPrivateKey = getMyPrivateKey();
    const stats = { decrypted: 0, restored: 0, blanked: 0 };

    // Registry sync from chat metadata, deduped latest-key-wins.
    const chatKeys = new Map<string, string | null>();
    for (const chat of chats) {
        if (chat.other_user_id && chat.other_user_e2ee_public_key !== undefined) {
            const key = isValidPublicKeyB64(chat.other_user_e2ee_public_key) ? chat.other_user_e2ee_public_key : null;
            chatKeys.set(chat.other_user_id, key);
        }
    }
    for (const [userId, key] of chatKeys) {
        await saveUserPublicKey(userId, key);
    }

    const registryKeysByUserId = new Map<string, string | null | undefined>();
    for (const userId of new Set(chats.map(c => c.other_user_id).filter(Boolean))) {
        try {
            registryKeysByUserId.set(userId, await ChatStorage.getUserE2eePublicKey(userId));
        } catch (err) {
            console.warn(`${TAG} Registry lookup failed for chat ${userId}`, err);
            registryKeysByUserId.set(userId, undefined);
        }
    }
    const getKnownChatKey = (chat: ChatEntry): string | null => {
        if (isValidPublicKeyB64(chat.other_user_e2ee_public_key)) return chat.other_user_e2ee_public_key;
        const stored = registryKeysByUserId.get(chat.other_user_id);
        return isValidPublicKeyB64(stored) ? stored : null;
    };

    // Pre-pass (refresh self-heal): restorable previews come from the locally
    // persisted plaintext message rows — own text echoes (same rule as the
    // ingress processor's own-echo handling) AND media previews of either side
    // (their server-side preview content is the wrapped media key).
    const restorePreviewIds = chats
        .filter(c =>
            !!c.last_message_id &&
            isEncryptedContent(c.last_message_content) &&
            (c.last_message_is_from_me || c.last_message_type !== 'text'),
        )
        .map(c => c.last_message_id as string);
    const localPreviewById = await loadLocalMessagesById(restorePreviewIds);

    for (const chat of chats) {
        // Plaintext after strict cutoff from an E2EE-capable sender is not shown.
        if (!isEncryptedContent(chat.last_message_content)) {
            const senderKey = getKnownChatKey(chat);
            if (
                chat.last_message_type === 'text' &&
                !chat.last_message_is_from_me &&
                isStrictPlaintextViolation(chat.last_message_created_at, senderKey)
            ) {
                markChatPreviewAsFailed(chat);
                stats.blanked++;
                e2eeLog(TAG, 'Chat list: plaintext preview after strict cutoff failed closed', {
                    chatId: chat.chat_id,
                    senderKey: keyFp(senderKey),
                });
            }
            continue;
        }

        if (chat.last_message_type !== 'text') {
            // MEDIA preview: the server preview content is the encrypted v2
            // media envelope. Prefer local plaintext row; otherwise decrypt only
            // the authenticated metadata (file name) and never show ciphertext.
            const localFileName = chat.last_message_id
                ? localPreviewById.get(chat.last_message_id)?.file_name
                : undefined;
            if (localFileName && !isEncryptedContent(localFileName)) {
                chat.last_message_content = localFileName;
                stats.restored++;
            } else {
                const chatKey = getKnownChatKey(chat);
                if (!myPrivateKey || !isValidPublicKeyB64(chatKey)) {
                    markChatPreviewAsFailed(chat);
                    stats.blanked++;
                    e2eeLog(TAG, 'Chat list: media preview failed placeholder (no metadata key/local copy)', {
                        chatId: chat.chat_id,
                    });
                    continue;
                }
                try {
                    const meta = unwrapMediaEnvelope(
                        chat.last_message_content as string,
                        chatKey,
                        myPrivateKey,
                    ).meta;
                    chat.last_message_content = meta.fileName;
                    stats.restored++;
                } catch (err) {
                    markChatPreviewAsFailed(chat);
                    stats.blanked++;
                    console.warn(`${TAG} Failed to decrypt media preview metadata for chat ${chat.chat_id}`, err);
                }
            }
            continue;
        }

        if (chat.last_message_is_from_me) {
            // Own encrypted preview from the server is undecryptable here —
            // restore the locally persisted plaintext copy when available.
            const localContent = chat.last_message_id
                ? localPreviewById.get(chat.last_message_id)?.content
                : undefined;
            if (localContent && !isEncryptedContent(localContent)) {
                chat.last_message_content = localContent;
                stats.restored++;
            } else {
                markChatPreviewAsFailed(chat);
                stats.blanked++;
            }
            continue;
        }

        const senderKey = getKnownChatKey(chat);
        if (!myPrivateKey || !isValidPublicKeyB64(senderKey)) {
            markChatPreviewAsFailed(chat);
            stats.blanked++;
            e2eeLog(TAG, 'Chat list: preview failed placeholder (cannot decrypt)', {
                chatId: chat.chat_id,
                reason: !myPrivateKey ? 'no local private key' : 'missing/invalid sender key',
            });
            continue;
        }

        try {
            chat.last_message_content = decryptText(chat.last_message_content, senderKey, myPrivateKey);
            stats.decrypted++;
        } catch (err) {
            console.warn(`${TAG} Failed to decrypt preview for chat ${chat.chat_id} — failed placeholder`, err);
            markChatPreviewAsFailed(chat);
            stats.blanked++;
        }
    }

    e2eeLog(TAG, 'Chat list: batch processed', { total: chats.length, previewsDecrypted: stats.decrypted, previewsRestored: stats.restored, previewsBlanked: stats.blanked });
    return chats;
}

// ————————————————————————————————————————————————————————————————————————————
// Media — envelope encryption (secretbox bulk + crypto_box key wrap)
// ————————————————————————————————————————————————————————————————————————————

export interface EncryptedMediaUpload {
    /** file:// URI of the encrypted temp copy to upload. */
    encryptedUri: string;
    /** Opaque encrypted upload file name; original name lives inside encrypted `content`. */
    uploadFileName: string;
    /** `base64(nonce || crypto_box(JSON{key,meta}))` — caption → message content. */
    wrappedKey: string;
    /** Recipient public key used to wrap this media key; persist for old own-media unwrap after key rotation. */
    recipient_e2ee_public_key_used: string;
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
            const wrappedKey = wrapMediaEnvelope(mediaKey, metadata, ctx.recipientKey, ctx.privateKey);
            const uploadFileName = makeEncryptedUploadFileName();
            e2eeLog(TAG, 'Media upload: file ENCRYPTED strict (fresh secretbox key, encrypted metadata envelope)', {
                recipientId: input.recipientId,
                recipientKey: keyFp(ctx.recipientKey),
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
                recipient_e2ee_public_key_used: ctx.recipientKey,
                media: {
                    encryptedUri: tempFile.uri,
                    uploadFileName,
                    wrappedKey,
                    recipient_e2ee_public_key_used: ctx.recipientKey,
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
        const wrappedKey = wrapMediaEnvelope(mediaKey, metadata, ctx.recipientKey, ctx.privateKey);
        const uploadFileName = makeEncryptedUploadFileName();
        e2eeLog(TAG, 'Media upload (web): blob ENCRYPTED strict (fresh secretbox key, encrypted metadata envelope)', {
            recipientId: input.recipientId,
            recipientKey: keyFp(ctx.recipientKey),
            fileName: metadata.fileName,
            mimeType: metadata.mimeType,
            plainBytes: fileBytes.length,
            encryptedBytes: encryptedBytes.length,
        });

        return {
            ok: true,
            recipient_e2ee_public_key_used: ctx.recipientKey,
            media: {
                encryptedBlob: new Blob([encryptedBytes] as any, { type: 'application/octet-stream' }),
                uploadFileName,
                wrappedKey,
                recipient_e2ee_public_key_used: ctx.recipientKey,
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
    /** `base64(nonce || crypto_box(JSON{key,meta}))` — caption → message content. */
    wrappedKey: string;
    /** Recipient public key used to wrap this media key; persist for old own-media unwrap after key rotation. */
    recipient_e2ee_public_key_used: string;
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

/**
 * True when a media message carries E2EE-encrypted bytes (wrapped key in
 * `content`). Includes own (`is_from_me`) messages: crypto_box is
 * bidirectional, so the device that sent the file can unwrap its own media
 * key with the RECIPIENT's public key + its own private key (see
 * `resolveMediaUnwrapKey`).
 */
export function isEncryptedMediaMessage(msg: MessageEntry): boolean {
    return (
        isKnownPlatform &&
        msg.message_type !== 'text' &&
        isEncryptedContent(msg.content)
    );
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
 * Resolves the crypto_box public key needed to unwrap a media message's
 * wrapped key:
 * - incoming message → the sender's key carried on the payload; when the
 *   payload key is absent (local message rows do NOT persist
 *   `sender_e2ee_public_key`, e.g. history reloads after a page refresh) →
 *   the sender's registry key (chat row → other_user_id → registry →
 *   `get-e2ee-key` fallback);
 * - own message (`is_from_me`) → the RECIPIENT's key (registry →
 *   `get-e2ee-key` fallback): the wrapped key was sealed with
 *   (recipientPub, myPriv), and crypto_box derives the same shared secret
 *   from that exact pair on the sender's side.
 * Returns null when no usable key is available.
 */
export async function resolveMediaUnwrapKey(msg: MessageEntry): Promise<string | null> {
    if (msg.is_from_me) {
        const storedRecipientKey = (msg as any).recipient_e2ee_public_key_used;
        if (isValidPublicKeyB64(storedRecipientKey)) {
            return storedRecipientKey;
        }
        if (!msg.recipient_id) return null;
        return resolveRecipientPublicKey(msg.recipient_id);
    }
    if (isValidPublicKeyB64(msg.sender_e2ee_public_key)) {
        return msg.sender_e2ee_public_key as string;
    }
    // Payload key missing — resolve via the persistent registry (kept current
    // by the chat list / live ingress). Without this, media re-fed from local
    // rows (downloadMediaBatch after a refresh) could never be decrypted.
    const senderId = await resolveChatCounterpartUserId(msg.chat_id);
    if (!senderId) return null;
    const key = await resolveRecipientPublicKey(senderId);
    if (key) {
        e2eeLog(TAG, 'Media unwrap key: payload key missing — resolved via registry', {
            messageId: msg.message_id,
            senderId,
            key: keyFp(key),
        });
    }
    return key;
}

/**
 * Decrypts downloaded media bytes in memory: unwraps the symmetric key from
 * `msg.content` with the counterpart's public key (the sender's key for
 * incoming messages, the RECIPIENT's key for own messages — pass it via
 * `unwrapKeyB64`, usually from `resolveMediaUnwrapKey`), then opens the
 * secretbox. Throws on any failure — callers MUST treat that as a download
 * failure (no ACK on primary; the relay retains the file for retry).
 */
export function decryptIncomingMediaBytes(
    msg: MessageEntry,
    encryptedBytes: Uint8Array,
    unwrapKeyB64?: string | null,
): Uint8Array {
    const storedKey = msg.is_from_me
        ? (msg as any).recipient_e2ee_public_key_used
        : msg.sender_e2ee_public_key;
    const counterpartKey = unwrapKeyB64 !== undefined ? unwrapKeyB64 : storedKey;
    e2eeLog(TAG, 'Media download: decrypting in memory', {
        messageId: msg.message_id,
        encryptedBytes: encryptedBytes.length,
        ownMessage: !!msg.is_from_me,
        unwrapKey: keyFp(counterpartKey),
    });
    const myPrivateKey = getMyPrivateKey();
    if (!myPrivateKey) {
        throw new Error(`${TAG} cannot decrypt media — no local private key`);
    }
    if (!isValidPublicKeyB64(counterpartKey)) {
        throw new Error(`${TAG} cannot decrypt media — missing unwrap public key`);
    }
    if (!msg.content) {
        throw new Error(`${TAG} cannot decrypt media — missing wrapped key`);
    }
    const envelope = unwrapMediaEnvelope(msg.content, counterpartKey as string, myPrivateKey);
    applyMediaMetadata(msg, envelope.meta);
    const plainBytes = decryptMediaBytes(encryptedBytes, envelope.key);
    e2eeLog(TAG, 'Media download: DECRYPTED', {
        messageId: msg.message_id,
        fileName: envelope.meta.fileName,
        mimeType: envelope.meta.mimeType,
        plainBytes: plainBytes.length,
    });
    return plainBytes;
}
