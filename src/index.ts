import http from 'node:http';
import { FileKVStore } from './kv.js';
import { InMemoryRateLimiter } from './rate-limiter.js';
import { handleRequest } from './router.js';

// ─── Startup guard ────────────────────────────────────────────────────────────
if (!process.env.ADMIN_SECRET) {
  console.error('FATAL: ADMIN_SECRET environment variable is required');
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

// Singleton KV store for the process lifetime
const kv = new FileKVStore();
const rateLimiter = new InMemoryRateLimiter(5); // 5 emails/hour/origin

/**
 * Converts a Node.js IncomingMessage to a Web API Request.
 * Enforces the body size limit before the body reaches the router.
 */
async function nodeReqToWebRequest(req: http.IncomingMessage): Promise<Request> {
  const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val !== undefined) {
      headers.set(key, Array.isArray(val) ? val.join(', ') : val);
    }
  }

  // Read body for methods that have one
  let body: Buffer | null = null;
  const methodHasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  if (methodHasBody) {
    body = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          req.destroy();
          reject(new Error('Payload too large'));
        } else {
          chunks.push(chunk);
        }
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  return new Request(url, {
    method: req.method,
    headers,
    body: body !== null ? new Uint8Array(body) : undefined,
  });
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // Structured access logging on every response
  res.on('finish', () => {
    const pathname = new URL(req.url ?? '/', `http://${req.headers.host}`).pathname;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        method: req.method,
        path: pathname,
        origin: req.headers['origin'] ?? '-',
        status: res.statusCode,
      }),
    );
  });

  try {
    let webRequest: Request;
    try {
      webRequest = await nodeReqToWebRequest(req);
    } catch (err) {
      const tooLarge = err instanceof Error && err.message === 'Payload too large';
      res.writeHead(tooLarge ? 413 : 400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: tooLarge ? 'Request entity too large' : 'Bad request' }),
      );
      return;
    }

    // Delegate to the platform-agnostic router
    const webResponse = await handleRequest(webRequest, kv, ADMIN_SECRET!, rateLimiter);

    // Convert Web Response → Node.js ServerResponse
    const responseHeaders: Record<string, string> = {};
    webResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    res.writeHead(webResponse.status, responseHeaders);
    const buffer = await webResponse.arrayBuffer();
    res.end(Buffer.from(buffer));
  } catch (err) {
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }
});

server.listen(PORT, () => {
  console.log(`✉️  Email Processor running on http://localhost:${PORT}`);
  console.log(`   POST /send          — send email (origin-gated)`);
  console.log(`   GET  /config        — list client configs (admin)`);
  console.log(`   POST /config        — add/update client config (admin)`);
  console.log(`   DEL  /config/:key   — remove client config (admin)`);
});
