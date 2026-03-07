<div align="center">

# ✉️ Email Processor

**A lightweight, self-hosted Node.js email proxy service.**  
Route emails from multiple client origins to different providers — Resend, SendGrid, and more.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Vitest](https://img.shields.io/badge/Tested_with-Vitest-6E9F18?logo=vitest&logoColor=white)
![ESLint](https://img.shields.io/badge/ESLint-Flat_Config-4B32C3?logo=eslint&logoColor=white)
![Prettier](https://img.shields.io/badge/Prettier-3.x-F7B93E?logo=prettier&logoColor=black)
![Zero Dependencies](https://img.shields.io/badge/Runtime_Dependencies-0-brightgreen)

</div>

---

## What Is This?

Email Processor is a **zero-dependency** HTTP service that acts as an email gateway for multiple websites. Each origin (domain) is mapped to its own email provider and API key. No secret API keys in your frontend — just your origin URL.

**Designed as a self-hosted alternative to Cloudflare Email Workers.**

---

## Features

- 🔒 **Origin-gated sending** — only configured domains can send emails
- 🔁 **Multi-provider support** — Resend and SendGrid out of the box
- 🗄️ **File-based KV store** — zero setup, swappable for Redis
- 🛡️ **Admin REST API** — manage client configs at runtime
- ⚡ **Zero runtime dependencies** — built-in Node.js `fetch` (Node 18+)
- 🧪 **25 tests** — full mock coverage via Vitest
- 🎨 **ESLint + Prettier** — consistent code style enforced

---

## Quick Start

```bash
git clone https://github.com/your-username/email-processor.git
cd email-processor
npm install
cp .env.example .env   # set PORT and ADMIN_SECRET
npm run dev
```

### Add your first client

```bash
curl -X POST http://localhost:3000/config \
  -H "Authorization: Bearer mysecret" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "https://yoursite.com",
    "service": "resend",
    "apiKey": "re_YOUR_KEY",
    "from": "noreply@yoursite.com"
  }'
```

### Send an email from your website

```js
await fetch('https://your-service.com/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: 'user@example.com',
    subject: 'Hello!',
    html: '<p>Message from your site</p>',
  }),
});
```

---

## Project Structure

```
email-processor/
├── src/
│   ├── index.ts              # HTTP server entry point
│   ├── router.ts             # Route handlers (/send, /config)
│   ├── kv.ts                 # File-based KV store
│   ├── types.ts              # Shared TypeScript types
│   └── providers/
│       ├── index.ts          # Provider dispatcher
│       ├── resend.ts         # Resend adapter
│       └── sendgrid.ts       # SendGrid adapter
├── tests/                    # Vitest test suite (25 tests)
├── docs/                     # Extended documentation
├── data/                     # Runtime config — auto-created, gitignored
└── .env.example
```

---

## Documentation

| Document                               | Description                                  |
| -------------------------------------- | -------------------------------------------- |
| [API Reference](docs/api.md)           | All HTTP endpoints, request/response schemas |
| [Configuration](docs/configuration.md) | Env vars, KV store, migrating to Redis       |
| [Providers](docs/providers.md)         | Supported providers and how to add new ones  |
| [Testing](docs/testing.md)             | Test structure, mocks, coverage, how to run  |
| [Contributing](docs/contributing.md)   | Dev workflow, scripts, code style            |

---

## Roadmap

- [ ] Redis KV adapter
- [ ] Request logging middleware
- [ ] Rate limiting per origin
- [ ] Admin UI (web interface)
- [ ] Docker / Docker Compose setup

---

## License

MIT
