# Testing

The test suite uses **[Vitest](https://vitest.dev)** — a fast, TypeScript-native test runner with built-in mocking via `vi`.

---

## Running Tests

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# With coverage report
npm run test:coverage
```

---

## Test Architecture

Each module is tested in isolation using mocks. No real network requests are made, no files are written to disk. The router tests use Web API `Request`/`Response` directly — no HTTP server is started.

```
tests/
├── kv.test.ts                  ← unit: file system mocked via vi.mock('node:fs')
├── providers.resend.test.ts    ← unit: global fetch mocked via vi.stubGlobal
├── providers.sendgrid.test.ts  ← unit: global fetch mocked via vi.stubGlobal
├── providers.index.test.ts     ← unit: provider modules mocked via vi.mock(...)
└── router.test.ts              ← integration: KVStore mocked, Web API Request/Response
```

---

## `kv.test.ts` — FileKVStore

**Strategy:** Mock `node:fs` entirely. Each test creates a new `FileKVStore` instance with isolated in-memory state.

```ts
vi.mock('node:fs', async () => {
  const store: Record<string, string> = {};
  return {
    default: {
      existsSync: vi.fn((p) => p in store),
      readFileSync: vi.fn((p) => store[p] ?? '{}'),
      writeFileSync: vi.fn((p, data) => { store[p] = data; }),
      mkdirSync: vi.fn(),
      renameSync: vi.fn((src, dest) => { store[dest] = store[src]; delete store[src]; }),
    },
  };
});
```

**What's tested:**

| Test                               | Scenario                            |
| ---------------------------------- | ----------------------------------- |
| Returns `null` for missing key     | Empty store                         |
| Sets and gets a value              | File written and read back          |
| Deletes an existing key            | Key removed, file rewritten         |
| Returns `false` for missing delete | No write if key doesn't exist       |
| Lists all entries                  | Returns full store contents         |
| Atomic write via temp + rename     | Verifies temp file rename to target |

---

## `providers.resend.test.ts` — Resend Adapter

**Strategy:** Mock global `fetch` with `vi.stubGlobal('fetch', vi.fn(...))`.

```ts
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'resend-id-123' }),
  }),
);
```

**What's tested:**

| Test                                        | Scenario                                        |
| ------------------------------------------- | ----------------------------------------------- |
| Sends successfully                          | Verifies URL, Authorization header, body fields |
| Uses `payload.from` when provided           | Overrides config `from` address                 |
| Returns `success: false` on non-ok response | API returns error JSON                          |

---

## `providers.sendgrid.test.ts` — SendGrid Adapter

**Strategy:** Same as Resend — mock global `fetch`. Extra attention given to SendGrid's unique API format.

```ts
// SendGrid returns 202 with no body on success
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 202, json: async () => ({}) }));
```

**What's tested:**

| Test                                | Scenario                                     |
| ----------------------------------- | -------------------------------------------- |
| Sends successfully                  | 202 response -> `{ message: "Email queued" }` |
| Single recipient format             | `to` string -> `[{ email }]` personalization  |
| Multiple recipients                 | `to` array -> multi-entry personalization     |
| Returns `success: false` on non-202 | API key error, bad request, etc.             |

---

## `providers.index.test.ts` — Provider Dispatcher

**Strategy:** Mock both provider modules entirely.

```ts
vi.mock('../src/providers/resend.js', () => ({ sendViaResend: vi.fn() }));
vi.mock('../src/providers/sendgrid.js', () => ({ sendViaSendgrid: vi.fn() }));
```

**What's tested:**

| Test                   | Scenario                                                  |
| ---------------------- | --------------------------------------------------------- |
| Dispatches to Resend   | `config.service === 'resend'` -> calls `sendViaResend`     |
| Dispatches to SendGrid | `config.service === 'sendgrid'` -> calls `sendViaSendgrid` |

---

## `router.test.ts` — HTTP Router (Integration)

**Strategy:** Mock `KVStore` as a plain object and `providers/index.ts`. Tests call `handleRequest()` directly with Web API `Request` objects.

```ts
const mockKV: KVStore = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  list: vi.fn(),
};

vi.mock('../src/providers/index.js', () => ({
  sendEmail: vi.fn(),
}));
```

**Request helpers:**

```ts
// Create a Web Request directly
const req = new Request('http://localhost/send', {
  method: 'POST',
  headers: { Origin: 'https://ankach.com', 'Content-Type': 'application/json' },
  body: JSON.stringify({ to: 'u@e.com', subject: 'Hi', html: '<b>Hi</b>' }),
});

const res = await handleRequest(req, mockKV, 'test-secret');
```

**What's tested:**

| Suite            | Test                  | Scenario                          |
| ---------------- | --------------------- | --------------------------------- |
| `/send`          | 403 Forbidden         | Origin not in KV                  |
| `/send`          | 200 + CORS header     | Valid origin, email sent          |
| `/send`          | 200 OPTIONS preflight | CORS headers returned             |
| `/send`          | 400 missing fields    | `to`/`subject`/`html` absent      |
| `/send`          | 400 invalid email     | Bad email format in `to`          |
| `/send`          | 502 provider error    | Provider returns `success: false` |
| `/config GET`    | 401 Unauthorized      | Missing/wrong bearer token        |
| `/config GET`    | 200 list              | Returns all KV entries (masked)   |
| `/config POST`   | 201 created           | Calls `kv.set` with correct args  |
| `/config POST`   | 400 validation        | Missing required fields           |
| `/config DELETE` | 200 deleted           | Calls `kv.del`, returns success   |
| `/config DELETE` | 404 not found         | `kv.del` returns `false`          |

---

## Key Design Decisions

### Platform-agnostic router

`router.ts` uses Web API `Request` and `Response` exclusively. It receives a `KVStore` interface and `adminSecret` string as arguments, making it testable without any platform-specific setup.

### Why no real HTTP server in tests

`handleRequest()` is called directly with `new Request(...)`. This avoids port conflicts, OS-level setup, and keeps tests fast. The Node.js bridge code in `index.ts` and the Cloudflare Worker code in `worker.ts` are thin wrappers that don't need separate testing.

---

## Coverage

```bash
npm run test:coverage
```

Coverage is collected via **V8** (`@vitest/coverage-v8`). A `coverage/` report is generated in HTML and text format. The `coverage/` directory is gitignored.
