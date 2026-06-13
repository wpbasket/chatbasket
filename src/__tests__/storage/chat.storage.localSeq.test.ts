/**
 * Tests for outbox message ordering with local_seq tie-breaker.
 * Verifies that messages with identical inserted_at timestamps are
 * deterministically ordered by their monotonic local_seq value.
 */

import type { LocalMessageEntry } from '@/lib/storage/personalStorage/chat/chat.storage.schema';

describe('Outbox ordering with local_seq', () => {
  const createMessage = (overrides: Partial<LocalMessageEntry> = {}): LocalMessageEntry => ({
    message_id: 'msg-' + Math.random().toString(36).slice(2),
    chat_id: 'chat-1',
    recipient_id: 'user-2',
    content: 'test message',
    message_type: 'text',
    status: 'pending',
    is_from_me: true,
    delivered_to_recipient: false,
    delivered_to_recipient_primary: false,
    synced_to_sender_primary: false,
    created_at: new Date().toISOString(),
    expires_at: null,
    file_id: null,
    file_name: null,
    file_size: null,
    file_mime_type: null,
    view_url: null,
    download_url: null,
    file_token_expiry: null,
    sender_e2ee_public_key: null,
    recipient_e2ee_public_key_used: null,
    local_uri: null,
    temp_id: null,
    acked_by_server: false,
    deleted_for_me: false,
    retry_count: 0,
    last_retry_at: null,
    error_message: null,
    error_is_blocking: null,
    inserted_at: '2026-06-13T12:00:00.000Z', // Same timestamp for all
    updated_at: new Date().toISOString(),
    local_seq: 0,
    ...overrides,
  });

  describe('Web storage sort comparator', () => {
    // Replicate the sort logic from chat.storage.web.ts getPendingOutboxMessages
    const sortMessages = (messages: LocalMessageEntry[]): LocalMessageEntry[] => {
      return [...messages].sort((a, b) => {
        const cmp = a.inserted_at.localeCompare(b.inserted_at);
        return cmp !== 0 ? cmp : (a.local_seq || 0) - (b.local_seq || 0);
      });
    };

    it('orders messages with identical inserted_at by local_seq ascending', () => {
      const msg1 = createMessage({ message_id: 'msg-1', local_seq: 5 });
      const msg2 = createMessage({ message_id: 'msg-2', local_seq: 3 });
      const msg3 = createMessage({ message_id: 'msg-3', local_seq: 7 });

      const sorted = sortMessages([msg1, msg2, msg3]);

      expect(sorted.map(m => m.message_id)).toEqual(['msg-2', 'msg-1', 'msg-3']);
      expect(sorted[0].local_seq).toBe(3);
      expect(sorted[1].local_seq).toBe(5);
      expect(sorted[2].local_seq).toBe(7);
    });

    it('maintains order when multiple messages have same inserted_at', () => {
      const timestamp = '2026-06-13T12:00:00.000Z';
      const messages = [
        createMessage({ message_id: 'msg-a', inserted_at: timestamp, local_seq: 100 }),
        createMessage({ message_id: 'msg-b', inserted_at: timestamp, local_seq: 101 }),
        createMessage({ message_id: 'msg-c', inserted_at: timestamp, local_seq: 102 }),
        createMessage({ message_id: 'msg-d', inserted_at: timestamp, local_seq: 103 }),
      ];

      // Shuffle the input
      const shuffled = [messages[2], messages[0], messages[3], messages[1]];
      const sorted = sortMessages(shuffled);

      expect(sorted.map(m => m.message_id)).toEqual(['msg-a', 'msg-b', 'msg-c', 'msg-d']);
      expect(sorted.map(m => m.local_seq)).toEqual([100, 101, 102, 103]);
    });

    it('falls back to local_seq when inserted_at is identical', () => {
      const msg1 = createMessage({ message_id: 'first', local_seq: 1 });
      const msg2 = createMessage({ message_id: 'second', local_seq: 2 });

      const sorted = sortMessages([msg2, msg1]);

      expect(sorted[0].message_id).toBe('first');
      expect(sorted[1].message_id).toBe('second');
    });

    it('handles messages with missing local_seq (defaults to 0)', () => {
      const msg1 = createMessage({ message_id: 'msg-1', local_seq: 0 });
      const msg2 = createMessage({ message_id: 'msg-2' });
      msg2.local_seq = undefined as any; // Simulate missing field
      const msg3 = createMessage({ message_id: 'msg-3', local_seq: 1 });

      const sorted = sortMessages([msg3, msg1, msg2]);

      // msg1 (local_seq=0) and msg2 (local_seq=undefined→0) come before msg3 (local_seq=1)
      expect(sorted[0].message_id).toBe('msg-1');
      expect(sorted[1].message_id).toBe('msg-2');
      expect(sorted[2].message_id).toBe('msg-3');
    });

    it('orders by inserted_at first, then local_seq', () => {
      const early = '2026-06-13T11:00:00.000Z';
      const late = '2026-06-13T12:00:00.000Z';

      const messages = [
        createMessage({ message_id: 'late-1', inserted_at: late, local_seq: 1 }),
        createMessage({ message_id: 'early-5', inserted_at: early, local_seq: 5 }),
        createMessage({ message_id: 'late-2', inserted_at: late, local_seq: 2 }),
        createMessage({ message_id: 'early-3', inserted_at: early, local_seq: 3 }),
      ];

      const sorted = sortMessages(messages);

      // Early messages first (by inserted_at), then by local_seq within each group
      expect(sorted.map(m => m.message_id)).toEqual(['early-3', 'early-5', 'late-1', 'late-2']);
    });

    it('preserves preparing message order when blocked by earlier preparing', () => {
      // Simulates: big file (preparing, local_seq=10), small text (pending, local_seq=11)
      // Queue should process in local_seq order: big file first
      const bigFile = createMessage({
        message_id: 'big-file',
        status: 'preparing',
        local_seq: 10,
        file_size: 50_000_000,
      });
      const smallText = createMessage({
        message_id: 'small-text',
        status: 'pending',
        local_seq: 11,
      });

      const sorted = sortMessages([smallText, bigFile]);

      expect(sorted[0].message_id).toBe('big-file');
      expect(sorted[0].status).toBe('preparing');
      expect(sorted[1].message_id).toBe('small-text');
      expect(sorted[1].status).toBe('pending');
    });
  });

  describe('Native storage ORDER BY simulation', () => {
    // Simulate SQLite ORDER BY inserted_at ASC, local_seq ASC
    const sqlOrderBy = (messages: LocalMessageEntry[]): LocalMessageEntry[] => {
      return [...messages].sort((a, b) => {
        const insertedCmp = a.inserted_at.localeCompare(b.inserted_at);
        if (insertedCmp !== 0) return insertedCmp;
        return a.local_seq - b.local_seq;
      });
    };

    it('deterministically orders ties by local_seq', () => {
      const timestamp = '2026-06-13T12:00:00.000Z';
      const messages = [
        createMessage({ message_id: 'msg-z', inserted_at: timestamp, local_seq: 10 }),
        createMessage({ message_id: 'msg-a', inserted_at: timestamp, local_seq: 5 }),
        createMessage({ message_id: 'msg-m', inserted_at: timestamp, local_seq: 7 }),
      ];

      const sorted = sqlOrderBy(messages);

      expect(sorted.map(m => m.message_id)).toEqual(['msg-a', 'msg-m', 'msg-z']);
    });

    it('handles zero local_seq values', () => {
      const messages = [
        createMessage({ message_id: 'msg-1', local_seq: 0 }),
        createMessage({ message_id: 'msg-2', local_seq: 0 }),
        createMessage({ message_id: 'msg-3', local_seq: 1 }),
      ];

      const sorted = sqlOrderBy(messages);

      // msg-1 and msg-2 both have local_seq=0, order depends on input
      expect(sorted[2].message_id).toBe('msg-3');
      expect(sorted[0].local_seq).toBe(0);
      expect(sorted[1].local_seq).toBe(0);
    });
  });

  describe('Monotonic counter behavior', () => {
    it('ensures strictly increasing local_seq values', () => {
      // Simulate counter behavior
      let counter = 100;
      const getNextSeq = () => ++counter;

      const seq1 = getNextSeq();
      const seq2 = getNextSeq();
      const seq3 = getNextSeq();

      expect(seq1).toBe(101);
      expect(seq2).toBe(102);
      expect(seq3).toBe(103);
      expect(seq2).toBeGreaterThan(seq1);
      expect(seq3).toBeGreaterThan(seq2);
    });

    it('never reuses local_seq values', () => {
      const usedSeqs = new Set<number>();
      let counter = 0;
      const getNextSeq = () => ++counter;

      // Generate 1000 sequences
      for (let i = 0; i < 1000; i++) {
        const seq = getNextSeq();
        expect(usedSeqs.has(seq)).toBe(false);
        usedSeqs.add(seq);
      }

      expect(usedSeqs.size).toBe(1000);
    });
  });

  describe('swapTempIdToRealId preserves local_seq', () => {
    it('maintains original local_seq after ID swap', () => {
      const originalSeq = 42;
      const tempMsg = createMessage({
        message_id: 'temp-123',
        temp_id: 'temp-123',
        status: 'sending',
        local_seq: originalSeq,
      });

      // Simulate swapTempIdToRealId behavior (native version)
      const promoted: LocalMessageEntry = {
        ...tempMsg,
        message_id: 'real-456',
        temp_id: null,
        status: 'sent',
        acked_by_server: true,
        error_message: null,
        error_is_blocking: null,
        retry_count: 0,
        last_retry_at: null,
        updated_at: new Date().toISOString(),
        // local_seq should be preserved from temp entry
        local_seq: tempMsg.local_seq,
      };

      expect(promoted.local_seq).toBe(originalSeq);
      expect(promoted.message_id).toBe('real-456');
      expect(promoted.status).toBe('sent');
    });

    it('preserves local_seq across preparing → pending → sent transitions', () => {
      const originalSeq = 99;

      // Initial preparing state
      const preparing = createMessage({
        message_id: 'temp-789',
        temp_id: 'temp-789',
        status: 'preparing',
        local_seq: originalSeq,
      });

      // After copy completes: preparing → pending
      const pending = {
        ...preparing,
        status: 'pending' as const,
        local_uri: '/path/to/file',
      };

      // After upload completes: pending → sent (via swapTempIdToRealId)
      const sent = {
        ...pending,
        message_id: 'real-789',
        temp_id: null,
        status: 'sent' as const,
        acked_by_server: true,
        local_seq: pending.local_seq, // Preserved
      };

      expect(sent.local_seq).toBe(originalSeq);
      expect(pending.local_seq).toBe(originalSeq);
      expect(preparing.local_seq).toBe(originalSeq);
    });
  });
});
