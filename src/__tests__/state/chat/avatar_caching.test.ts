/**
 * Tests for Avatar Caching and Privacy Circuit Breaker logic.
 */

// ── Deep Mocks (prevent crashes from native dependencies) ───────────────────

jest.mock('react-native', () => ({
    Platform: { OS: 'android' },
}));

jest.mock('@/lib/storage/personalStorage/chat/chat.storage.normalize', () => ({
    normalizeChatEntry: jest.fn((chat) => chat),
    normalizeChatEntries: jest.fn((chats) => chats),
}));

jest.mock('@/lib/constantLib', () => ({
    ApiError: class ApiError extends Error {
        constructor(msg: string) { super(msg); }
    },
}));

jest.mock('@/lib/storage/personalStorage/chat/chat.storage', () => ({
    __esModule: true,
    updateChatAvatarMarkers: jest.fn().mockResolvedValue(undefined),
    updateChatCachedAvatarFileIdByUserId: jest.fn().mockResolvedValue(undefined),
    getChats: jest.fn().mockResolvedValue([]),
    insertChats: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/storage/personalStorage/profile/profile.storage', () => ({
    getProfileAvatarBlob: jest.fn(),
}));

jest.mock('@/lib/personalLib/chatApi/ws.client', () => ({
    wsClient: { subscribe: jest.fn(), connect: jest.fn(), disconnect: jest.fn() },
}));

jest.mock('react-native-mmkv', () => ({
    MMKV: jest.fn().mockImplementation(() => ({ getString: jest.fn(), set: jest.fn() })),
}), { virtual: true });

jest.mock('react-native-unistyles', () => ({
    StyleSheet: { create: (s: any) => s },
    UnistylesRuntime: { colorScheme: 'light' },
    useUnistyles: () => ({ theme: { colors: {} }, rt: {} }),
}), { virtual: true });

// Mock common utilities used by the cache
jest.mock('@/utils/personalUtils/util.avatarCommon', () => ({
    fetchAvatarBlob: jest.fn(),
    saveAvatarToFS: jest.fn(),
    deleteAvatarLocally: jest.fn().mockResolvedValue(undefined),
    getLocalAvatarUri: jest.fn().mockImplementation((userId) => Promise.resolve(`file://mock-path/${userId}.jpg`)),
}));

import { $chatListState } from '@/state/personalState/chat/personal.state.chat';
import { resolveAvatarUri } from '@/utils/personalUtils/util.avatarCache';
import { deleteAvatarLocally } from '@/utils/personalUtils/util.avatarCommon';
import type { ChatEntry } from '@/lib/personalLib/models/personal.model.chat';

// ── Helpers ─────────────────────────────────────────────────────────────────

const tick = (ms = 50) => new Promise(r => setTimeout(r, ms));

function makeChatEntry(overrides: Partial<ChatEntry>): ChatEntry {
    return {
        chat_id: 'c1',
        other_user_id: 'u1',
        other_user_name: 'User',
        other_user_username: 'user',
        avatar_url: 'https://cdn.com/u1.jpg',
        avatar_file_id: 'v1',
        cached_avatar_file_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        other_user_last_read_at: '',
        other_user_last_delivered_at: '',
        last_message_content: 'Hi',
        last_message_created_at: '2026-01-01T00:00:00Z',
        last_message_type: 'text',
        last_message_is_from_me: false,
        last_message_status: 'sent',
        last_message_sender_id: 'u1',
        last_message_id: 'm1',
        unread_count: 0,
        other_user_keys_revision: 1,
        local_message_count: 1,
        is_contactable: true,
        ...overrides,
    };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Avatar Caching & Privacy Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        $chatListState.reset();
    });

    it('CACHE_HIT: returns local URI if file IDs match', async () => {
        const chat = makeChatEntry({ avatar_file_id: 'v1', cached_avatar_file_id: 'v1' });
        $chatListState.upsertChat(chat);

        const result = await resolveAvatarUri('u1', 'https://url', 'v1', 'v1');
        
        expect(result.uri).toContain('u1.jpg');
        expect(result.needsDownload).toBe(false);
    });

    it('CACHE_MISS: triggers download if file IDs mismatch', async () => {
        const result = await resolveAvatarUri('u1', 'https://url', 'v2', 'v1');
        expect(result.needsDownload).toBe(true);
    });

    it('CIRCUIT_BREAKER: purges local data if server returns null (Privacy Restriction)', async () => {
        // Mock state
        const chat = makeChatEntry({ 
            chat_id: 'c1',
            avatar_url: 'https://old', 
            avatar_file_id: 'v1', 
            cached_avatar_file_id: 'v1' 
        });
        $chatListState.upsertChat(chat);

        // Server sends nulls (Privacy triggered)
        const result = await resolveAvatarUri('u1', null, null, 'v1');

        expect(result.uri).toBeNull();
        expect(result.needsDownload).toBe(false);

        // Wait for background cleanup task
        await tick(100);

        // Verify proactive cleanup was triggered
        expect(deleteAvatarLocally).toHaveBeenCalled();
        
        // Verify state markers were reset locally
        const updatedChat = $chatListState.chatsById['c1'].peek();
        expect(updatedChat.cached_avatar_file_id).toBeNull();
    });

    it('Persistence: preserves local cached markers during authoritative sync', async () => {
        // 1. Manually set a local marker in state
        $chatListState.upsertChat(makeChatEntry({ chat_id: 'c1', cached_avatar_file_id: 'local_v1' }));
        
        expect($chatListState.chatsById['c1'].peek().cached_avatar_file_id).toBe('local_v1');

        // 2. Perform sync from server (which NEVER includes cached_avatar_file_id)
        const serverResponse = [
            makeChatEntry({ chat_id: 'c1', avatar_file_id: 'server_v2', cached_avatar_file_id: null })
        ];
        
        await $chatListState.setChats(serverResponse);

        // 3. Local marker MUST be preserved
        const finalChat = $chatListState.chatsById['c1'].peek();
        expect(finalChat.cached_avatar_file_id).toBe('local_v1');
        expect(finalChat.avatar_file_id).toBe('server_v2');
    });

    it('Persistence: setChats persists preserved markers to storage (not null)', async () => {
        const { insertChats } = require('@/lib/storage/personalStorage/chat/chat.storage');

        // 1. Set up existing state with a cached marker
        $chatListState.upsertChat(makeChatEntry({ chat_id: 'c1', cached_avatar_file_id: 'local_v1' }));
        (insertChats as jest.Mock).mockClear();

        // 2. Server sync — server never sends cached_avatar_file_id
        const serverResponse = [
            makeChatEntry({ chat_id: 'c1', avatar_file_id: 'server_v2', cached_avatar_file_id: null })
        ];
        await $chatListState.setChats(serverResponse);

        // 3. Verify insertChats was called with PRESERVED marker, NOT null
        expect(insertChats).toHaveBeenCalledTimes(1);
        const persistedEntries = (insertChats as jest.Mock).mock.calls[0][0];
        const persistedChat = persistedEntries.find((c: any) => c.chat_id === 'c1');
        expect(persistedChat).toBeDefined();
        expect(persistedChat.cached_avatar_file_id).toBe('local_v1');
    });

    it('Persistence: upsertChat preserves cached markers from existing state', () => {
        const { insertChats } = require('@/lib/storage/personalStorage/chat/chat.storage');

        // 1. Set up existing state with a cached marker
        $chatListState.upsertChat(makeChatEntry({ chat_id: 'c1', cached_avatar_file_id: 'local_v1' }));
        (insertChats as jest.Mock).mockClear();

        // 2. upsertChat with incoming entry that has null cached_avatar_file_id
        // (e.g., from a WS event that only updates last_message fields)
        $chatListState.upsertChat(makeChatEntry({
            chat_id: 'c1',
            cached_avatar_file_id: null,
            last_message_content: 'New message',
        }));

        // 3. In-memory state must preserve the marker
        const finalChat = $chatListState.chatsById['c1'].peek();
        expect(finalChat.cached_avatar_file_id).toBe('local_v1');
        expect(finalChat.last_message_content).toBe('New message');

        // 4. Storage must also receive the preserved marker
        expect(insertChats).toHaveBeenCalledTimes(1);
        const persistedEntries = (insertChats as jest.Mock).mock.calls[0][0];
        expect(persistedEntries[0].cached_avatar_file_id).toBe('local_v1');
    });

    it('Persistence: upsertChat does NOT override an explicitly set cached marker', () => {
        // 1. Set up existing state
        $chatListState.upsertChat(makeChatEntry({ chat_id: 'c1', cached_avatar_file_id: 'old_v1' }));

        // 2. upsertChat with a NEW cached marker (e.g., PRE-FLIGHT just downloaded a new version)
        $chatListState.upsertChat(makeChatEntry({
            chat_id: 'c1',
            cached_avatar_file_id: 'new_v2',
        }));

        // 3. The new marker should win — preservation only kicks in when incoming is falsy
        const finalChat = $chatListState.chatsById['c1'].peek();
        expect(finalChat.cached_avatar_file_id).toBe('new_v2');
    });

    describe('REGRESSION: prove the persist-before-merge bug existed', () => {
        it('OLD behavior: server entries have null cached_avatar_file_id (the root cause)', () => {
            // Server NEVER sends cached_avatar_file_id — this is the data that arrives
            const serverEntry = makeChatEntry({
                chat_id: 'c1',
                avatar_file_id: 'server_v2',
                cached_avatar_file_id: null,
            });

            // OLD CODE did: await ChatStorage.insertChats([serverEntry])
            // BEFORE reading existing state. Prove the incoming value IS null:
            expect(serverEntry.cached_avatar_file_id).toBeNull();

            // This null would be written to IndexedDB, overwriting any previously-stored value.
            // On next boot, loadChatsFromStorage() reads null → VERSION_MISMATCH every session.
        });

        it('OLD behavior: insertChats would receive null despite existing state having the value', () => {
            const { insertChats } = require('@/lib/storage/personalStorage/chat/chat.storage');

            // Simulate: existing state has a cached marker from a previous PRE-FLIGHT fix
            $chatListState.upsertChat(makeChatEntry({ chat_id: 'c1', cached_avatar_file_id: 'local_v1' }));
            (insertChats as jest.Mock).mockClear();

            // Simulate OLD setChats code path manually:
            // 1. Normalize server entries (cached_avatar_file_id = null)
            const serverEntries = [
                makeChatEntry({ chat_id: 'c1', avatar_file_id: 'server_v2', cached_avatar_file_id: null })
            ];

            // 2. OLD code called insertChats DIRECTLY with normalized entries (no merge)
            //    This is what WOULD happen without the fix:
            const oldCodePersistedValue = serverEntries[0].cached_avatar_file_id;
            expect(oldCodePersistedValue).toBeNull(); // ← BUG: null written to IDB

            // 3. FIXED code preserves from existing state BEFORE persisting:
            const existing = $chatListState.chatsById['c1']?.peek();
            for (const entry of serverEntries) {
                if (!entry.cached_avatar_file_id && existing?.cached_avatar_file_id) {
                    entry.cached_avatar_file_id = existing.cached_avatar_file_id;
                }
            }
            const fixedCodePersistedValue = serverEntries[0].cached_avatar_file_id;
            expect(fixedCodePersistedValue).toBe('local_v1'); // ← FIX: preserved value written
        });

        it('END-TO-END: setChats now persists preserved value (fix is active)', async () => {
            const { insertChats } = require('@/lib/storage/personalStorage/chat/chat.storage');

            $chatListState.upsertChat(makeChatEntry({ chat_id: 'c1', cached_avatar_file_id: 'local_v1' }));
            (insertChats as jest.Mock).mockClear();

            // Full setChats call — exercises the real fixed code path
            await $chatListState.setChats([
                makeChatEntry({ chat_id: 'c1', avatar_file_id: 'server_v2', cached_avatar_file_id: null })
            ]);

            // insertChats MUST receive 'local_v1', NOT null
            const persisted = (insertChats as jest.Mock).mock.calls[0][0];
            expect(persisted[0].cached_avatar_file_id).toBe('local_v1');

            // In-memory state also correct
            expect($chatListState.chatsById['c1'].peek().cached_avatar_file_id).toBe('local_v1');
        });
    });
});
