# Email Processor

A lightweight Node.js (TypeScript) email proxy service. Routes emails from multiple client origins to different email providers (Resend, SendGrid) based on per-origin configuration stored in a JSON file.

## Requirements

- Node.js 18+
- A Resend or SendGrid API key

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env
# Edit .env: set PORT and ADMIN_SECRET

# 3. Run in dev mode (with hot reload)
npm run dev
```

## Environment Variables

| Variable       | Default     | Description                |
| -------------- | ----------- | -------------------------- |
| `PORT`         | `3000`      | HTTP port                  |
| `ADMIN_SECRET` | `change-me` | Bearer token for admin API |

## API

### `POST /send`

Send an email. The `Origin` header must match a configured client.

**Headers:** `Origin: https://yourdomain.com`, `Content-Type: application/json`

```json
{
  "to": "recipient@example.com",
  "subject": "Hello",
  "html": "<b>Hello world</b>",
  "from": "optional-override@yourdomain.com"
}
```

---

### Admin API (requires `Authorization: Bearer <ADMIN_SECRET>`)

#### `POST /config` — Add or update a client

```bash
curl -X POST http://localhost:3000/config \
  -H "Authorization: Bearer mysecret" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "https://ankach.com",
    "service": "resend",
    "apiKey": "re_YOUR_KEY",
    "from": "noreply@ankach.com"
  }'
```

#### `GET /config` — List all clients

```bash
curl http://localhost:3000/config \
  -H "Authorization: Bearer mysecret"
```

#### `DELETE /config/:origin` — Remove a client

```bash
curl -X DELETE "http://localhost:3000/config/https%3A%2F%2Fankach.com" \
  -H "Authorization: Bearer mysecret"
```

## Supported Providers

| `service` value | Provider                         |
| --------------- | -------------------------------- |
| `resend`        | [Resend](https://resend.com)     |
| `sendgrid`      | [SendGrid](https://sendgrid.com) |

## Adding a New Provider

1. Create `src/providers/myprovider.ts` implementing `sendViaMyProvider(config, payload): Promise<SendResult>`
2. Add `'myprovider'` to the `ClientConfig.service` union in `src/types.ts`
3. Add a `case 'myprovider'` in `src/providers/index.ts`

## Project Structure

```
src/
  index.ts          — HTTP server entry point
  router.ts         — Request routing and handlers
  kv.ts             — File-based key-value store (data/config.json)
  types.ts          — Shared TypeScript types
  providers/
    index.ts        — Provider dispatcher
    resend.ts       — Resend adapter
    sendgrid.ts     — SendGrid adapter
data/
  config.json       — Client configs (auto-created, gitignored)
```

## Future: Migrating to Redis

Replace `src/kv.ts` with a Redis-backed implementation. The interface (`kvGet`, `kvSet`, `kvDel`, `kvList`) stays the same — no other files need to change.
