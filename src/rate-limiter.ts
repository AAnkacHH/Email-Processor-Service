import type { CFKVNamespace } from './kv-cloudflare.js';

/**
 * Platform-agnostic rate limiter interface.
 * Returns true if the request is allowed, false if the limit is exceeded.
 */
export interface RateLimiter {
  check(origin: string): Promise<boolean>;
}

/**
 * Cloudflare Workers rate limiter — backed by KV with auto-expiring keys.
 * Each origin gets `maxPerHour` requests per clock-hour.
 * Keys have the shape `ratelimit:<origin>:<hourBucket>` and expire after 1 hour.
 */
export class CloudflareRateLimiter implements RateLimiter {
  constructor(
    private ns: CFKVNamespace,
    private maxPerHour = 5,
  ) {}

  async check(origin: string): Promise<boolean> {
    const hourBucket = Math.floor(Date.now() / 3_600_000);
    const key = `ratelimit:${origin}:${hourBucket}`;

    const raw = await this.ns.get(key, { type: 'json' });
    const count = typeof raw === 'number' ? raw : 0;

    if (count >= this.maxPerHour) return false;

    await this.ns.put(key, JSON.stringify(count + 1), { expirationTtl: 3600 });
    return true;
  }
}

/**
 * In-memory rate limiter for Node.js.
 * Uses a Map with hourly key rotation.
 * Clears the entire map every hour to prevent unbounded memory growth.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private counts = new Map<string, number>();
  private timer: ReturnType<typeof setInterval>;

  constructor(private maxPerHour = 5) {
    this.timer = setInterval(() => this.counts.clear(), 3_600_000);
    // Don't prevent Node.js from exiting
    if (this.timer.unref) this.timer.unref();
  }

  async check(origin: string): Promise<boolean> {
    const hourBucket = Math.floor(Date.now() / 3_600_000);
    const key = `${origin}:${hourBucket}`;

    const count = this.counts.get(key) ?? 0;
    if (count >= this.maxPerHour) return false;

    this.counts.set(key, count + 1);
    return true;
  }
}
