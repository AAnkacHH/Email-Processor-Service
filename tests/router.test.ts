import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { KVStore } from '../src/kv-interface.js';
import type { ClientConfig } from '../src/types.js';

// Mock sendEmail — still an internal call inside the router
vi.mock('../src/providers/index.js', () => ({
  sendEmail: vi.fn(),
}));

import { sendEmail } from '../src/providers/index.js';
import { handleRequest } from '../src/router.js';

// ── Test helpers ─────────────────────────────────────────────────────────────

const ADMIN_SECRET = 'test-secret';

/** Create a mock KVStore pre-populated with the given store state */
function makeMockKv(store: Record<string, unknown> = {}): KVStore {
  const data = { ...store };
  return {
    get: vi.fn(async (key) => (data[key] as unknown) ?? null),
    set: vi.fn(async (key, value) => {
      data[key] = value;
    }),
    del: vi.fn(async (key) => {
      if (!(key in data)) return false;
      delete data[key];
      return true;
    }),
    list: vi.fn(async () => ({ ...data })),
  };
}

/** Build a Web API Request */
function makeReq(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { host: 'localhost:3000', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const baseConfig: ClientConfig = { service: 'resend', apiKey: 're_key', from: 'a@b.com' };

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Router — POST /send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when origin is not in KV', async () => {
    const kv = makeMockKv();
    const req = makeReq('POST', '/send', { origin: 'https://evil.com' }, {});
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Forbidden');
  });

  it('returns 403 when no origin header', async () => {
    const kv = makeMockKv();
    const req = makeReq('POST', '/send', {});
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(403);
  });

  it('returns 200 and CORS header for allowed origin', async () => {
    const kv = makeMockKv({ 'https://ankach.com': baseConfig });
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: { id: '1' } });

    const req = makeReq(
      'POST',
      '/send',
      { origin: 'https://ankach.com', 'content-type': 'application/json' },
      { to: 'user@example.com', subject: 'Hi', html: '<b>hi</b>' },
    );
    const res = await handleRequest(req, kv, ADMIN_SECRET);

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://ankach.com');
    expect(sendEmail).toHaveBeenCalledWith(baseConfig, expect.objectContaining({ to: 'user@example.com' }));
  });

  it('returns 200 on OPTIONS preflight for allowed origin', async () => {
    const kv = makeMockKv({ 'https://ankach.com': baseConfig });
    const req = makeReq('OPTIONS', '/send', { origin: 'https://ankach.com' });
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://ankach.com');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST');
  });

  it('returns 400 when body is missing required fields', async () => {
    const kv = makeMockKv({ 'https://ankach.com': baseConfig });
    const req = makeReq(
      'POST',
      '/send',
      { origin: 'https://ankach.com' },
      { to: 'user@example.com' }, // missing subject + html
    );
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email address in "to"', async () => {
    const kv = makeMockKv({ 'https://ankach.com': baseConfig });
    const req = makeReq(
      'POST',
      '/send',
      { origin: 'https://ankach.com' },
      { to: 'not-an-email', subject: 'Hi', html: '<b>x</b>' },
    );
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Invalid email');
  });

  it('returns 405 for GET on /send with known origin', async () => {
    const kv = makeMockKv({ 'https://ankach.com': baseConfig });
    const req = makeReq('GET', '/send', { origin: 'https://ankach.com' });
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(405);
  });

  it('returns 502 when provider fails', async () => {
    const kv = makeMockKv({ 'https://ankach.com': baseConfig });
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error: 'Bad key' });

    const req = makeReq(
      'POST',
      '/send',
      { origin: 'https://ankach.com' },
      { to: 'u@e.com', subject: 'Hi', html: '<b>x</b>' },
    );
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(502);
  });
});

describe('Router — Admin /config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /config returns 401 without auth', async () => {
    const kv = makeMockKv();
    const req = makeReq('GET', '/config');
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(401);
  });

  it('GET /config returns all configs (with masked apiKeys)', async () => {
    const kv = makeMockKv({
      'https://ankach.com': { service: 'resend', apiKey: 're_live_xxx', from: 'a@b.com' },
    });
    const req = makeReq('GET', '/config', { authorization: `Bearer ${ADMIN_SECRET}` });
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, { apiKey: string }>;
    expect(body).toHaveProperty('https://ankach.com');
    // apiKey should be masked
    expect(body['https://ankach.com'].apiKey).toMatch(/\.\.\./);
  });

  it('POST /config saves a new client', async () => {
    const kv = makeMockKv();
    const req = makeReq(
      'POST',
      '/config',
      { authorization: `Bearer ${ADMIN_SECRET}` },
      { origin: 'https://ankach.com', service: 'resend', apiKey: 're_key', from: 'a@b.com' },
    );
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(201);
    expect(kv.set).toHaveBeenCalledWith('https://ankach.com', {
      service: 'resend',
      apiKey: 're_key',
      from: 'a@b.com',
    });
  });

  it('POST /config returns 400 for missing fields', async () => {
    const kv = makeMockKv();
    const req = makeReq(
      'POST',
      '/config',
      { authorization: `Bearer ${ADMIN_SECRET}` },
      { origin: 'https://ankach.com' }, // missing service, apiKey, from
    );
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(400);
  });

  it('POST /config returns 400 for invalid email in "from"', async () => {
    const kv = makeMockKv();
    const req = makeReq(
      'POST',
      '/config',
      { authorization: `Bearer ${ADMIN_SECRET}` },
      { origin: 'https://ankach.com', service: 'resend', apiKey: 'key', from: 'not-an-email' },
    );
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Invalid email address in "from"');
  });

  it('DELETE /config/:key removes a client', async () => {
    const kv = makeMockKv({ 'https://ankach.com': baseConfig });
    const req = makeReq('DELETE', '/config/https%3A%2F%2Fankach.com', {
      authorization: `Bearer ${ADMIN_SECRET}`,
    });
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(200);
    expect(kv.del).toHaveBeenCalledWith('https://ankach.com');
  });

  it('DELETE /config/:key returns 404 for unknown key', async () => {
    const kv = makeMockKv();
    const req = makeReq('DELETE', '/config/https%3A%2F%2Funknown.com', {
      authorization: `Bearer ${ADMIN_SECRET}`,
    });
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(404);
  });
});

describe('Router — misc', () => {
  it('returns 404 for unknown routes', async () => {
    const kv = makeMockKv();
    const req = makeReq('GET', '/unknown-path');
    const res = await handleRequest(req, kv, ADMIN_SECRET);
    expect(res.status).toBe(404);
  });
});
