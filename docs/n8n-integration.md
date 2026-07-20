# n8n Integration

## CPM to n8n

Set:

```text
N8N_AI_WEBHOOK_URL=https://your-n8n-host/webhook/meet-tina-ai
N8N_OUTBOUND_API_KEY=...
N8N_REQUEST_TIMEOUT_MS=10000
N8N_CONTEXT_MESSAGE_LIMIT=20
```

CPM sends:

```http
POST N8N_AI_WEBHOOK_URL
Content-Type: application/json
X-CPM-API-Key: N8N_OUTBOUND_API_KEY
X-CPM-Correlation-ID: cpm_<messageId>
```

Payload includes:

```json
{
  "correlationId": "cpm_<messageId>",
  "callbackUrl": "https://cpm.example.com/api/v1/webhooks/n8n/ai-response",
  "customer": {},
  "conversation": {},
  "message": {},
  "mediaAttachments": [],
  "recentMessages": []
}
```

When `N8N_AI_WEBHOOK_URL` is missing, CPM creates a `ProcessingJob` with status `mocked` so local development can continue.

## n8n to CPM Callback

Set:

```text
N8N_AI_CALLBACK_SECRET=...
```

n8n should call:

```http
POST ${CPM_PUBLIC_URL}/api/v1/webhooks/n8n/ai-response
Content-Type: application/json
X-CPM-Callback-Secret: N8N_AI_CALLBACK_SECRET
X-CPM-Correlation-ID: cpm_<messageId>
```

Accepted callback body shapes:

```json
{ "correlationId": "cpm_<messageId>", "text": "Reply from Tina" }
```

```json
{ "correlationId": "cpm_<messageId>", "replies": ["First reply", "Second reply"] }
```

```json
{ "correlationId": "cpm_<messageId>", "messages": [{ "text": "Reply from Tina" }] }
```

CPM saves each reply as an outgoing bot message and sends it through OpenWA. If OpenWA credentials are placeholders, the saved messages are marked `mocked`.

## Retry

Use:

```http
POST /api/v1/processing-jobs/:id/retry
X-API-Key: API_KEY
```

The retry endpoint resends the stored job payload to `N8N_AI_WEBHOOK_URL`.
