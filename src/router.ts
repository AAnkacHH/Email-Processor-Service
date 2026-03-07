import type { IncomingMessage, ServerResponse } from 'node:http';
import { kvGet, kvSet, kvDel, kvList } from './kv.js';
import { sendEmail } from './providers/index.js';
import type { ClientConfig, EmailPayload } from './types.js';

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function text(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(body);
}

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
      if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function isAdmin(req: IncomingMessage): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error('ADMIN_SECRET environment variable is not set');
  }
  const auth = req.headers['authorization'] ?? '';
  return auth === `Bearer ${secret}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskConfigs(store: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(store).map(([origin, cfg]) => {
      const c = cfg as { apiKey?: string };
      if (!c?.apiKey) return [origin, cfg];
      return [origin, { ...c, apiKey: `${c.apiKey.slice(0, 6)}...` }];
    }),
  );
}

function getCorsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin) return {};
  const config = kvGet<ClientConfig>(origin);
  if (!config) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const method = req.method ?? 'GET';
  const origin = req.headers['origin'];

  // ─── POST /send ───────────────────────────────────────────────────────────
  if (url.pathname === '/send') {
    const corsHeaders = getCorsHeaders(origin);

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(200, corsHeaders);
      res.end();
      return;
    }

    if (!origin || !kvGet<ClientConfig>(origin)) {
      text(res, 403, 'Forbidden');
      return;
    }

    if (method !== 'POST') {
      text(res, 405, 'Method Not Allowed');
      return;
    }

    let body: EmailPayload;
    try {
      body = (await readBody(req)) as EmailPayload;
    } catch (err) {
      const tooLarge = err instanceof Error && err.message === 'Payload too large';
      json(res, tooLarge ? 413 : 400, { error: tooLarge ? 'Request entity too large' : 'Invalid JSON body' });
      return;
    }

    if (!body.to || !body.subject || !body.html) {
      json(res, 400, { error: 'Missing required fields: to, subject, html' });
      return;
    }

    const recipients = Array.isArray(body.to) ? body.to : [body.to];
    if (!recipients.every((e) => EMAIL_RE.test(e))) {
      json(res, 400, { error: 'Invalid email address in "to"' });
      return;
    }

    const config = kvGet<ClientConfig>(origin)!;
    const result = await sendEmail(config, body);

    res.writeHead(result.success ? 200 : 502, {
      ...corsHeaders,
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(result));
    return;
  }

  // ─── Admin: GET /config ────────────────────────────────────────────────────
  if (url.pathname === '/config' && method === 'GET') {
    if (!isAdmin(req)) {
      text(res, 401, 'Unauthorized');
      return;
    }
    json(res, 200, maskConfigs(kvList()));
    return;
  }

  // ─── Admin: POST /config ───────────────────────────────────────────────────
  if (url.pathname === '/config' && method === 'POST') {
    if (!isAdmin(req)) {
      text(res, 401, 'Unauthorized');
      return;
    }

    let body: { origin: string } & ClientConfig;
    try {
      body = (await readBody(req)) as { origin: string } & ClientConfig;
    } catch {
      json(res, 400, { error: 'Invalid JSON body' });
      return;
    }

    const { origin: clientOrigin, service, apiKey, from } = body;

    if (!clientOrigin || !service || !apiKey || !from) {
      json(res, 400, { error: 'Missing fields: origin, service, apiKey, from' });
      return;
    }

    kvSet(clientOrigin, { service, apiKey, from });
    json(res, 201, { message: `Config saved for ${clientOrigin}` });
    return;
  }

  // ─── Admin: DELETE /config/:key ────────────────────────────────────────────
  if (url.pathname.startsWith('/config/') && method === 'DELETE') {
    if (!isAdmin(req)) {
      text(res, 401, 'Unauthorized');
      return;
    }

    const key = decodeURIComponent(url.pathname.replace('/config/', ''));
    const deleted = kvDel(key);

    if (!deleted) {
      json(res, 404, { error: `No config found for: ${key}` });
      return;
    }

    json(res, 200, { message: `Deleted config for ${key}` });
    return;
  }

  // ─── 404 ───────────────────────────────────────────────────────────────────
  text(res, 404, 'Not Found');
}
