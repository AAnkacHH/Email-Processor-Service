import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the 'node:fs' module before importing kv
vi.mock('node:fs', async () => {
  const store: Record<string, string> = {};

  return {
    default: {
      existsSync: vi.fn((p: string) => p in store),
      readFileSync: vi.fn((p: string) => store[p] ?? '{}'),
      writeFileSync: vi.fn((p: string, data: string) => {
        store[p] = data;
      }),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn((p: string) => p in store),
    readFileSync: vi.fn((p: string) => store[p] ?? '{}'),
    writeFileSync: vi.fn((p: string, data: string) => {
      store[p] = data;
    }),
    mkdirSync: vi.fn(),
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
    // Reset to empty store
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');
  });

  it('returns null for a missing key', () => {
    const result = kvGet('https://missing.com');
    expect(result).toBeNull();
  });

  it('sets and gets a value', () => {
    const config = { service: 'resend', apiKey: 're_123', from: 'a@b.com' };

    // After set, simulate the file having been written
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ 'https://ankach.com': config }));

    kvSet('https://ankach.com', config);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();

    const result = kvGet<typeof config>('https://ankach.com');
    expect(result).toEqual(config);
  });

  it('deletes an existing key', () => {
    const store = { 'https://ankach.com': { service: 'resend' } };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(store));

    const deleted = kvDel('https://ankach.com');
    expect(deleted).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
  });

  it('returns false when deleting a missing key', () => {
    mockExistsSync.mockReturnValue(false);
    const deleted = kvDel('https://notexist.com');
    expect(deleted).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('lists all entries', () => {
    const store = {
      'https://ankach.com': { service: 'resend' },
      'https://lugixbox.cz': { service: 'sendgrid' },
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(store));

    const list = kvList();
    expect(Object.keys(list)).toHaveLength(2);
    expect(list['https://ankach.com']).toEqual({ service: 'resend' });
  });
});
