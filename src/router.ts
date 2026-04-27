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
const SERVICES = new Set<ClientConfig['service']>(['resend', 'sendgrid', 'brevo']);

function hasBearerToken(request: Request, token: string): boolean {
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${token}`;
}

function isEmailList(value: unknown): value is string | string[] {
  const emails = Array.isArray(value) ? value : [value];
  return emails.every((email) => typeof email === 'string' && EMAIL_RE.test(email));
}

function normalizeOrigin(origin: unknown): string | null {
  if (typeof origin !== 'string' || !origin) return null;

  try {
    const url = new URL(origin);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

async function getCorsHeaders(origin: string | null, kv: KVStore): Promise<Record<string, string>> {
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
  sendSecret: string,
  rateLimiter?: RateLimiter,
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const requestOrigin = request.headers.get('origin');

  // ─── POST /send ─────────────────────────────────────────────────────────────
  if (url.pathname === '/send') {
    const corsHeaders = await getCorsHeaders(requestOrigin, kv);

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (method !== 'POST') {
      return text(405, 'Method Not Allowed');
    }

    if (!hasBearerToken(request, sendSecret)) {
      return text(401, 'Unauthorized');
    }

    let body: EmailPayload;
    try {
      body = (await request.json()) as EmailPayload;
    } catch {
      return json(400, { error: 'Invalid JSON body' }, corsHeaders);
    }

    const clientOrigin = normalizeOrigin(body.origin ?? requestOrigin);
    if (!clientOrigin) {
      return json(400, { error: 'Missing or invalid origin' }, corsHeaders);
    }

    const config = await kv.get<ClientConfig>(clientOrigin);
    if (!config) {
      return text(403, 'Forbidden');
    }

    const recipients = config.to ?? body.to;
    if (!recipients || !body.subject || !body.html) {
      return json(400, { error: 'Missing required fields: to, subject, html' }, corsHeaders);
    }

    if (!isEmailList(recipients)) {
      return json(400, { error: 'Invalid email address in "to"' }, corsHeaders);
    }

    // Rate limit check (after validation, before sending)
    if (rateLimiter) {
      const allowed = await rateLimiter.check(clientOrigin);
      if (!allowed) {
        return json(429, { error: 'Rate limit exceeded. Try again later.' }, corsHeaders);
      }
    }

    const payload: Omit<EmailPayload, 'from' | 'origin'> = {
      to: body.to,
      subject: body.subject,
      html: body.html,
      attachments: body.attachments,
    };
    const result = await sendEmail(config, { ...payload, to: recipients });
    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ─── Admin: GET /config ──────────────────────────────────────────────────────
  if (url.pathname === '/config' && method === 'GET') {
    if (!hasBearerToken(request, adminSecret)) return text(401, 'Unauthorized');
    return json(200, maskConfigs(await kv.list()));
  }

  // ─── Admin: POST /config ─────────────────────────────────────────────────────
  if (url.pathname === '/config' && method === 'POST') {
    if (!hasBearerToken(request, adminSecret)) return text(401, 'Unauthorized');

    let body: { origin: string } & ClientConfig;
    try {
      body = (await request.json()) as { origin: string } & ClientConfig;
    } catch {
      return json(400, { error: 'Invalid JSON body' });
    }

    const { origin: clientOrigin, service, apiKey, from, to } = body;
    if (!clientOrigin || !service || !apiKey || !from) {
      return json(400, { error: 'Missing fields: origin, service, apiKey, from' });
    }

    const normalizedOrigin = normalizeOrigin(clientOrigin);
    if (!normalizedOrigin) {
      return json(400, { error: 'Invalid origin' });
    }

    if (!SERVICES.has(service)) {
      return json(400, { error: 'Invalid service' });
    }

    if (!EMAIL_RE.test(from)) {
      return json(400, { error: 'Invalid email address in "from"' });
    }

    if (to !== undefined && !isEmailList(to)) {
      return json(400, { error: 'Invalid email address in "to"' });
    }

    await kv.set(normalizedOrigin, { service, apiKey, from, ...(to !== undefined ? { to } : {}) });
    return json(201, { message: `Config saved for ${normalizedOrigin}` });
  }

  // ─── Admin: DELETE /config/:key ──────────────────────────────────────────────
  if (url.pathname.startsWith('/config/') && method === 'DELETE') {
    if (!hasBearerToken(request, adminSecret)) return text(401, 'Unauthorized');

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
