import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { KVStore } from './kv-interface.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, '../data/config.json');

/**
 * Node.js file-based KV store implementation.
 * Reads from / writes to `data/config.json`.
 * Uses an in-memory cache so disk is only read once per process lifetime.
 * Writes are atomic via temp-file + rename.
 */
export class FileKVStore implements KVStore {
  // Per-instance cache — isolated between test instances
  private _cache: Record<string, unknown> | null = null;

  private readStore(): Record<string, unknown> {
    if (this._cache !== null) return this._cache;
    if (!fs.existsSync(DATA_FILE)) return (this._cache = {});
    try {
      this._cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Record<string, unknown>;
      return this._cache;
    } catch {
      return (this._cache = {});
    }
  }

  private writeStore(store: Record<string, unknown>): void {
    this._cache = store;
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    // Atomic write: write to .tmp, then rename (POSIX atomic operation)
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  }

  async get<T>(key: string): Promise<T | null> {
    const store = this.readStore();
    return (store[key] as T) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    const store = this.readStore();
    store[key] = value;
    this.writeStore(store);
  }

  async del(key: string): Promise<boolean> {
    const store = this.readStore();
    if (!(key in store)) return false;
    delete store[key];
    this.writeStore(store);
    return true;
  }

  async list(): Promise<Record<string, unknown>> {
    return this.readStore();
  }
}
