import { CloudflareKVStore } from './kv-cloudflare.js';
import { CloudflareRateLimiter } from './rate-limiter.js';
import { handleRequest } from './router.js';
import type { CFKVNamespace } from './kv-cloudflare.js';

// ─── Cloudflare Worker Env bindings ──────────────────────────────────────────
// Configure in wrangler.toml:
//   - EMAIL_CONFIG: KV namespace binding (stores per-origin configs)
//   - ADMIN_SECRET: Worker secret (set via `wrangler secret put ADMIN_SECRET`)
//   - SEND_SECRET: Worker secret (set via `wrangler secret put SEND_SECRET`)
interface Env {
  EMAIL_CONFIG: CFKVNamespace;
  ADMIN_SECRET: string;
  SEND_SECRET: string;
  RATE_LIMIT_PER_HOUR?: string;
}

const DEFAULT_RATE_LIMIT_PER_HOUR = 30;

// ─── Cloudflare Worker entry point ────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.ADMIN_SECRET) {
      return new Response('Server misconfigured: ADMIN_SECRET not set', { status: 500 });
    }
    if (!env.SEND_SECRET) {
      return new Response('Server misconfigured: SEND_SECRET not set', { status: 500 });
    }

    const kv = new CloudflareKVStore(env.EMAIL_CONFIG);
    const limit = Number(env.RATE_LIMIT_PER_HOUR) || DEFAULT_RATE_LIMIT_PER_HOUR;
    const rateLimiter = new CloudflareRateLimiter(env.EMAIL_CONFIG, limit);
    return handleRequest(request, kv, env.ADMIN_SECRET, env.SEND_SECRET, rateLimiter);
  },
};
