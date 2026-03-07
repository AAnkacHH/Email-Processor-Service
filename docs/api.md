# API Reference

All endpoints are the same on both Node.js (`http://localhost:3000`) and Cloudflare Workers (your Worker URL).

---

## `POST /send`

Send an email on behalf of a configured origin.

### Request

**Headers**

| Header         | Required | Value                    |
| -------------- | -------- | ------------------------ |
| `Origin`       | yes      | `https://yourdomain.com` |
| `Content-Type` | yes      | `application/json`       |

**Body**

```json
{
  "to": "recipient@example.com",
  "subject": "Hello!",
  "html": "<b>Hello world</b>",
  "from": "optional-override@yourdomain.com",
  "attachments": [
    {
      "filename": "invoice.pdf",
      "content": "<base64-encoded content>",
      "type": "application/pdf"
    }
  ]
}
```

| Field         | Type                 | Required | Description                              |
| ------------- | -------------------- | -------- | ---------------------------------------- |
| `to`          | `string \| string[]` | yes      | Recipient(s)                             |
| `subject`     | `string`             | yes      | Email subject                            |
| `html`        | `string`             | yes      | HTML body                                |
| `from`        | `string`             | no       | Overrides the default sender from config |
| `attachments` | `Attachment[]`       | no       | List of file attachments (see below)     |

**Attachment object**

| Field      | Type     | Required | Description                                                                |
| ---------- | -------- | -------- | -------------------------------------------------------------------------- |
| `filename` | `string` | yes      | File name shown in the email (e.g. `invoice.pdf`)                          |
| `content`  | `string` | yes      | Base64-encoded file content                                                |
| `type`     | `string` | no       | MIME type (e.g. `application/pdf`). Defaults to `application/octet-stream` |

### Responses

| Status | Meaning                                                       |
| ------ | ------------------------------------------------------------- |
| `200`  | Email sent successfully — returns provider response           |
| `400`  | Missing required fields or invalid email address              |
| `403`  | Origin not configured or not allowed                          |
| `405`  | Method not allowed (use POST)                                 |
| `502`  | Provider rejected the request — check your API key or payload |

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

All admin routes require a `Bearer` token matching `ADMIN_SECRET`.

- **Node.js:** set via `.env` file
- **Cloudflare Workers:** set via `wrangler secret put ADMIN_SECRET`

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

| Field     | Type                     | Required | Description                                |
| --------- | ------------------------ | -------- | ------------------------------------------ |
| `origin`  | `string`                 | yes      | Full origin URL (`https://yourdomain.com`) |
| `service` | `"resend" \| "sendgrid"` | yes      | Email provider                             |
| `apiKey`  | `string`                 | yes      | Provider API key                           |
| `from`    | `string`                 | yes      | Default sender address                     |

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
    "apiKey": "re_xxx...",
    "from": "noreply@ankach.com"
  },
  "https://lugixbox.cz": {
    "service": "sendgrid",
    "apiKey": "sg_yyy...",
    "from": "info@lugixbox.cz"
  }
}
```

> API keys are masked in the response (only the first 6 characters are shown).

---

### `DELETE /config/:origin` — Remove a client

The `:origin` parameter must be **URL-encoded**.

```bash
# https://ankach.com -> https%3A%2F%2Fankach.com
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
