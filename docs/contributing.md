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

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled production build |
| `npm test` | Run all 25 tests |
| `npm run test:watch` | Watch mode — re-runs tests on change |
| `npm run test:coverage` | Coverage report via V8 |
| `npm run lint` | Run ESLint on `src/` and `tests/` |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run format` | Auto-format all files with Prettier |
| `npm run format:check` | Dry-run Prettier check (used in CI) |

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
  - Unused vars → error (underscore prefix `_arg` to ignore)
  - `no-explicit-any` → warning (avoid where possible)

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

- Source files: `camelCase.ts`
- Test files: `module.submodule.test.ts` (e.g. `providers.resend.test.ts`)

### Imports

- Always use `.js` extension in import paths (required for ES modules with Node's `NodeNext` resolution):
  ```ts
  import { kvGet } from './kv.js';         // ✅
  import { kvGet } from './kv';            // ❌
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

```
HTTP Request
     │
     ▼
 src/index.ts          ← starts Node HTTP server
     │
     ▼
 src/router.ts         ← parses URL, method, origin
     │
     ├─── /send ──────► src/kv.ts         ← load client config by origin
     │                       │
     │                       ▼
     │                 src/providers/
     │                   index.ts         ← dispatch by config.service
     │                   resend.ts        ← call Resend API
     │                   sendgrid.ts      ← call SendGrid API
     │
     └─── /config ────► src/kv.ts         ← read/write config entries
```

### Dependency graph

```
index.ts
└── router.ts
    ├── kv.ts
    ├── types.ts
    └── providers/
        ├── index.ts
        │   ├── resend.ts
        │   └── sendgrid.ts
        └── types.ts
```

No circular dependencies. Each layer only imports downward.
