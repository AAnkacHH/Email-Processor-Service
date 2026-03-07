import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, '../data/config.json');

function readStore(): Record<string, unknown> {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
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
