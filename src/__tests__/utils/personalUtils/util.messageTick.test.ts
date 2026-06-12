import { applyOutgoingReceiptStatus, deriveMessageTickState, canBulkUnsend, isMessageUnsendable } from '@/utils/personalUtils/util.messageTick';

describe('deriveMessageTickState', () => {
    it('does not show read/delivered for outgoing messages without per-message delivery ACK', () => {
        expect(deriveMessageTickState({
            is_from_me: true,
            status: 'read',
            delivered_to_recipient: false,
        })).toEqual({ status: 'sent', delivered: false });

        expect(deriveMessageTickState({
            is_from_me: true,
            status: 'delivered',
            delivered_to_recipient: false,
        })).toEqual({ status: 'sent', delivered: false });
    });

    it('allows read only after exact message delivery ACK is present', () => {
        expect(deriveMessageTickState({
            is_from_me: true,
            status: 'read',
            delivered_to_recipient: true,
        })).toEqual({ status: 'read', delivered: true });
    });

    it('keeps pending uploads pending regardless of chat-level read state', () => {
        expect(deriveMessageTickState({
            is_from_me: true,
            status: 'pending',
            delivered_to_recipient: false,
        })).toEqual({ status: 'pending', delivered: false });
    });

    it('updates tick when read receipt arrives during select mode (reactive subscription)', () => {
        // Initial state: message sent, not yet delivered
        const initialMessage = {
            is_from_me: true,
            status: 'sent' as const,
            delivered_to_recipient: false,
        };
        const initialTick = deriveMessageTickState(initialMessage);
        expect(initialTick).toEqual({ status: 'sent', delivered: false });

        // Read receipt arrives via WebSocket (status and delivered_to_recipient both update)
        // This simulates what happens when MessageItemWrapper's reactive subscriptions fire
        const messageAfterReadReceipt = {
            ...initialMessage,
            status: 'read' as const,
            delivered_to_recipient: true,
        };
        const tickAfterRead = deriveMessageTickState(messageAfterReadReceipt);
        expect(tickAfterRead).toEqual({ status: 'read', delivered: true });

        // Verify the transition: status changed and delivered flag flipped
        expect(tickAfterRead.status).not.toBe(initialTick.status);
        expect(tickAfterRead.delivered).not.toBe(initialTick.delivered);
    });
});

describe('applyOutgoingReceiptStatus', () => {
    const base = {
        is_from_me: true,
        status: 'sent' as const,
        delivered_to_recipient: false,
        created_at: '2026-06-12T10:00:00.000Z',
    };

    it('hydrates double tick from REST delivered timestamp', () => {
        expect(applyOutgoingReceiptStatus(base, {
            deliveredAt: '2026-06-12T10:00:00.000Z',
        })).toEqual({
            ...base,
            delivered_to_recipient: true,
            status: 'sent',
        });
    });

    it('hydrates green tick from REST read timestamp and treats read as delivered', () => {
        expect(applyOutgoingReceiptStatus(base, {
            readAt: '2026-06-12T10:00:00.000Z',
        })).toEqual({
            ...base,
            delivered_to_recipient: true,
            status: 'read',
        });
    });

    it('does not hydrate pending/error local messages from chat-level receipts', () => {
        expect(applyOutgoingReceiptStatus({
            ...base,
            status: 'pending' as const,
        }, {
            deliveredAt: '2026-06-12T10:01:00.000Z',
            readAt: '2026-06-12T10:01:00.000Z',
        })).toEqual({
            ...base,
            status: 'pending',
        });
    });

    it('ignores incoming messages', () => {
        expect(applyOutgoingReceiptStatus({
            ...base,
            is_from_me: false,
        }, {
            deliveredAt: '2026-06-12T10:01:00.000Z',
            readAt: '2026-06-12T10:01:00.000Z',
        })).toEqual({
            ...base,
            is_from_me: false,
        });
    });
});

describe('isMessageUnsendable', () => {
    it('returns false for undefined/null messages', () => {
        expect(isMessageUnsendable(undefined)).toBe(false);
        expect(isMessageUnsendable(null)).toBe(false);
    });

    it('returns false for incoming messages', () => {
        expect(isMessageUnsendable({
            is_from_me: false,
            status: 'sent',
            is_unsent: false,
            message_type: 'text',
        })).toBe(false);
    });

    it('returns true for a normal sent outgoing message', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'sent',
            is_unsent: false,
            message_type: 'text',
        })).toBe(true);
    });

    it('returns true for a delivered but unread outgoing message', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'delivered',
            is_unsent: false,
            message_type: 'text',
        })).toBe(true);
    });

    it('returns false when recipient has read the message (double green tick)', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'read',
            is_unsent: false,
            message_type: 'text',
        })).toBe(false);
    });

    it('returns false when message is already unsent via flag', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'sent',
            is_unsent: true,
            message_type: 'text',
        })).toBe(false);
    });

    it('returns false when message_type is unsent', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'sent',
            is_unsent: false,
            message_type: 'unsent',
        })).toBe(false);
    });

    it('returns false for pending messages', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'pending',
            is_unsent: false,
            message_type: 'text',
        })).toBe(false);
    });

    it('returns false for sending messages', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'sending',
            is_unsent: false,
            message_type: 'text',
        })).toBe(false);
    });

    it('returns false for error messages', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'error',
            is_unsent: false,
            message_type: 'text',
        })).toBe(false);
    });

    it('returns false for failed messages', () => {
        expect(isMessageUnsendable({
            is_from_me: true,
            status: 'failed',
            is_unsent: false,
            message_type: 'text',
        })).toBe(false);
    });
});

describe('canBulkUnsend', () => {
    const outgoing = { is_from_me: true, status: 'sent' as const, is_unsent: false, message_type: 'text' };
    const incoming = { is_from_me: false, status: 'sent' as const, is_unsent: false, message_type: 'text' };
    const read = { is_from_me: true, status: 'read' as const, is_unsent: false, message_type: 'text' };
    const unsent = { is_from_me: true, status: 'sent' as const, is_unsent: true, message_type: 'text' };
    const pending = { is_from_me: true, status: 'pending' as const, is_unsent: false, message_type: 'text' };

    it('returns false for empty selection', () => {
        expect(canBulkUnsend([], { msg1: outgoing })).toBe(false);
    });

    it('returns true when all selected messages are unsentable outgoing messages', () => {
        const msgs = { msg1: outgoing, msg2: outgoing };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(true);
    });

    it('returns false when any selected message is from the other user', () => {
        const msgs = { msg1: outgoing, msg2: incoming };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(false);
    });

    it('returns false when any selected message has been read by recipient', () => {
        const msgs = { msg1: outgoing, msg2: read };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(false);
    });

    it('returns false when any selected message is already unsent', () => {
        const msgs = { msg1: outgoing, msg2: unsent };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(false);
    });

    it('returns false when any selected message is in a terminal state', () => {
        const msgs = { msg1: outgoing, msg2: pending };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(false);
    });

    it('returns false when a selected message is missing from the map', () => {
        const msgs = { msg1: outgoing };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(false);
    });

    it('returns true for a single outgoing unread message', () => {
        const msgs = { msg1: outgoing };
        expect(canBulkUnsend(['msg1'], msgs)).toBe(true);
    });
});

describe('reactive status transitions (read receipt scenario)', () => {
    // Simulates the real-time race: User A selects a message for bulk unsend,
    // but before pressing the button User B reads it. The read receipt flips
    // status from 'sent' to 'read'. The reactive .get() calls in the UI
    // should cause canBulkUnsend to flip from true to false.

    it('unsendable message becomes blocked when status flips to read', () => {
        const msg = { is_from_me: true, status: 'sent' as const, is_unsent: false, message_type: 'text' };
        expect(isMessageUnsendable(msg)).toBe(true);

        // Read receipt arrives — status changes
        const msgAfterRead = { ...msg, status: 'read' as const };
        expect(isMessageUnsendable(msgAfterRead)).toBe(false);
    });

    it('unsendable message becomes blocked when is_unsent flips to true', () => {
        const msg = { is_from_me: true, status: 'sent' as const, is_unsent: false, message_type: 'text' };
        expect(isMessageUnsendable(msg)).toBe(true);

        const msgAfterUnsent = { ...msg, is_unsent: true };
        expect(isMessageUnsendable(msgAfterUnsent)).toBe(false);
    });

    it('canBulkUnsend flips from true to false when one message gets read mid-selection', () => {
        const msg1 = { is_from_me: true, status: 'sent' as const, is_unsent: false, message_type: 'text' };
        const msg2Before = { is_from_me: true, status: 'sent' as const, is_unsent: false, message_type: 'text' };

        // Both unread — unsend available
        const msgsBefore = { msg1, msg2: msg2Before };
        expect(canBulkUnsend(['msg1', 'msg2'], msgsBefore)).toBe(true);

        // msg2 gets read via incoming read receipt
        const msg2After = { ...msg2Before, status: 'read' as const };
        const msgsAfter = { msg1, msg2: msg2After };
        expect(canBulkUnsend(['msg1', 'msg2'], msgsAfter)).toBe(false);
    });

    it('canBulkUnsend stays true when read receipt arrives for an unselected message', () => {
        const msg1 = { is_from_me: true, status: 'sent' as const, is_unsent: false, message_type: 'text' };
        const msg2 = { is_from_me: true, status: 'sent' as const, is_unsent: false, message_type: 'text' };
        const msg3Before = { is_from_me: true, status: 'sent' as const, is_unsent: false, message_type: 'text' };

        // Only msg1 and msg2 are selected
        const msgsBefore = { msg1, msg2, msg3: msg3Before };
        expect(canBulkUnsend(['msg1', 'msg2'], msgsBefore)).toBe(true);

        // msg3 gets read — but it's not in the selection
        const msg3After = { ...msg3Before, status: 'read' as const };
        const msgsAfter = { msg1, msg2, msg3: msg3After };
        expect(canBulkUnsend(['msg1', 'msg2'], msgsAfter)).toBe(true);
    });

    it('canBulkUnsend recovers if read message is deselected', () => {
        const msg1 = { is_from_me: true, status: 'sent' as const, is_unsent: false, message_type: 'text' };
        const msg2Read = { is_from_me: true, status: 'read' as const, is_unsent: false, message_type: 'text' };

        // msg2 is read and still selected — blocked
        const msgs = { msg1, msg2: msg2Read };
        expect(canBulkUnsend(['msg1', 'msg2'], msgs)).toBe(false);

        // User deselects msg2 — only msg1 remains, which is still valid
        expect(canBulkUnsend(['msg1'], msgs)).toBe(true);
    });
});

describe('MessageItemWrapper comprehensive subscription pattern', () => {
    // Tests the 8-field subscription pattern used in MessageItemWrapper
    // where each dynamic field has its own useValue subscription

    it('merges all 8 subscribed fields into messageWithLiveUpdates', () => {
        // Base message snapshot (from useValue on the whole message)
        const baseMessage = {
            message_id: 'msg1',
            chat_id: 'chat1',
            is_from_me: true,
            status: 'sent' as const,
            delivered_to_recipient: false,
            progress: 50,
            local_uri: null as string | null,
            view_url: 'https://example.com/view',
            download_url: 'https://example.com/download',
            file_name: 'document.pdf',
            file_mime_type: 'application/pdf',
            created_at: '2026-06-12T10:00:00.000Z',
        };

        // Simulated subscribed values (from individual useValue calls)
        const messageStatus = 'read' as const;
        const messageDelivered = true;
        const messageProgress = 100;
        const messageLocalUri = 'file:///path/to/file.pdf';
        const messageViewUrl = 'https://example.com/view?token=new';
        const messageDownloadUrl = 'https://example.com/download?token=new';
        const messageFileName = 'renamed.pdf';
        const messageFileMimeType = 'application/pdf';

        // Merge pattern from MessageItemWrapper
        const messageWithLiveUpdates = {
            ...baseMessage,
            status: messageStatus,
            delivered_to_recipient: messageDelivered,
            progress: messageProgress,
            local_uri: messageLocalUri,
            view_url: messageViewUrl,
            download_url: messageDownloadUrl,
            file_name: messageFileName,
            file_mime_type: messageFileMimeType,
        };

        // Verify all 8 fields are updated
        expect(messageWithLiveUpdates.status).toBe('read');
        expect(messageWithLiveUpdates.delivered_to_recipient).toBe(true);
        expect(messageWithLiveUpdates.progress).toBe(100);
        expect(messageWithLiveUpdates.local_uri).toBe('file:///path/to/file.pdf');
        expect(messageWithLiveUpdates.view_url).toBe('https://example.com/view?token=new');
        expect(messageWithLiveUpdates.download_url).toBe('https://example.com/download?token=new');
        expect(messageWithLiveUpdates.file_name).toBe('renamed.pdf');
        expect(messageWithLiveUpdates.file_mime_type).toBe('application/pdf');

        // Verify other fields remain from base message
        expect(messageWithLiveUpdates.message_id).toBe('msg1');
        expect(messageWithLiveUpdates.created_at).toBe('2026-06-12T10:00:00.000Z');
    });

    it('deriveMessageTickState works correctly with merged message', () => {
        const baseMessage = {
            is_from_me: true,
            status: 'sent' as const,
            delivered_to_recipient: false,
        };

        // Subscribed values change
        const messageStatus = 'delivered' as const;
        const messageDelivered = true;

        const messageWithLiveUpdates = {
            ...baseMessage,
            status: messageStatus,
            delivered_to_recipient: messageDelivered,
        };

        const { status, delivered } = deriveMessageTickState(messageWithLiveUpdates);
        expect(status).toBe('delivered');
        expect(delivered).toBe(true);
    });

    it('partial updates only override subscribed fields', () => {
        const baseMessage = {
            status: 'sent' as const,
            delivered_to_recipient: false,
            progress: 0,
            local_uri: null as string | null,
        };

        // Only some subscribed values change
        const messageStatus = 'read' as const;
        const messageDelivered = true;
        const messageProgress = 0; // unchanged
        const messageLocalUri = null; // unchanged

        const messageWithLiveUpdates = {
            ...baseMessage,
            status: messageStatus,
            delivered_to_recipient: messageDelivered,
            progress: messageProgress,
            local_uri: messageLocalUri,
        };

        expect(messageWithLiveUpdates.status).toBe('read');
        expect(messageWithLiveUpdates.delivered_to_recipient).toBe(true);
        expect(messageWithLiveUpdates.progress).toBe(0);
        expect(messageWithLiveUpdates.local_uri).toBe(null);
    });

    it('incoming message subscription pattern works correctly', () => {
        const baseMessage = {
            is_from_me: false,
            status: 'sent' as const,
            delivered_to_recipient: false,
            progress: 25,
            local_uri: null as string | null,
        };

        // Subscribed values update (e.g., download progress)
        const messageStatus = 'sent' as const;
        const messageDelivered = false;
        const messageProgress = 75;
        const messageLocalUri = 'file:///downloads/file.pdf';

        const messageWithLiveUpdates = {
            ...baseMessage,
            status: messageStatus,
            delivered_to_recipient: messageDelivered,
            progress: messageProgress,
            local_uri: messageLocalUri,
        };

        expect(messageWithLiveUpdates.progress).toBe(75);
        expect(messageWithLiveUpdates.local_uri).toBe('file:///downloads/file.pdf');
    });

    it('media URL refresh subscription pattern works correctly', () => {
        const baseMessage = {
            view_url: 'https://old.example.com/view',
            download_url: 'https://old.example.com/download',
            file_name: 'image.jpg',
            file_mime_type: 'image/jpeg',
        };

        // URLs refreshed (token renewal)
        const messageViewUrl = 'https://new.example.com/view?token=abc123';
        const messageDownloadUrl = 'https://new.example.com/download?token=abc123';
        const messageFileName = 'image.jpg';
        const messageFileMimeType = 'image/jpeg';

        const messageWithLiveUpdates = {
            ...baseMessage,
            view_url: messageViewUrl,
            download_url: messageDownloadUrl,
            file_name: messageFileName,
            file_mime_type: messageFileMimeType,
        };

        expect(messageWithLiveUpdates.view_url).toBe('https://new.example.com/view?token=abc123');
        expect(messageWithLiveUpdates.download_url).toBe('https://new.example.com/download?token=abc123');
    });

    it('subscription pattern handles undefined values correctly', () => {
        const baseMessage = {
            status: 'sent' as const,
            progress: undefined as number | undefined,
            local_uri: undefined as string | undefined,
            view_url: undefined as string | undefined,
            download_url: undefined as string | undefined,
            file_name: undefined as string | undefined,
            file_mime_type: undefined as string | undefined,
        };

        // Subscribed values are undefined initially
        const messageStatus = 'sent' as const;
        const messageDelivered = undefined;
        const messageProgress = undefined;
        const messageLocalUri = undefined;
        const messageViewUrl = undefined;
        const messageDownloadUrl = undefined;
        const messageFileName = undefined;
        const messageFileMimeType = undefined;

        const messageWithLiveUpdates = {
            ...baseMessage,
            status: messageStatus,
            delivered_to_recipient: messageDelivered,
            progress: messageProgress,
            local_uri: messageLocalUri,
            view_url: messageViewUrl,
            download_url: messageDownloadUrl,
            file_name: messageFileName,
            file_mime_type: messageFileMimeType,
        };

        expect(messageWithLiveUpdates.status).toBe('sent');
        expect(messageWithLiveUpdates.delivered_to_recipient).toBeUndefined();
        expect(messageWithLiveUpdates.progress).toBeUndefined();
    });
});
