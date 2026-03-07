/**
 * Platform-agnostic key-value storage interface.
 * - Node.js: implemented by FileKVStore (JSON on disk)
 * - Cloudflare Workers: implemented by CloudflareKVStore (CF KV namespace)
 */
export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<boolean>;
  list(): Promise<Record<string, unknown>>;
}
