import { CloudflareKVStore } from './kv-cloudflare.js';
import { CloudflareRateLimiter } from './rate-limiter.js';
import { handleRequest } from './router.js';
import type { CFKVNamespace } from './kv-cloudflare.js';

// ─── Cloudflare Worker Env bindings ──────────────────────────────────────────
// Configure in wrangler.toml:
//   - EMAIL_CONFIG: KV namespace binding (stores per-origin configs)
//   - ADMIN_SECRET: Worker secret (set via `wrangler secret put ADMIN_SECRET`)
interface Env {
  EMAIL_CONFIG: CFKVNamespace;
  ADMIN_SECRET: string;
}

// ─── Cloudflare Worker entry point ────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.ADMIN_SECRET) {
      return new Response('Server misconfigured: ADMIN_SECRET not set', { status: 500 });
    }

    const kv = new CloudflareKVStore(env.EMAIL_CONFIG);
    const rateLimiter = new CloudflareRateLimiter(env.EMAIL_CONFIG, 5);
    return handleRequest(request, kv, env.ADMIN_SECRET, rateLimiter);
  },
};
