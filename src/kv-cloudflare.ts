import type { KVStore } from './kv-interface.js';

/**
 * Minimal subset of the Cloudflare KVNamespace API needed by this store.
 * Full types are available via @cloudflare/workers-types if desired.
 */
export interface CFKVNamespace {
  get(key: string, options: { type: 'json' }): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<{ keys: { name: string }[] }>;
}

/**
 * Cloudflare Workers KV store implementation.
 * Backed by a Cloudflare KV namespace bound in wrangler.toml as EMAIL_CONFIG.
 */
export class CloudflareKVStore implements KVStore {
  constructor(private ns: CFKVNamespace) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.ns.get(key, { type: 'json' });
    return (value as T) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.ns.put(key, JSON.stringify(value));
  }

  async del(key: string): Promise<boolean> {
    const existing = await this.ns.get(key, { type: 'json' });
    if (existing === null) return false;
    await this.ns.delete(key);
    return true;
  }

  async list(): Promise<Record<string, unknown>> {
    const listed = await this.ns.list();
    const result: Record<string, unknown> = {};
    await Promise.all(
      listed.keys.map(async ({ name }) => {
        result[name] = await this.ns.get(name, { type: 'json' });
      }),
    );
    return result;
  }
}
