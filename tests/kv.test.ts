import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the 'node:fs' module before importing kv.
// renameSync is required by the atomic write in writeStore.
vi.mock('node:fs', async () => {
  const store: Record<string, string> = {};

  const renameSync = vi.fn((tmp: string, dest: string) => {
    if (tmp in store) {
      store[dest] = store[tmp];
      delete store[tmp];
    }
  });

  return {
    default: {
      existsSync: vi.fn((p: string) => p in store),
      readFileSync: vi.fn((p: string) => store[p] ?? '{}'),
      writeFileSync: vi.fn((p: string, data: string) => {
        store[p] = data;
      }),
      mkdirSync: vi.fn(),
      renameSync,
    },
    existsSync: vi.fn((p: string) => p in store),
    readFileSync: vi.fn((p: string) => store[p] ?? '{}'),
    writeFileSync: vi.fn((p: string, data: string) => {
      store[p] = data;
    }),
    mkdirSync: vi.fn(),
    renameSync,
  };
});

import fs from 'node:fs';
import { kvGet, kvSet, kvDel, kvList } from '../src/kv.js';

const mockWriteFileSync = fs.writeFileSync as ReturnType<typeof vi.fn>;
const mockReadFileSync = fs.readFileSync as ReturnType<typeof vi.fn>;
const mockExistsSync = fs.existsSync as ReturnType<typeof vi.fn>;

describe('KV Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock FS to empty state
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');
    // Bust the in-memory cache: with existsSync returning false, the next
    // call to readStore() will populate _cache with {} from the mock.
    kvGet('__cache_reset__');
  });

  it('returns null for a missing key', () => {
    const result = kvGet('https://missing.com');
    expect(result).toBeNull();
  });

  it('sets and gets a value', () => {
    const config = { service: 'resend', apiKey: 're_123', from: 'a@b.com' };

    // After kvSet the cache holds the new value directly — no extra mock needed
    kvSet('https://ankach.com', config);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();

    const result = kvGet<typeof config>('https://ankach.com');
    expect(result).toEqual(config);
  });

  it('deletes an existing key', () => {
    // Pre-populate the cache via kvSet
    kvSet('https://ankach.com', { service: 'resend' });
    mockWriteFileSync.mockClear(); // clear the set() write call

    const deleted = kvDel('https://ankach.com');
    expect(deleted).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
  });

  it('returns false when deleting a missing key', () => {
    const deleted = kvDel('https://notexist.com');
    expect(deleted).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('lists all entries', () => {
    kvSet('https://ankach.com', { service: 'resend' });
    kvSet('https://lugixbox.cz', { service: 'sendgrid' });

    const list = kvList();
    expect(Object.keys(list)).toHaveLength(2);
    expect(list['https://ankach.com']).toEqual({ service: 'resend' });
  });
});
