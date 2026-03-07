# Contributing

---

## Development Setup

```bash
git clone https://github.com/your-username/email-processor.git
cd email-processor
npm install
cp .env.example .env
npm run dev
```

The server starts with hot reload at `http://localhost:3000`.

For Cloudflare Workers local development:

```bash
npm run dev:worker
```

---

## Available Scripts

| Command                 | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Start Node.js dev server with hot reload (`tsx watch`) |
| `npm run dev:worker`    | Start Cloudflare Worker locally (`wrangler dev`)     |
| `npm run deploy:worker` | Deploy to Cloudflare Workers (`wrangler deploy`)     |
| `npm run build`         | Compile TypeScript to `dist/`                        |
| `npm start`             | Run compiled production build                        |
| `npm test`              | Run all tests                                        |
| `npm run test:watch`    | Watch mode — re-runs tests on change                 |
| `npm run test:coverage` | Coverage report via V8                               |
| `npm run lint`          | Run ESLint on `src/` and `tests/`                    |
| `npm run lint:fix`      | Auto-fix ESLint issues                               |
| `npm run format`        | Auto-format all files with Prettier                  |
| `npm run format:check`  | Dry-run Prettier check (used in CI)                  |

---

## Code Style

This project enforces consistent code style via ESLint and Prettier.

### Prettier (`.prettierrc`)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

### ESLint (`eslint.config.js`)

- Base: `@eslint/js` recommended
- TypeScript: `typescript-eslint` recommended
- Style: delegated to Prettier via `eslint-config-prettier`
- Rule highlights:
  - Unused vars: error (underscore prefix `_arg` to ignore)
  - `no-explicit-any`: warning (avoid where possible)

### Pre-commit workflow

Before committing, run:

```bash
npm run lint && npm run format:check && npm test
```

Or auto-fix formatting issues:

```bash
npm run lint:fix
npm run format
```

---

## Project Conventions

### File naming

- Source files: `camelCase.ts` or `kebab-case.ts`
- Test files: `module.test.ts` (e.g. `kv.test.ts`, `router.test.ts`)

### Imports

- Always use `.js` extension in import paths (required for ES modules with Node's `NodeNext` resolution):
  ```ts
  import { FileKVStore } from './kv.js'; // correct
  import { FileKVStore } from './kv';    // wrong
  ```

### Adding a new feature

1. Add types to `src/types.ts` if needed
2. Implement the feature
3. Write tests in `tests/` with mocks
4. Run `npm test` — all tests must pass
5. Run `npm run lint && npm run format:check` — must be clean
6. Update relevant docs in `docs/`

---

## Project Architecture

The core router uses Web API `Request`/`Response` and is platform-agnostic. Each platform provides a thin entry point that bridges its runtime to the router.

```
Platform Entry Point
     │
     ├─ Node.js (src/index.ts)
     │    Converts http.IncomingMessage → Web Request
     │    Uses FileKVStore (JSON on disk)
     │
     └─ Cloudflare Workers (src/worker.ts)
          Receives native Web Request
          Uses CloudflareKVStore (CF KV namespace)
     │
     ▼
src/router.ts  ← handleRequest(request, kv, adminSecret)
     │              Uses Web API Request/Response
     │
     ├─── /send ──────► KVStore        ← load client config by origin
     │                       │
     │                       ▼
     │                 src/providers/
     │                   index.ts      ← dispatch by config.service
     │                   resend.ts     ← call Resend API
     │                   sendgrid.ts   ← call SendGrid API
     │
     └─── /config ────► KVStore        ← read/write config entries
```

### Dependency graph

```
index.ts (Node.js)          worker.ts (Cloudflare)
└── router.ts               └── router.ts
    ├── kv-interface.ts          ├── kv-interface.ts
    ├── types.ts                 ├── types.ts
    └── providers/               └── providers/
        ├── index.ts                 ├── index.ts
        │   ├── resend.ts            │   ├── resend.ts
        │   └── sendgrid.ts          │   └── sendgrid.ts
        └── types.ts                 └── types.ts

kv.ts (FileKVStore)         kv-cloudflare.ts (CloudflareKVStore)
└── kv-interface.ts         └── kv-interface.ts
```

No circular dependencies. Each layer only imports downward.
