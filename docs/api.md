# API Reference

All requests go to `http://localhost:3000` (or your deployed host).

---

## `POST /send`

Send an email on behalf of a configured origin.

### Request

**Headers**

| Header | Required | Value |
|---|---|---|
| `Origin` | ✅ | `https://yourdomain.com` |
| `Content-Type` | ✅ | `application/json` |

**Body**

```json
{
  "to": "recipient@example.com",
  "subject": "Hello!",
  "html": "<b>Hello world</b>",
  "from": "optional-override@yourdomain.com"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `to` | `string \| string[]` | ✅ | Recipient(s) |
| `subject` | `string` | ✅ | Email subject |
| `html` | `string` | ✅ | HTML body |
| `from` | `string` | ❌ | Overrides the default sender from config |

### Responses

| Status | Meaning |
|---|---|
| `200` | Email sent successfully — returns provider response |
| `400` | Missing required fields (`to`, `subject`, `html`) |
| `403` | Origin not configured or not allowed |
| `405` | Method not allowed (use POST) |
| `502` | Provider rejected the request — check your API key or payload |

### Example

```bash
curl -X POST http://localhost:3000/send \
  -H "Origin: https://ankach.com" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "subject": "Hello from Ankach",
    "html": "<h1>Hello!</h1><p>This is a test email.</p>"
  }'
```

**Success response (Resend)**

```json
{ "success": true, "data": { "id": "re_abc123" } }
```

**Error response**

```json
{ "success": false, "error": "\"Invalid API key\"" }
```

---

## CORS Preflight

`OPTIONS /send` is handled automatically. For any configured origin, the response includes:

```
Access-Control-Allow-Origin: https://yourdomain.com
Access-Control-Allow-Methods: POST
Access-Control-Allow-Headers: Content-Type
```

---

## Admin API

All admin routes require a `Bearer` token matching `ADMIN_SECRET` from your `.env`.

```
Authorization: Bearer <ADMIN_SECRET>
```

Unauthorized requests return `401 Unauthorized`.

---

### `POST /config` — Add or update a client

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

**Body schema**

| Field | Type | Required | Description |
|---|---|---|---|
| `origin` | `string` | ✅ | Full origin URL (`https://yourdomain.com`) |
| `service` | `"resend" \| "sendgrid"` | ✅ | Email provider |
| `apiKey` | `string` | ✅ | Provider API key |
| `from` | `string` | ✅ | Default sender address |

**Response `201`**

```json
{ "message": "Config saved for https://ankach.com" }
```

**Response `400`** — missing fields

```json
{ "error": "Missing fields: origin, service, apiKey, from" }
```

---

### `GET /config` — List all clients

```bash
curl http://localhost:3000/config \
  -H "Authorization: Bearer mysecret"
```

**Response `200`**

```json
{
  "https://ankach.com": {
    "service": "resend",
    "apiKey": "re_xxx",
    "from": "noreply@ankach.com"
  },
  "https://lugixbox.cz": {
    "service": "sendgrid",
    "apiKey": "sg_yyy",
    "from": "info@lugixbox.cz"
  }
}
```

> ⚠️ This exposes API keys. Ensure your `ADMIN_SECRET` is strong and this route is not publicly accessible.

---

### `DELETE /config/:origin` — Remove a client

The `:origin` parameter must be **URL-encoded**.

```bash
# https://ankach.com → https%3A%2F%2Fankach.com
curl -X DELETE "http://localhost:3000/config/https%3A%2F%2Fankach.com" \
  -H "Authorization: Bearer mysecret"
```

**Response `200`**

```json
{ "message": "Deleted config for https://ankach.com" }
```

**Response `404`**

```json
{ "error": "No config found for: https://ankach.com" }
```

---

## Error Format

All JSON error responses follow this shape:

```json
{ "error": "Error description here" }
```

All success responses from `/send` follow:

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "..." }
```
