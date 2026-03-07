import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ClientConfig } from '../src/types.js';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../src/kv.js', () => ({
  kvGet: vi.fn(),
  kvSet: vi.fn(),
  kvDel: vi.fn(),
  kvList: vi.fn(),
}));

vi.mock('../src/providers/index.js', () => ({
  sendEmail: vi.fn(),
}));

import { kvGet, kvSet, kvDel, kvList } from '../src/kv.js';
import { sendEmail } from '../src/providers/index.js';
import { handleRequest } from '../src/router.js';

// ── Test helpers ───────────────────────────────────────────────────────────

const ADMIN_SECRET = 'test-secret';

function makeReq(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): IncomingMessage {
  const events: Record<string, ((...args: unknown[]) => void)[]> = {};
  const req = {
    method,
    url: path,
    headers: { host: 'localhost:3000', ...headers },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      events[event] ??= [];
      events[event].push(cb);
      // Emit body immediately after registration
      if (event === 'data' && body !== undefined) {
        cb(Buffer.from(JSON.stringify(body)));
      }
      if (event === 'end') {
        cb();
      }
    }),
  } as unknown as IncomingMessage;
  return req;
}

function makeRes(): {
  res: ServerResponse;
  code: () => number;
  body: () => string;
  headers: () => Record<string, string>;
} {
  let statusCode = 200;
  const responseHeaders: Record<string, string> = {};
  const chunks: string[] = [];

  const res = {
    writeHead: vi.fn((code: number, hdrs: Record<string, string> = {}) => {
      statusCode = code;
      Object.assign(responseHeaders, hdrs);
    }),
    end: vi.fn((data?: string) => {
      if (data) chunks.push(data);
    }),
  } as unknown as ServerResponse;

  return {
    res,
    code: () => statusCode,
    body: () => chunks.join(''),
    headers: () => responseHeaders,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Router — POST /send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = ADMIN_SECRET;
  });

  it('returns 403 when origin is not in KV', async () => {
    (kvGet as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const req = makeReq('POST', '/send', { origin: 'https://evil.com' }, {});
    const { res, code, body } = makeRes();

    await handleRequest(req, res);

    expect(code()).toBe(403);
    expect(body()).toBe('Forbidden');
  });

  it('returns 200 and CORS header for allowed origin', async () => {
    const config: ClientConfig = { service: 'resend', apiKey: 're_key', from: 'a@b.com' };
    (kvGet as ReturnType<typeof vi.fn>).mockReturnValue(config);
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: { id: '1' } });

    const req = makeReq(
      'POST',
      '/send',
      { origin: 'https://ankach.com', 'content-type': 'application/json' },
      { to: 'user@example.com', subject: 'Hi', html: '<b>hi</b>' },
    );
    const { res, code, headers } = makeRes();

    await handleRequest(req, res);

    expect(code()).toBe(200);
    expect(headers()['Access-Control-Allow-Origin']).toBe('https://ankach.com');
    expect(sendEmail).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ to: 'user@example.com' }),
    );
  });

  it('returns 200 on OPTIONS preflight for allowed origin', async () => {
    (kvGet as ReturnType<typeof vi.fn>).mockReturnValue({
      service: 'resend',
      apiKey: 're_key',
      from: 'a@b.com',
    });

    const req = makeReq('OPTIONS', '/send', { origin: 'https://ankach.com' });
    const { res, code, headers } = makeRes();

    await handleRequest(req, res);

    expect(code()).toBe(200);
    expect(headers()['Access-Control-Allow-Origin']).toBe('https://ankach.com');
    expect(headers()['Access-Control-Allow-Methods']).toBe('POST');
  });

  it('returns 400 when body is missing required fields', async () => {
    (kvGet as ReturnType<typeof vi.fn>).mockReturnValue({
      service: 'resend',
      apiKey: 're_key',
      from: 'a@b.com',
    });

    const req = makeReq(
      'POST',
      '/send',
      { origin: 'https://ankach.com' },
      { to: 'user@example.com' }, // missing subject + html
    );
    const { res, code } = makeRes();

    await handleRequest(req, res);

    expect(code()).toBe(400);
  });

  it('returns 502 when provider fails', async () => {
    (kvGet as ReturnType<typeof vi.fn>).mockReturnValue({
      service: 'resend',
      apiKey: 're_key',
      from: 'a@b.com',
    });
    (sendEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error: 'Bad key' });

    const req = makeReq(
      'POST',
      '/send',
      { origin: 'https://ankach.com' },
      { to: 'u@e.com', subject: 'Hi', html: '<b>x</b>' },
    );
    const { res, code } = makeRes();

    await handleRequest(req, res);

    expect(code()).toBe(502);
  });
});

describe('Router — Admin /config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = ADMIN_SECRET;
  });

  it('GET /config returns 401 without auth', async () => {
    const req = makeReq('GET', '/config');
    const { res, code } = makeRes();
    await handleRequest(req, res);
    expect(code()).toBe(401);
  });

  it('GET /config returns all configs', async () => {
    (kvList as ReturnType<typeof vi.fn>).mockReturnValue({
      'https://ankach.com': { service: 'resend' },
    });
    const req = makeReq('GET', '/config', { authorization: `Bearer ${ADMIN_SECRET}` });
    const { res, code, body } = makeRes();

    await handleRequest(req, res);

    expect(code()).toBe(200);
    expect(JSON.parse(body())).toHaveProperty('https://ankach.com');
  });

  it('POST /config saves a new client', async () => {
    const req = makeReq(
      'POST',
      '/config',
      { authorization: `Bearer ${ADMIN_SECRET}` },
      { origin: 'https://ankach.com', service: 'resend', apiKey: 're_key', from: 'a@b.com' },
    );
    const { res, code } = makeRes();

    await handleRequest(req, res);

    expect(code()).toBe(201);
    expect(kvSet).toHaveBeenCalledWith('https://ankach.com', {
      service: 'resend',
      apiKey: 're_key',
      from: 'a@b.com',
    });
  });

  it('POST /config returns 400 for missing fields', async () => {
    const req = makeReq(
      'POST',
      '/config',
      { authorization: `Bearer ${ADMIN_SECRET}` },
      { origin: 'https://ankach.com' }, // missing service, apiKey, from
    );
    const { res, code } = makeRes();

    await handleRequest(req, res);

    expect(code()).toBe(400);
  });

  it('DELETE /config/:key removes a client', async () => {
    (kvDel as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const req = makeReq('DELETE', '/config/https%3A%2F%2Fankach.com', {
      authorization: `Bearer ${ADMIN_SECRET}`,
    });
    const { res, code } = makeRes();

    await handleRequest(req, res);

    expect(code()).toBe(200);
    expect(kvDel).toHaveBeenCalledWith('https://ankach.com');
  });

  it('DELETE /config/:key returns 404 for unknown key', async () => {
    (kvDel as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const req = makeReq('DELETE', '/config/https%3A%2F%2Funknown.com', {
      authorization: `Bearer ${ADMIN_SECRET}`,
    });
    const { res, code } = makeRes();

    await handleRequest(req, res);

    expect(code()).toBe(404);
  });
});
