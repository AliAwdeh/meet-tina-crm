# OpenWA Integration

## CPM Webhook URL

Configure OpenWA to send webhooks to:

```text
${CPM_PUBLIC_URL}/api/v1/webhooks/openwa
```

For local development, this is usually:

```text
http://localhost:3000/api/v1/webhooks/openwa
```

## Required OpenWA Webhook Settings

Events:

```text
message.received
message.sent
message.ack
message.failed
message.revoked
message.edited
session.status
session.authenticated
session.disconnected
```

Secret:

```text
OPENWA_WEBHOOK_SECRET
```

OpenWA signs each request with:

```text
X-OpenWA-Signature: sha256=<hmac>
```

CPM verifies the signature over the raw JSON body. Do not send API keys in URLs.

## Outbound OpenWA Configuration

Set these variables in `backend/.env`:

```text
OPENWA_BASE_URL=http://localhost:2785/api
OPENWA_API_KEY=...
OPENWA_SESSION_ID=...
```

CPM sends text messages to:

```text
POST /api/sessions/:sessionId/messages/send-text
X-API-Key: OPENWA_API_KEY
```

Body:

```json
{ "chatId": "96171056438@c.us", "text": "Hello from Tina" }
```

## Idempotency

CPM stores every incoming delivery in `WebhookDelivery` using OpenWA's `X-OpenWA-Idempotency-Key` / body `idempotencyKey`. Duplicate completed deliveries return success without reprocessing.

## Current Media Behavior

Inbound media creates a `MediaAttachment` record with status `deferred`. The OpenAI SDK service is installed and configured for `gpt-4o-transcribe` and `gpt-4.1-mini`, but the background media download loop is still a placeholder.
