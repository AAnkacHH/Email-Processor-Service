import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, '../data/config.json');

// ─── In-memory cache ─────────────────────────────────────────────────────────
// Cache is populated on first read and invalidated on every write.
// This prevents blocking the event loop with sync I/O on every request.
let _cache: Record<string, unknown> | null = null;

function readStore(): Record<string, unknown> {
  if (_cache !== null) return _cache;
  if (!fs.existsSync(DATA_FILE)) return (_cache = {});
  try {
    _cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Record<string, unknown>;
    return _cache;
  } catch {
    return (_cache = {});
  }
}

function writeStore(store: Record<string, unknown>): void {
  // Invalidate cache immediately so reads are consistent after write
  _cache = store;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  // ─── Atomic write (POSIX rename) ──────────────────────────────────────────
  // Write to a temp file first, then rename. This avoids partial writes
  // corrupting the data file if the process is interrupted mid-write.
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

export function kvGet<T>(key: string): T | null {
  const store = readStore();
  return (store[key] as T) ?? null;
}

export function kvSet(key: string, value: unknown): void {
  const store = readStore();
  store[key] = value;
  writeStore(store);
}

export function kvDel(key: string): boolean {
  const store = readStore();
  if (!(key in store)) return false;
  delete store[key];
  writeStore(store);
  return true;
}

export function kvList(): Record<string, unknown> {
  return readStore();
}

