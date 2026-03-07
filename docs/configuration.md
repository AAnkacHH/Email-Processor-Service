# Configuration

---

## Deployment Options

Email Processor runs on two platforms with the same core router:

| Platform             | KV Backend        | Entry Point     | Config Storage                |
| -------------------- | ----------------- | --------------- | ----------------------------- |
| **Node.js**          | `FileKVStore`     | `src/index.ts`  | `data/config.json` (on disk) |
| **Cloudflare Workers** | `CloudflareKVStore` | `src/worker.ts` | Cloudflare KV namespace       |

---

## Node.js Configuration

### Environment Variables

Create a `.env` file from the example:

```bash
cp .env.example .env
```

| Variable       | Default     | Description                                     |
| -------------- | ----------- | ----------------------------------------------- |
| `PORT`         | `3000`      | HTTP port to listen on                          |
| `ADMIN_SECRET` | _(required)_ | Bearer token protecting the `/config` admin API |

> The server will refuse to start without `ADMIN_SECRET` set.

### Storage: FileKVStore

By default, configs are stored in `data/config.json` — created automatically on the first write.

```
data/
└── config.json   ← auto-created, gitignored
```

The file is read once per process lifetime (cached in memory). Writes are atomic via temp-file + rename.

**Pros:**

- Zero setup — just run `npm run dev`
- Human-readable, easy to edit manually
- No external services needed

**Cons:**

- Not suitable for concurrent high-frequency writes
- Single-server only

---

## Cloudflare Workers Configuration

### wrangler.toml

```toml
name = "email-processor"
main = "src/worker.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "EMAIL_CONFIG"
id = "YOUR_KV_NAMESPACE_ID"
preview_id = "YOUR_PREVIEW_KV_NAMESPACE_ID"
```

### Setup steps

1. **Create the KV namespace:**

   ```bash
   wrangler kv:namespace create EMAIL_CONFIG
   ```

2. **Paste the returned ID** into `wrangler.toml` (`id` field).

3. **Set the admin secret:**

   ```bash
   wrangler secret put ADMIN_SECRET
   ```

4. **Deploy:**

   ```bash
   npm run deploy:worker
   ```

### Storage: CloudflareKVStore

Each client config is stored as a separate key in the Cloudflare KV namespace. The key is the origin URL, the value is the JSON-serialized `ClientConfig`.

---

## Client Configuration

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

## KVStore Interface

Both backends implement the same interface (`src/kv-interface.ts`):

```ts
interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<boolean>;
  list(): Promise<Record<string, unknown>>;
}
```

The router (`src/router.ts`) depends only on this interface, making it platform-agnostic.

---

## Custom KV Backend

To add a custom backend (e.g. Redis, SQLite), create a class implementing `KVStore`:

### Redis example

```ts
import { createClient } from 'redis';
import type { KVStore } from './kv-interface.js';

export class RedisKVStore implements KVStore {
  private client;

  constructor(url: string) {
    this.client = createClient({ url });
  }

  async connect() {
    await this.client.connect();
  }

  async get<T>(key: string): Promise<T | null> {
    const val = await this.client.get(key);
    return val ? JSON.parse(val) : null;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.client.set(key, JSON.stringify(value));
  }

  async del(key: string): Promise<boolean> {
    const count = await this.client.del(key);
    return count > 0;
  }

  async list(): Promise<Record<string, unknown>> {
    const keys = await this.client.keys('*');
    const entries = await Promise.all(
      keys.map(async (k) => [k, JSON.parse((await this.client.get(k))!)] as const),
    );
    return Object.fromEntries(entries);
  }
}
```

Then pass it to `handleRequest()` in your entry point — the router and providers remain unchanged.
