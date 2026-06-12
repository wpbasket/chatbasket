/**
 * E2EE refresh self-heal + encrypted file metadata — regression tests
 *
 * Replays two REAL incidents found during two-user web testing:
 *
 * INCIDENT A — "empty bubble after refresh":
 *   Sender sent a text while the recipient was OFFLINE, then refreshed the
 *   page. The relay still held the message (undelivered), so the history load
 *   returned the sender's OWN message as ciphertext (`is_from_me: true`). The
 *   ingress processor blanked it to "" and the persist path wrote that over
 *   the locally stored plaintext — leaving an empty bubble with time + tick.
 *   FIX: the own-echo branch now restores the locally persisted plaintext row
 *   (`ChatStorage.getMessagesByIds`) and only blanks when no readable local
 *   copy exists. Chat-list previews get the same restore via last_message_id.
 *
 * INCIDENT B — "file message only offers a download":
 *   Encrypted uploads travel as `<name>.enc` + application/octet-stream, so
 *   even after decryption the stored/persisted MIME stayed octet-stream and
 *   browsers download instead of rendering. FIX: `.enc` normalization now
 *   derives the real MIME from the restored file extension.
 */

// ── Mocks ───────────────────────────────────────────────────────────────────

// Real libsodium (WASM build) behind the react-native-libsodium API surface.
// Like the real web build (Proxy-backed exports that are `undefined` until
// `ready` resolves), constants are exposed via lazy getters.
jest.mock('react-native-libsodium', () => {
    const sodium = require('libsodium-wrappers-sumo');
    return {
        __esModule: true,
        get ready() { return sodium.ready; },
        get base64_variants() { return sodium.base64_variants; },
        get crypto_box_NONCEBYTES() { return sodium.crypto_box_NONCEBYTES; },
        get crypto_secretbox_NONCEBYTES() { return sodium.crypto_secretbox_NONCEBYTES; },
        crypto_box_keypair: () => sodium.crypto_box_keypair(),
        crypto_box_easy: (m: any, n: any, pk: any, sk: any) => sodium.crypto_box_easy(m, n, pk, sk),
        crypto_box_open_easy: (c: any, n: any, pk: any, sk: any) => sodium.crypto_box_open_easy(c, n, pk, sk),
        crypto_secretbox_keygen: () => sodium.crypto_secretbox_keygen(),
        crypto_secretbox_easy: (m: any, n: any, k: any) => sodium.crypto_secretbox_easy(m, n, k),
        crypto_secretbox_open_easy: (c: any, n: any, k: any) => sodium.crypto_secretbox_open_easy(c, n, k),
        randombytes_buf: (len: number) => sodium.randombytes_buf(len),
        from_base64: (s: string, v?: number) => sodium.from_base64(s, v),
        from_string: (s: string) => sodium.from_string(s),
        to_base64: (b: any, v?: number) => sodium.to_base64(b, v),
        to_string: (b: any) => sodium.to_string(b),
    };
});

// Incidents happened on web — run the pipeline under Platform.OS === 'web'.
jest.mock('react-native', () => ({
    Platform: { OS: 'web' },
}));

// In-memory persistent key registry (user_keys store stand-in) + local
// message rows (the refresh self-heal source) behind the storage facade.
const mockRegistry = new Map<string, string | null>();
const mockLocalRows = new Map<string, { message_id: string; content: string | null; file_name?: string | null }>();
const mockGetMessagesByIds = jest.fn(async (ids: string[]) =>
    ids.map(id => mockLocalRows.get(id)).filter(Boolean),
);
// Local chat rows (chat_id → other_user_id source for the media unwrap-key
// fallback when the payload carries no sender key — INCIDENT D).
const mockLocalChats: any[] = [];
const mockGetChatById = jest.fn(async (chatId: string) =>
    mockLocalChats.find(c => c.chat_id === chatId) ?? null,
);
jest.mock('@/lib/storage/personalStorage/chat/chat.storage', () => ({
    __esModule: true,
    getUserE2eePublicKey: jest.fn(async (userId: string) =>
        mockRegistry.has(userId) ? mockRegistry.get(userId) : undefined,
    ),
    setUserE2eePublicKey: jest.fn(async (userId: string, key: string | null) => {
        mockRegistry.set(userId, key);
    }),
    clearAllUserE2eeKeys: jest.fn(async () => {
        mockRegistry.clear();
    }),
    getMessagesByIds: (...args: any[]) => (mockGetMessagesByIds as any)(...args),
    getChatById: (...args: any[]) => (mockGetChatById as any)(...args),
}));

// get-e2ee-key fallback endpoint (not exercised here, but the module imports it)
const mockGetE2EEKey = jest.fn();
jest.mock('@/lib/personalLib/profileApi/personal.api.profile', () => ({
    __esModule: true,
    PersonalProfileApi: {
        getE2EEKey: (...args: any[]) => mockGetE2EEKey(...args),
    },
}));

// Local identity (Alice's device) — controllable per test
const mockIdentity: { privateKey: string | null } = { privateKey: null };
jest.mock('@/lib/personalLib/e2ee/e2ee.keys', () => ({
    __esModule: true,
    isE2EEReady: jest.fn(() => mockIdentity.privateKey != null),
    getMyPrivateKey: jest.fn(() => mockIdentity.privateKey),
    whenKeyInitSettled: jest.fn(() => Promise.resolve()),
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import {
    E2EE_FAILED_TO_LOAD_TEXT,
    encryptMediaBytes,
    encryptText,
    generateIdentityKeypair,
    generateMediaKey,
    sodiumReady,
    wrapMediaEnvelope,
    type E2EEKeypairB64,
} from '@/lib/personalLib/e2ee/e2ee.crypto';
import {
    decryptIncomingMediaBytes,
    processIncomingChats,
    processIncomingMessages,
    resolveMediaUnwrapKey,
} from '@/lib/personalLib/e2ee/e2ee.service';
import type { ChatEntry, MessageEntry } from '@/lib/personalLib/models/personal.model.chat';

// ── Dummy data helpers ──────────────────────────────────────────────────────

const BOB_ID = 'bob-uuid-0002';

let alice: E2EEKeypairB64; // this device (sender in Incident A)
let bob: E2EEKeypairB64;   // remote user
let wrappedKey: string;    // realistic encrypted-media content envelope (key + metadata)

function makeMessage(overrides: Partial<MessageEntry> = {}): MessageEntry {
    return {
        message_id: `msg_${Math.random().toString(36).slice(2, 10)}`,
        chat_id: 'chat-1',
        content: 'Hello',
        message_type: 'text',
        is_from_me: false,
        status: 'delivered',
        created_at: new Date().toISOString(),
        sender_e2ee_public_key: bob.publicKey,
        ...overrides,
    } as MessageEntry;
}

function makeChat(overrides: Partial<ChatEntry> = {}): ChatEntry {
    return {
        chat_id: 'chat-1',
        other_user_id: BOB_ID,
        other_user_name: 'Bob',
        other_user_username: 'bob',
        avatar_url: null,
        avatar_file_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        other_user_last_read_at: new Date().toISOString(),
        other_user_last_delivered_at: new Date().toISOString(),
        last_message_content: null,
        last_message_created_at: new Date().toISOString(),
        last_message_type: 'text',
        last_message_is_from_me: false,
        last_message_status: 'sent',
        last_message_sender_id: null,
        last_message_id: null,
        unread_count: 0,
        other_user_e2ee_public_key: bob.publicKey,
        ...overrides,
    } as ChatEntry;
}

function wrapIncomingMediaMetadata(fileName: string, mimeType: string, size = 1234): string {
    return wrapMediaEnvelope(generateMediaKey(), { fileName, mimeType, size }, alice.publicKey, bob.privateKey);
}

beforeAll(async () => {
    await sodiumReady();
    alice = generateIdentityKeypair();
    bob = generateIdentityKeypair();
    wrappedKey = wrapMediaEnvelope(
        generateMediaKey(),
        { fileName: 'sunset.jpg', mimeType: 'image/jpeg', size: 1234 },
        bob.publicKey,
        alice.privateKey,
    );
});

beforeEach(() => {
    mockRegistry.clear();
    mockLocalRows.clear();
    mockLocalChats.length = 0;
    mockGetMessagesByIds.mockClear();
    mockGetChatById.mockClear();
    mockGetE2EEKey.mockReset();
    mockIdentity.privateKey = alice.privateKey;
});

// ── INCIDENT A — own-echo restore (messages) ────────────────────────────────

describe('processIncomingMessages — own encrypted echo restore (refresh self-heal)', () => {
    it('restores the locally persisted plaintext for an own encrypted echo (sender page refresh)', async () => {
        const wire = encryptText('refresh survives', bob.publicKey, alice.privateKey);
        const msg = makeMessage({ message_id: 'm-own-1', content: wire, is_from_me: true });
        mockLocalRows.set('m-own-1', { message_id: 'm-own-1', content: 'refresh survives' });

        await processIncomingMessages([msg]);

        expect(msg.content).toBe('refresh survives');
        expect(mockGetMessagesByIds).toHaveBeenCalledTimes(1);
        expect(mockGetMessagesByIds).toHaveBeenCalledWith(['m-own-1']);
    });

    it('restores even before this device has any keys (refresh race while keys load)', async () => {
        const wire = encryptText('early restore', bob.publicKey, alice.privateKey);
        mockIdentity.privateKey = null; // keys not loaded yet
        const msg = makeMessage({ message_id: 'm-own-2', content: wire, is_from_me: true });
        mockLocalRows.set('m-own-2', { message_id: 'm-own-2', content: 'early restore' });

        await processIncomingMessages([msg]);

        expect(msg.content).toBe('early restore');
    });

    it('blanks an own encrypted echo when no local row exists (other-device echo)', async () => {
        const wire = encryptText('not on this device', bob.publicKey, alice.privateKey);
        const msg = makeMessage({ message_id: 'm-own-3', content: wire, is_from_me: true });

        await processIncomingMessages([msg]);

        expect(msg.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('never resurrects ciphertext from the local row (cold-start incident artifact)', async () => {
        const wire = encryptText('current echo', bob.publicKey, alice.privateKey);
        const staleCipher = encryptText('older echo', bob.publicKey, alice.privateKey);
        const msg = makeMessage({ message_id: 'm-own-4', content: wire, is_from_me: true });
        mockLocalRows.set('m-own-4', { message_id: 'm-own-4', content: staleCipher });

        await processIncomingMessages([msg]);

        expect(msg.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('blanks when the local row content is empty', async () => {
        const wire = encryptText('blank local', bob.publicKey, alice.privateKey);
        const msg = makeMessage({ message_id: 'm-own-5', content: wire, is_from_me: true });
        mockLocalRows.set('m-own-5', { message_id: 'm-own-5', content: '' });

        await processIncomingMessages([msg]);

        expect(msg.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('degrades to blanking when the storage lookup throws', async () => {
        const wire = encryptText('lookup boom', bob.publicKey, alice.privateKey);
        const msg = makeMessage({ message_id: 'm-own-6', content: wire, is_from_me: true });
        mockLocalRows.set('m-own-6', { message_id: 'm-own-6', content: 'lookup boom' });
        mockGetMessagesByIds.mockRejectedValueOnce(new Error('db closed'));

        await processIncomingMessages([msg]);

        expect(msg.content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('batches a single lookup for all own echoes in the batch', async () => {
        const msgs = ['a', 'b', 'c'].map(suffix => {
            const id = `m-batch-${suffix}`;
            mockLocalRows.set(id, { message_id: id, content: `text ${suffix}` });
            return makeMessage({
                message_id: id,
                content: encryptText(`text ${suffix}`, bob.publicKey, alice.privateKey),
                is_from_me: true,
            });
        });
        // Mix in a normal incoming message — must not affect the own-echo lookup
        const incoming = makeMessage({
            content: encryptText('from bob', alice.publicKey, bob.privateKey),
        });

        await processIncomingMessages([...msgs, incoming]);

        expect(mockGetMessagesByIds).toHaveBeenCalledTimes(1);
        expect(mockGetMessagesByIds).toHaveBeenCalledWith(['m-batch-a', 'm-batch-b', 'm-batch-c']);
        expect(msgs.map(m => m.content)).toEqual(['text a', 'text b', 'text c']);
        expect(incoming.content).toBe('from bob');
    });

    it('skips the lookup entirely when the batch has no own encrypted echoes', async () => {
        const incoming = makeMessage({
            content: encryptText('plain flow', alice.publicKey, bob.privateKey),
        });
        const ownPlaintext = makeMessage({
            message_id: 'm-own-plain',
            content: 'already readable',
            is_from_me: true,
        });

        await processIncomingMessages([incoming, ownPlaintext]);

        expect(mockGetMessagesByIds).not.toHaveBeenCalled();
        expect(incoming.content).toBe('plain flow');
        expect(ownPlaintext.content).toBe('already readable');
    });
});

// ── INCIDENT A — own-preview restore (chat list) ────────────────────────────

describe('processIncomingChats — own encrypted preview restore', () => {
    it('restores the own preview from the locally persisted message row', async () => {
        const wire = encryptText('preview text', bob.publicKey, alice.privateKey);
        const chat = makeChat({
            last_message_content: wire,
            last_message_is_from_me: true,
            last_message_id: 'm-prev-1',
        });
        mockLocalRows.set('m-prev-1', { message_id: 'm-prev-1', content: 'preview text' });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe('preview text');
        expect(mockGetMessagesByIds).toHaveBeenCalledWith(['m-prev-1']);
    });

    it('blanks the own preview when no last_message_id is present', async () => {
        const wire = encryptText('no id preview', bob.publicKey, alice.privateKey);
        const chat = makeChat({
            last_message_content: wire,
            last_message_is_from_me: true,
            last_message_id: null,
        });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
        expect(mockGetMessagesByIds).not.toHaveBeenCalled();
    });

    it('blanks the own preview when the local row is missing', async () => {
        const wire = encryptText('gone preview', bob.publicKey, alice.privateKey);
        const chat = makeChat({
            last_message_content: wire,
            last_message_is_from_me: true,
            last_message_id: 'm-prev-2',
        });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('still decrypts an incoming (not own) encrypted preview', async () => {
        const wire = encryptText('yo from bob', alice.publicKey, bob.privateKey);
        const chat = makeChat({
            last_message_content: wire,
            last_message_is_from_me: false,
        });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe('yo from bob');
    });
});

// ── INCIDENT C — media preview restore (home screen, page refresh) ──────────
//
// Reported: after a page refresh, chats whose last message is a photo/file
// showed a BLANK preview (status icon only). The server-side preview content
// for an encrypted media message is the WRAPPED MEDIA KEY — cipher-looking,
// so the display guard masked it to "". The processor must restore the
// plaintext file name from the local message row (own AND incoming sides),
// mirroring the live-session preview the WS bridge stores via getPreviewText.

describe('processIncomingChats — media preview restore (refresh)', () => {
    it('restores the OWN media preview to the local file name', async () => {
        const chat = makeChat({
            last_message_content: wrappedKey,
            last_message_type: 'image',
            last_message_is_from_me: true,
            last_message_id: 'm-media-1',
        });
        mockLocalRows.set('m-media-1', { message_id: 'm-media-1', content: wrappedKey, file_name: 'sunset.jpg' });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe('sunset.jpg');
        expect(mockGetMessagesByIds).toHaveBeenCalledWith(['m-media-1']);
    });

    it('restores the INCOMING media preview to the ingress-normalized file name', async () => {
        const chat = makeChat({
            last_message_content: wrappedKey,
            last_message_type: 'file',
            last_message_is_from_me: false,
            last_message_id: 'm-media-2',
        });
        mockLocalRows.set('m-media-2', { message_id: 'm-media-2', content: wrappedKey, file_name: 'report.pdf' });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe('report.pdf');
    });

    it('uses encrypted media metadata when no readable local copy exists', async () => {
        const chat = makeChat({
            last_message_content: wrappedKey,
            last_message_type: 'video',
            last_message_is_from_me: false,
            last_message_id: 'm-media-3',
        });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe('sunset.jpg');
    });

    it('blanks the media preview when neither local copy nor metadata key exists', async () => {
        mockIdentity.privateKey = null;
        const chat = makeChat({
            last_message_content: wrappedKey,
            last_message_type: 'video',
            last_message_is_from_me: false,
            last_message_id: 'm-media-3b',
        });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe(E2EE_FAILED_TO_LOAD_TEXT);
    });

    it('leaves plaintext media previews (file names) untouched without a storage lookup', async () => {
        const chat = makeChat({
            last_message_content: 'holiday.png',
            last_message_type: 'image',
            last_message_is_from_me: true,
            last_message_id: 'm-media-4',
        });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe('holiday.png');
        expect(mockGetMessagesByIds).not.toHaveBeenCalled();
    });

    it('media restore works even while keys are still loading (refresh race)', async () => {
        mockIdentity.privateKey = null; // keys not loaded yet
        const chat = makeChat({
            last_message_content: wrappedKey,
            last_message_type: 'image',
            last_message_is_from_me: true,
            last_message_id: 'm-media-5',
        });
        mockLocalRows.set('m-media-5', { message_id: 'm-media-5', content: wrappedKey, file_name: 'early.jpg' });

        await processIncomingChats([chat]);

        expect(chat.last_message_content).toBe('early.jpg');
    });
});

// ── INCIDENT B — encrypted file metadata hydration ──────────────────────────

describe('processIncomingMessages — encrypted media metadata hydration', () => {
    it('hydrates application/pdf from encrypted content metadata', async () => {
        const msg = makeMessage({
            message_type: 'file',
            file_name: 'opaque.enc',
            file_mime_type: 'application/octet-stream',
            content: wrapIncomingMediaMetadata('report.pdf', 'application/pdf', 4567),
        });

        await processIncomingMessages([msg]);

        expect(msg.file_name).toBe('report.pdf');
        expect(msg.file_mime_type).toBe('application/pdf');
        expect(msg.file_size).toBe(4567);
    });

    it('hydrates image/png from encrypted content metadata', async () => {
        const msg = makeMessage({
            message_type: 'image',
            file_name: 'opaque.enc',
            file_mime_type: 'application/octet-stream',
            content: wrapIncomingMediaMetadata('photo.png', 'image/png'),
        });

        await processIncomingMessages([msg]);

        expect(msg.file_name).toBe('photo.png');
        expect(msg.file_mime_type).toBe('image/png');
    });

    it('uses the encrypted MIME exactly even for unknown extensions', async () => {
        const msg = makeMessage({
            message_type: 'file',
            file_name: 'opaque.enc',
            file_mime_type: 'application/octet-stream',
            content: wrapIncomingMediaMetadata('data.zzznotreal', 'application/x-custom'),
        });

        await processIncomingMessages([msg]);

        expect(msg.file_name).toBe('data.zzznotreal');
        expect(msg.file_mime_type).toBe('application/x-custom');
    });

    it('encrypted metadata overrides server-visible opaque fields', async () => {
        const msg = makeMessage({
            message_type: 'file',
            file_name: 'server-opaque.enc',
            file_mime_type: 'application/octet-stream',
            content: wrapIncomingMediaMetadata('notes.txt', 'text/plain'),
        });

        await processIncomingMessages([msg]);

        expect(msg.file_name).toBe('notes.txt');
        expect(msg.file_mime_type).toBe('text/plain');
    });
});


// ── INCIDENT D — media unwrap-key fallback (history reload, no payload key) ─
//
// Reported: after a page refresh, one attachment failed to download with
// "[E2EE] cannot decrypt media — missing unwrap public key" while the SAME
// file decrypted fine moments later via a server-fed path. Local message rows
// do NOT persist `sender_e2ee_public_key`, so media re-fed from local storage
// (history load → downloadMediaBatch → downloadForWeb/Native) reached the
// resolver without a payload key and it gave up. The resolver must fall back
// to the sender's registry key via the local chat row's `other_user_id`
// (registry → `get-e2ee-key`).

describe('resolveMediaUnwrapKey — registry fallback when the payload key is missing (refresh)', () => {
    it('prefers the payload sender key without any storage lookup', async () => {
        const msg = makeMessage({ message_type: 'image', content: wrappedKey });

        expect(await resolveMediaUnwrapKey(msg)).toBe(bob.publicKey);
        expect(mockGetChatById).not.toHaveBeenCalled();
    });

    it('resolves via chat row → registry when the payload key is missing (local-row reload)', async () => {
        mockLocalChats.push(makeChat());
        mockRegistry.set(BOB_ID, bob.publicKey);
        const msg = makeMessage({ message_type: 'image', content: wrappedKey, sender_e2ee_public_key: undefined });

        expect(await resolveMediaUnwrapKey(msg)).toBe(bob.publicKey);
        expect(mockGetE2EEKey).not.toHaveBeenCalled();
    });

    it('decrypts the media bytes end-to-end with the fallback-resolved key', async () => {
        // Bob → Alice envelope; the reloaded local row carries no payload key.
        const fileBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const mediaKey = generateMediaKey();
        const encryptedBytes = encryptMediaBytes(fileBytes, mediaKey);
        const wrapped = wrapMediaEnvelope(
            mediaKey,
            { fileName: 'report.pdf', mimeType: 'application/pdf', size: fileBytes.length },
            alice.publicKey,
            bob.privateKey,
        );
        mockLocalChats.push(makeChat());
        mockRegistry.set(BOB_ID, bob.publicKey);
        const msg = makeMessage({ message_type: 'file', content: wrapped, sender_e2ee_public_key: undefined });

        const unwrapKey = await resolveMediaUnwrapKey(msg);
        expect(decryptIncomingMediaBytes(msg, encryptedBytes, unwrapKey)).toEqual(fileBytes);
    });

    it('falls through to the get-e2ee-key endpoint on a registry miss (result persisted)', async () => {
        mockLocalChats.push(makeChat());
        mockGetE2EEKey.mockResolvedValueOnce({ e2ee_public_key: bob.publicKey });
        const msg = makeMessage({ message_type: 'video', content: wrappedKey, sender_e2ee_public_key: undefined });

        expect(await resolveMediaUnwrapKey(msg)).toBe(bob.publicKey);
        expect(mockGetE2EEKey).toHaveBeenCalledWith(BOB_ID);
        expect(mockRegistry.get(BOB_ID)).toBe(bob.publicKey);
    });

    it('returns null when no local chat row matches (never throws)', async () => {
        mockGetE2EEKey.mockResolvedValue({ e2ee_public_key: bob.publicKey });
        const msg = makeMessage({ message_type: 'image', content: wrappedKey, sender_e2ee_public_key: undefined });

        expect(await resolveMediaUnwrapKey(msg)).toBeNull();
        expect(mockGetE2EEKey).not.toHaveBeenCalled();
    });

    it('degrades to null when the chat lookup throws (defensive)', async () => {
        mockGetChatById.mockRejectedValueOnce(new Error('db closed'));
        const msg = makeMessage({ message_type: 'image', content: wrappedKey, sender_e2ee_public_key: undefined });

        expect(await resolveMediaUnwrapKey(msg)).toBeNull();
    });
});
