# Email Providers

---

## Supported Providers

| `service` value | Provider | Free Tier |
|---|---|---|
| `resend` | [Resend](https://resend.com) | 3,000 emails/month |
| `sendgrid` | [SendGrid](https://sendgrid.com) | 100 emails/day |

---

## Resend

[Resend](https://resend.com) is a developer-focused email API. It requires a verified domain and returns a JSON response with the email `id` on success.

### Getting an API key

1. Sign up at [resend.com](https://resend.com)
2. Go to **API Keys** → **Create API Key**
3. Verify your sending domain under **Domains**

### Config example

```json
{
  "origin": "https://ankach.com",
  "service": "resend",
  "apiKey": "re_xxxxxxxxxxxxxxxx",
  "from": "noreply@ankach.com"
}
```

### Success response

```json
{ "success": true, "data": { "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" } }
```

---

## SendGrid

[SendGrid](https://sendgrid.com) is a large-scale email platform by Twilio. It returns `202 Accepted` with an empty body on success.

### Getting an API key

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Go to **Settings → API Keys → Create API Key**
3. Select **Restricted Access** and enable **Mail Send**

### Config example

```json
{
  "origin": "https://lugixbox.cz",
  "service": "sendgrid",
  "apiKey": "SG.xxxxxxxxxxxxxxxxxxxxxxxx",
  "from": "info@lugixbox.cz"
}
```

### Success response

```json
{ "success": true, "data": { "message": "Email queued" } }
```

---

## Adding a New Provider

### 1. Create the adapter

Create `src/providers/myprovider.ts`:

```ts
import type { ClientConfig, EmailPayload, SendResult } from '../types.js';

export async function sendViaMyProvider(
  config: ClientConfig,
  payload: EmailPayload,
): Promise<SendResult> {
  const response = await fetch('https://api.myprovider.com/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: payload.from ?? config.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return { success: false, error: JSON.stringify(data) };
  }

  return { success: true, data };
}
```

### 2. Register the service name

In `src/types.ts`, extend the union:

```diff
- service: 'resend' | 'sendgrid';
+ service: 'resend' | 'sendgrid' | 'myprovider';
```

### 3. Add to the dispatcher

In `src/providers/index.ts`:

```diff
+ import { sendViaMyProvider } from './myprovider.js';

  switch (config.service) {
    case 'resend':   return sendViaResend(config, payload);
    case 'sendgrid': return sendViaSendgrid(config, payload);
+   case 'myprovider': return sendViaMyProvider(config, payload);
  }
```

> **TypeScript exhaustive check:** if you add the type union but forget the `case`, TypeScript will fail to compile — preventing silent runtime bugs.

### 4. Write tests

Add `tests/providers.myprovider.test.ts` following the same pattern as `tests/providers.resend.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendViaMyProvider } from '../src/providers/myprovider.js';

describe('MyProvider', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('sends successfully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'abc' }),
    }));

    const result = await sendViaMyProvider(
      { service: 'myprovider', apiKey: 'key', from: 'a@b.com' },
      { to: 'u@e.com', subject: 'Hi', html: '<b>Hi</b>' },
    );

    expect(result.success).toBe(true);
  });
});
```
