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

## Test Results

```
 ✓  tests/kv.test.ts                  (5 tests)
 ✓  tests/providers.resend.test.ts    (3 tests)
 ✓  tests/providers.sendgrid.test.ts  (4 tests)
 ✓  tests/providers.index.test.ts     (2 tests)
 ✓  tests/router.test.ts             (11 tests)

 Test Files  5 passed (5)
       Tests  25 passed (25)
    Duration  ~220ms
```

---

## Test Architecture

Each module is tested in isolation using mocks. No real network requests are made, no files are written to disk.

```
tests/
├── kv.test.ts                  ← unit: file system mocked via vi.mock('node:fs')
├── providers.resend.test.ts    ← unit: global fetch mocked via vi.stubGlobal
├── providers.sendgrid.test.ts  ← unit: global fetch mocked via vi.stubGlobal
├── providers.index.test.ts     ← unit: provider modules mocked via vi.mock(...)
└── router.test.ts              ← integration: kv + providers mocked, no server started
```

---

## `kv.test.ts` — KV Store

**Strategy:** Mock `node:fs` entirely. The store lives in memory during the test.

```ts
vi.mock('node:fs', async () => {
  const store: Record<string, string> = {};
  return {
    default: {
      existsSync: vi.fn((p) => p in store),
      readFileSync: vi.fn((p) => store[p] ?? '{}'),
      writeFileSync: vi.fn((p, data) => {
        store[p] = data;
      }),
      mkdirSync: vi.fn(),
    },
    // named exports too...
  };
});
```

**What's tested:**

| Test                               | Scenario                      |
| ---------------------------------- | ----------------------------- |
| Returns `null` for missing key     | Empty store                   |
| Sets and gets a value              | File written and read back    |
| Deletes an existing key            | Key removed, file rewritten   |
| Returns `false` for missing delete | No write if key doesn't exist |
| Lists all entries                  | Returns full store contents   |

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
| Sends successfully                  | 202 response → `{ message: "Email queued" }` |
| Single recipient format             | `to` string → `[{ email }]` personalization  |
| Multiple recipients                 | `to` array → multi-entry personalization     |
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
| Dispatches to Resend   | `config.service === 'resend'` → calls `sendViaResend`     |
| Dispatches to SendGrid | `config.service === 'sendgrid'` → calls `sendViaSendgrid` |

---

## `router.test.ts` — HTTP Router (Integration)

**Strategy:** Mock both `kv.ts` and `providers/index.ts`. Simulate HTTP requests without starting a real server by calling `handleRequest()` directly with fake `IncomingMessage` and `ServerResponse` objects.

```ts
vi.mock('../src/kv.js', () => ({
  kvGet: vi.fn(),
  kvSet: vi.fn(),
  kvDel: vi.fn(),
  kvList: vi.fn(),
}));

vi.mock('../src/providers/index.js', () => ({
  sendEmail: vi.fn(),
}));
```

**Fake request/response helpers:**

```ts
// Simulates IncomingMessage — emits body chunks immediately on `.on('data')`
function makeReq(method, path, headers, body): IncomingMessage { ... }

// Captures writeHead() and end() calls for assertions
function makeRes(): { res, code(), body(), headers() } { ... }
```

**What's tested:**

| Suite            | Test                  | Scenario                          |
| ---------------- | --------------------- | --------------------------------- |
| `/send`          | 403 Forbidden         | Origin not in KV                  |
| `/send`          | 200 + CORS header     | Valid origin, email sent          |
| `/send`          | 200 OPTIONS preflight | CORS headers returned             |
| `/send`          | 400 missing fields    | `to`/`subject`/`html` absent      |
| `/send`          | 502 provider error    | Provider returns `success: false` |
| `/config GET`    | 401 Unauthorized      | Missing/wrong bearer token        |
| `/config GET`    | 200 list              | Returns all KV entries            |
| `/config POST`   | 201 created           | Calls `kvSet` with correct args   |
| `/config POST`   | 400 validation        | Missing required fields           |
| `/config DELETE` | 200 deleted           | Calls `kvDel`, returns success    |
| `/config DELETE` | 404 not found         | `kvDel` returns `false`           |

---

## Key Design Decisions

### Why `process.env` is read lazily

`router.ts` reads `ADMIN_SECRET` inside `isAdmin()` at call time, not at module import time:

```ts
function isAdmin(req: IncomingMessage): boolean {
  const secret = process.env.ADMIN_SECRET ?? 'change-me';
  // ...
}
```

This ensures tests can set `process.env.ADMIN_SECRET = 'test-secret'` in `beforeEach` and have it take effect without re-importing the module.

### Why no real HTTP server in tests

`handleRequest()` is exported and called directly. This avoids port conflicts, OS-level setup, and makes tests run in ~220ms total. The server startup code in `index.ts` is intentionally thin and not tested separately.

---

## Coverage

```bash
npm run test:coverage
```

Coverage is collected via **V8** (`@vitest/coverage-v8`). A `coverage/` report is generated in HTML and text format. The `coverage/` directory is gitignored.
