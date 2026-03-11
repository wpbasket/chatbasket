/** @jest-environment node */

import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import type { MessageEntry } from '@/lib/personalLib/models/personal.model.chat';

type KeyPath = string;
type StoreRecord = Record<string, any>;

type RequestHandlers<T> = {
  onsuccess: ((this: any, ev: any) => void) | null;
  onerror: ((this: any, ev: any) => void) | null;
  onupgradeneeded?: ((this: any, ev: any) => void) | null;
  onblocked?: ((this: any, ev: any) => void) | null;
  result?: T;
  error?: Error | null;
  transaction?: FakeIDBTransaction;
};

function cloneValue<T>(value: T): T {
  const sc = (globalThis as any).structuredClone;
  return typeof sc === 'function' ? sc(value) : value;
}

function makeRequest<T>() {
  return {
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    onblocked: null,
    result: undefined,
    error: null,
    transaction: undefined,
  } as RequestHandlers<T>;
}

function fireSuccess<T>(req: RequestHandlers<T>, result: T) {
  req.result = result;
  queueMicrotask(() => req.onsuccess?.call(req, { target: req }));
}

class FakeIDBIndex {
  constructor(private store: FakeIDBObjectStore, private field: string) {}

  getAll(query?: any) {
    const req = makeRequest<any[]>();
    const values = Array.from(this.store.records.values()).filter(value => {
      if (query === undefined) return true;
      return value?.[this.field] === query;
    }).map(value => cloneValue(value));
    fireSuccess(req, values);
    return req;
  }
}

class FakeIDBObjectStore {
  public indexNames = {
    contains: (name: string) => this.indexDefs.has(name),
  };

  constructor(
    public name: string,
    public keyPath: KeyPath,
    public records: Map<string, StoreRecord>,
    private indexDefs: Map<string, string>,
  ) {}

  createIndex(name: string, field: string, _options?: any) {
    this.indexDefs.set(name, field);
    return new FakeIDBIndex(this, field);
  }

  deleteIndex(name: string) {
    this.indexDefs.delete(name);
  }

  index(name: string) {
    const field = this.indexDefs.get(name);
    if (!field) throw new Error(`Missing index ${name}`);
    return new FakeIDBIndex(this, field);
  }

  put(value: StoreRecord, keyArg?: any) {
    const req = makeRequest<void>();
    const rawKey = this.keyPath === '__key' ? keyArg : value[this.keyPath];
    const key = String(rawKey);
    this.records.set(key, cloneValue(value));
    fireSuccess(req, undefined);
    return req;
  }

  get(key: any) {
    const req = makeRequest<any>();
    const value = this.records.get(String(key));
    fireSuccess(req, value ? cloneValue(value) : undefined);
    return req;
  }

  getAll(query?: any) {
    const req = makeRequest<any[]>();
    const values = Array.from(this.records.values()).filter(value => {
      if (query === undefined) return true;
      return value?.[this.keyPath] === query;
    }).map(value => cloneValue(value));
    fireSuccess(req, values);
    return req;
  }

  getAllKeys() {
    const req = makeRequest<any[]>();
    fireSuccess(req, Array.from(this.records.keys()));
    return req;
  }

  delete(key: any) {
    const req = makeRequest<void>();
    this.records.delete(String(key));
    fireSuccess(req, undefined);
    return req;
  }

  clear() {
    const req = makeRequest<void>();
    this.records.clear();
    fireSuccess(req, undefined);
    return req;
  }

  count(query?: any) {
    const req = makeRequest<number>();
    const count = query === undefined
      ? this.records.size
      : Array.from(this.records.values()).filter(value => value?.[this.keyPath] === query).length;
    fireSuccess(req, count);
    return req;
  }
}

class FakeIDBTransaction {
  constructor(private stores: Map<string, FakeStoreData>) {}

  objectStore(name: string) {
    const store = this.stores.get(name);
    if (!store) throw new Error(`Missing store ${name}`);
    return new FakeIDBObjectStore(name, store.keyPath, store.records, store.indexes);
  }
}

type FakeStoreData = {
  keyPath: string;
  records: Map<string, StoreRecord>;
  indexes: Map<string, string>;
};

class FakeIDBDatabase {
  public objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  };

  constructor(public name: string, public stores: Map<string, FakeStoreData>) {}

  createObjectStore(name: string, options?: { keyPath?: string }) {
    const keyPath = options?.keyPath ?? '__key';
    const store: FakeStoreData = {
      keyPath,
      records: new Map(),
      indexes: new Map(),
    };
    this.stores.set(name, store);
    return new FakeIDBObjectStore(name, store.keyPath, store.records, store.indexes);
  }

  transaction(names: string | string[], _mode: string) {
    const list = Array.isArray(names) ? names : [names];
    const selected = new Map<string, FakeStoreData>();
    for (const name of list) {
      const store = this.stores.get(name);
      if (!store) throw new Error(`Missing store ${name}`);
      selected.set(name, store);
    }
    return new FakeIDBTransaction(selected);
  }

  close() {}
}

class FakeIndexedDB {
  private dbs = new Map<string, FakeIDBDatabase>();

  open(name: string, _version?: number) {
    const req = makeRequest<FakeIDBDatabase>();
    queueMicrotask(() => {
      let db = this.dbs.get(name);
      const isNew = !db;
      if (!db) {
        db = new FakeIDBDatabase(name, new Map());
        this.dbs.set(name, db);
      }
      req.result = db;
      req.transaction = new FakeIDBTransaction(db.stores);
      if (isNew) {
        req.onupgradeneeded?.call(req, { target: req });
      }
      req.onsuccess?.call(req, { target: req });
    });
    return req;
  }

  deleteDatabase(name: string) {
    const req = makeRequest<void>();
    this.dbs.delete(name);
    fireSuccess(req, undefined);
    return req;
  }

  async databases() {
    return Array.from(this.dbs.keys()).map(name => ({ name }));
  }
}

function baseMessage(overrides: Partial<MessageEntry> = {}): MessageEntry & { tempId?: string; localUri?: string } {
  return {
    message_id: 'msg-1',
    chat_id: 'chat-1',
    is_from_me: true,
    recipient_id: 'user-2',
    content: 'hello',
    message_type: 'text',
    delivered_to_recipient: false,
    delivered_to_recipient_primary: false,
    synced_to_sender_primary: false,
    status: 'pending',
    created_at: '2026-03-11T00:00:00.000Z',
    expires_at: '2026-03-12T00:00:00.000Z',
    file_url: undefined,
    file_name: null,
    file_size: null,
    file_mime_type: null,
    view_url: undefined,
    download_url: undefined,
    progress: undefined,
    file_id: null,
    ...overrides,
  };
}

jest.setTimeout(20000);

describe('chat.storage.web', () => {
  beforeEach(async () => {
    jest.resetModules();
    (global as any).TextEncoder = TextEncoder;
    (global as any).TextDecoder = TextDecoder;
    const fakeIndexedDB = new FakeIndexedDB();
    (global as any).indexedDB = fakeIndexedDB;
    (global as any).window = {
      crypto: webcrypto,
    };
    (global as any).structuredClone = globalThis.structuredClone;
  });

  async function loadStorage() {
    const mod = require('@/lib/storage/personalStorage/chat/chat.storage.web');
    await mod.initChatStorage();
    return mod;
  }

  it('merges concurrent same-message updates without lost fields', async () => {
    const storage = await loadStorage();
    await storage.insertMessage(baseMessage());

    await Promise.all([
      storage.updateMessageStatus('msg-1', { delivered_to_recipient: true } as any),
      storage.updateMessageStatus('msg-1', { status: 'read' } as any),
    ]);

    const [stored] = await storage.getMessagesByChat('chat-1');
    expect(stored.message_id).toBe('msg-1');
    expect(stored.delivered_to_recipient).toBe(true);
    expect(stored.status).toBe('read');
  });

  it('promotes temp id to real id without leaving a resurrected temp row', async () => {
    const storage = await loadStorage();
    await storage.insertMessage(baseMessage({ message_id: 'temp-1', status: 'sending' }),);

    await Promise.all([
      storage.swapTempIdToRealId('temp-1', 'real-1', { acked_by_server: true } as any),
      storage.updateMessageStatus('temp-1', { delivered_to_recipient: true } as any),
    ]);

    const all = await storage.getMessagesByChat('chat-1');
    expect(all).toHaveLength(1);
    expect(all[0].message_id).toBe('real-1');
    expect(all[0].temp_id).toBeNull();
    expect(all[0].status).toBe('sent');
    expect(all[0].acked_by_server).toBe(true);
  });

  it('cleans up media fields and purges deleted rows without hanging', async () => {
    const storage = await loadStorage();
    await storage.insertMessage(baseMessage({
      message_id: 'file-1',
      message_type: 'file',
      local_uri: 'idb://temp-file-1' as any,
      file_id: 'file-123',
      download_url: 'https://example.test/dl',
      view_url: 'https://example.test/view',
    } as any));

    await storage.storeMediaBlob('file-1', new Blob(['abc']), 'text/plain', 'a.txt');
    await storage.storeMediaBlob('temp-file-1', new Blob(['abc']), 'text/plain', 'a.txt');

    await storage.cleanupMessageMedia(['file-1']);
    let [stored] = await storage.getMessagesByChat('chat-1');
    expect(stored.local_uri).toBeNull();
    expect(stored.file_id).toBeNull();
    expect(stored.download_url).toBeNull();
    expect(stored.view_url).toBeNull();

    await storage.updateMessageStatus('file-1', { deleted_for_me: true } as any);
    const purged = await storage.purgeDeletedMessages();
    expect(purged).toBe(1);
    expect(await storage.getMessagesByChat('chat-1')).toHaveLength(0);
  });
});
