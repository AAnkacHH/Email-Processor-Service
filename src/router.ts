import type { KVStore } from './kv-interface.js';
import type { RateLimiter } from './rate-limiter.js';
import { sendEmail } from './providers/index.js';
import type { ClientConfig, EmailPayload } from './types.js';

// ─── Response helpers ─────────────────────────────────────────────────────────

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAdmin(request: Request, adminSecret: string): boolean {
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${adminSecret}`;
}

async function getCorsHeaders(
  origin: string | null,
  kv: KVStore,
): Promise<Record<string, string>> {
  if (!origin) return {};
  const config = await kv.get<ClientConfig>(origin);
  if (!config) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function maskConfigs(store: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(store).map(([origin, cfg]) => {
      const c = cfg as { apiKey?: string };
      if (!c?.apiKey) return [origin, cfg];
      return [origin, { ...c, apiKey: `${c.apiKey.slice(0, 6)}...` }];
    }),
  );
}

// ─── Main handler (platform-agnostic) ────────────────────────────────────────

export async function handleRequest(
  request: Request,
  kv: KVStore,
  adminSecret: string,
  rateLimiter?: RateLimiter,
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const origin = request.headers.get('origin');

  // ─── POST /send ─────────────────────────────────────────────────────────────
  if (url.pathname === '/send') {
    const corsHeaders = await getCorsHeaders(origin, kv);

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const config = origin ? await kv.get<ClientConfig>(origin) : null;
    if (!origin || !config) {
      return text(403, 'Forbidden');
    }

    if (method !== 'POST') {
      return text(405, 'Method Not Allowed');
    }

    let body: EmailPayload;
    try {
      body = (await request.json()) as EmailPayload;
    } catch {
      return json(400, { error: 'Invalid JSON body' }, corsHeaders);
    }

    if (!body.to || !body.subject || !body.html) {
      return json(400, { error: 'Missing required fields: to, subject, html' }, corsHeaders);
    }

    const recipients = Array.isArray(body.to) ? body.to : [body.to];
    if (!recipients.every((e) => EMAIL_RE.test(e))) {
      return json(400, { error: 'Invalid email address in "to"' }, corsHeaders);
    }

    // Rate limit check (after validation, before sending)
    if (rateLimiter) {
      const allowed = await rateLimiter.check(origin);
      if (!allowed) {
        return json(429, { error: 'Rate limit exceeded. Try again later.' }, corsHeaders);
      }
    }

    const result = await sendEmail(config, body);
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ─── Admin: GET /config ──────────────────────────────────────────────────────
  if (url.pathname === '/config' && method === 'GET') {
    if (!isAdmin(request, adminSecret)) return text(401, 'Unauthorized');
    return json(200, maskConfigs(await kv.list()));
  }

  // ─── Admin: POST /config ─────────────────────────────────────────────────────
  if (url.pathname === '/config' && method === 'POST') {
    if (!isAdmin(request, adminSecret)) return text(401, 'Unauthorized');

    let body: { origin: string } & ClientConfig;
    try {
      body = (await request.json()) as { origin: string } & ClientConfig;
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const { origin: clientOrigin, service, apiKey, from } = body;
    if (!clientOrigin || !service || !apiKey || !from) {
      return json(400, { error: 'Missing fields: origin, service, apiKey, from' });
    }

    if (!EMAIL_RE.test(from)) {
      return json(400, { error: 'Invalid email address in "from"' });
    }

    await kv.set(clientOrigin, { service, apiKey, from });
    return json(201, { message: `Config saved for ${clientOrigin}` });
  }

  // ─── Admin: DELETE /config/:key ──────────────────────────────────────────────
  if (url.pathname.startsWith('/config/') && method === 'DELETE') {
    if (!isAdmin(request, adminSecret)) return text(401, 'Unauthorized');

    const key = decodeURIComponent(url.pathname.replace('/config/', ''));
    const deleted = await kv.del(key);

    if (!deleted) {
      return json(404, { error: `No config found for: ${key}` });
    }

    return json(200, { message: `Deleted config for ${key}` });
  }

  // ─── 404 ─────────────────────────────────────────────────────────────────────
  return text(404, 'Not Found');
}
