import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs before importing FileKVStore.
// renameSync is needed for the atomic write in FileKVStore.writeStore.
vi.mock('node:fs', async () => {
  const store: Record<string, string> = {};

  const renameSync = vi.fn((tmp: string, dest: string) => {
    if (tmp in store) {
      store[dest] = store[tmp];
      delete store[tmp];
    }
  });

  const impl = {
    existsSync: vi.fn((p: string) => p in store),
    readFileSync: vi.fn((p: string) => store[p] ?? '{}'),
    writeFileSync: vi.fn((p: string, data: string) => {
      store[p] = data;
    }),
    mkdirSync: vi.fn(),
    renameSync,
  };

  return { default: impl, ...impl };
});

import fs from 'node:fs';
import { FileKVStore } from '../src/kv.js';

const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;

describe('FileKVStore', () => {
  let kv: FileKVStore;

  beforeEach(() => {
    vi.clearAllMocks();
    // Fresh instance per test — cache is per-instance, so isolation is automatic
    kv = new FileKVStore();
    // Default: empty file system (no config.json)
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');
  });

  it('returns null for a missing key', async () => {
    const result = await kv.get('https://missing.com');
    expect(result).toBeNull();
  });

  it('sets and gets a value (cache path)', async () => {
    const config = { service: 'resend', apiKey: 're_123', from: 'a@b.com' };
    await kv.set('https://ankach.com', config);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();

    // get() reads from in-memory cache — no second fs call needed
    const result = await kv.get<typeof config>('https://ankach.com');
    expect(result).toEqual(config);
  });

  it('deletes an existing key', async () => {
    await kv.set('https://ankach.com', { service: 'resend' });
    mockWriteFileSync.mockClear();

    const deleted = await kv.del('https://ankach.com');
    expect(deleted).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
  });

  it('returns false when deleting a missing key', async () => {
    const deleted = await kv.del('https://notexist.com');
    expect(deleted).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('lists all entries', async () => {
    await kv.set('https://ankach.com', { service: 'resend' });
    await kv.set('https://lugixbox.cz', { service: 'sendgrid' });

    const list = await kv.list();
    expect(Object.keys(list)).toHaveLength(2);
    expect(list['https://ankach.com']).toEqual({ service: 'resend' });
  });

  it('reads from disk on first access (cache miss)', async () => {
    // Simulate an existing config.json on disk
    const diskData = { 'https://from-disk.com': { service: 'sendgrid' } };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(diskData));

    const result = await kv.get('https://from-disk.com');
    expect(result).toEqual({ service: 'sendgrid' });
    expect(mockReadFileSync).toHaveBeenCalledOnce();
  });

  it('reads from cache on second access (no extra fs calls)', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ 'https://ankach.com': { service: 'resend' } }));

    await kv.get('https://ankach.com'); // first: disk
    await kv.get('https://ankach.com'); // second: cache
    expect(mockReadFileSync).toHaveBeenCalledOnce();
  });
});
