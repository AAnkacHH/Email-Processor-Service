# Configuration

---

## Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
```

| Variable       | Default     | Description                                     |
| -------------- | ----------- | ----------------------------------------------- |
| `PORT`         | `3000`      | HTTP port to listen on                          |
| `ADMIN_SECRET` | `change-me` | Bearer token protecting the `/config` admin API |

> ⚠️ Always set a strong `ADMIN_SECRET` in production. The default value is intentionally insecure.

---

## Client Configuration (KV Store)

Client configs are stored as key-value pairs where **key = origin URL** and **value = provider config**.

### Schema

```ts
interface ClientConfig {
  service: 'resend' | 'sendgrid';
  apiKey: string;
  from: string;
}
```

### Example

```json
{
  "https://ankach.com": {
    "service": "resend",
    "apiKey": "re_abc123",
    "from": "noreply@ankach.com"
  },
  "https://lugixbox.cz": {
    "service": "sendgrid",
    "apiKey": "sg_xyz456",
    "from": "info@lugixbox.cz"
  }
}
```

---

## Storage Backend: JSON File

By default, configs are stored in `data/config.json` — created automatically on the first write.

```
data/
└── config.json   ← auto-created, gitignored
```

The file is read on every request (lightweight for a small number of clients). This is the `src/kv.ts` module.

**Pros:**

- Zero setup — just run `npm run dev`
- Human-readable, easy to edit manually
- No external services needed

**Cons:**

- Not suitable for concurrent high-frequency writes
- Single-server only

---

## Migrating to Redis

The KV interface is isolated to a single file — `src/kv.ts`. To switch backends, only this file needs to change. All routes and providers remain untouched.

### Current interface

```ts
kvGet<T>(key: string): T | null
kvSet(key: string, value: unknown): void
kvDel(key: string): boolean
kvList(): Record<string, unknown>
```

### Redis implementation example

```ts
// src/kv.ts (Redis version)
import { createClient } from 'redis';

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

export async function kvGet<T>(key: string): Promise<T | null> {
  const val = await client.get(key);
  return val ? JSON.parse(val) : null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await client.set(key, JSON.stringify(value));
}

export async function kvDel(key: string): Promise<boolean> {
  const count = await client.del(key);
  return count > 0;
}

export async function kvList(): Promise<Record<string, unknown>> {
  const keys = await client.keys('*');
  const entries = await Promise.all(
    keys.map(async (k) => [k, JSON.parse((await client.get(k))!)] as const),
  );
  return Object.fromEntries(entries);
}
```

> Note: switching to an async KV store requires updating function signatures throughout `router.ts` to use `await`. The current sync interface was chosen for simplicity.

### SQLite alternative

For a middle ground — persistent storage without a separate server — consider `better-sqlite3`:

```ts
import Database from 'better-sqlite3';
const db = new Database('data/config.db');
db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)');

export function kvGet<T>(key: string): T | null {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? JSON.parse(row.value) : null;
}
// ...
```
