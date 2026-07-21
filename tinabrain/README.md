# TinaBrain

TinaBrain is a separate LangGraph/LangChain Python service for Meet Tina chatbot reasoning.

It does not read the CPM SQLite database directly. It talks to CPM over HTTP on the LAN/public network and uses CPM as the system of record for customers, attributes, conversations, and messages.

## What It Does

- Loads the main chatbot prompt from `prompts/main_chatbot.md`.
- Builds message history from CPM customer context.
- Calls an OpenAI chat model through LangChain.
- Lets the model use local tools that call CPM APIs.
- Can set customer profile fields, including `wantedService`.
- Can update profile summaries, statuses, interests, internal notes, and custom attributes.
- Can optionally hand off to n8n with an environment toggle.
- Can call CPM's n8n callback URL with the generated reply.

## Architecture

```text
OpenWA -> CPM -> n8n or TinaBrain -> CPM -> OpenWA
```

Typical deployment options:

1. CPM sends incoming messages to n8n, and n8n calls TinaBrain.
2. CPM points `N8N_AI_WEBHOOK_URL` directly to TinaBrain's `/webhooks/cpm` endpoint.
3. TinaBrain runs standalone for tests via `/chat`.

## Setup With Conda

Use the existing conda environment:

```bash
conda activate langgraph
cd tinabrain
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env`:

```env
TINABRAIN_HOST=0.0.0.0
TINABRAIN_PORT=8010

CPM_API_BASE_URL=https://cpm.meettina.net/api/v1
CPM_API_KEY=your-cpm-api-key
CPM_CALLBACK_SECRET=your-cpm-n8n-callback-secret
TINABRAIN_INBOUND_API_KEY=your-cpm-to-tinabrain-secret

OPENAI_API_KEY=your-openai-api-key
TINABRAIN_MODEL=gpt-4.1-mini
TINABRAIN_TEMPERATURE=0.2
TINABRAIN_AUTO_CALLBACK=true
```

Run:

```bash
python run.py
```

Health:

```bash
curl http://localhost:8010/health
```

## CPM to TinaBrain

If you want CPM to send AI jobs directly to TinaBrain, set CPM:

```env
N8N_AI_WEBHOOK_URL=http://tinabrain-lan-host:8010/webhooks/cpm
N8N_OUTBOUND_API_KEY=your-cpm-to-tinabrain-secret
N8N_AI_CALLBACK_SECRET=your-cpm-n8n-callback-secret
```

TinaBrain accepts the same payload shape CPM already sends to n8n:

```json
{
  "correlationId": "cpm_message-id",
  "callbackUrl": "https://cpm.meettina.net/api/v1/webhooks/n8n/ai-response",
  "customer": {},
  "conversation": {},
  "message": {},
  "mediaAttachments": [],
  "recentMessages": []
}
```

When `TINABRAIN_AUTO_CALLBACK=true`, TinaBrain posts the final reply back to `callbackUrl`.

## n8n to TinaBrain

In n8n, add an HTTP Request node:

```text
Method: POST
URL: http://tinabrain-lan-host:8010/webhooks/cpm
Body: {{$json.body}}
Header: X-CPM-API-Key: your-cpm-to-tinabrain-secret
```

If your webhook node output is wrapped by n8n, send the `body` object, not the entire wrapper array.

## Tools Available To The Model

- `get_customer_context`
- `update_customer_profile`
- `set_customer_fields`
- `upsert_customer_attribute`
- `bulk_upsert_customer_attributes`
- `add_internal_note`
- `handoff_to_n8n` when `TINABRAIN_N8N_MODE=tool`

The model should use these tools to keep CPM accurate as the conversation reveals new facts.

## n8n Toggle

```env
TINABRAIN_N8N_MODE=off
```

Modes:

- `off`: do not call n8n from TinaBrain.
- `always`: TinaBrain forwards the payload to `TINABRAIN_N8N_WEBHOOK_URL` instead of generating internally.
- `tool`: exposes `handoff_to_n8n` as a model tool.

For `always` or `tool`, configure:

```env
TINABRAIN_N8N_WEBHOOK_URL=https://your-n8n-domain/webhook/extra-automation
TINABRAIN_N8N_API_KEY=your-secret
```

## Direct Test

```bash
curl -X POST http://localhost:8010/chat \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "customer-uuid",
    "conversationId": "conversation-uuid",
    "message": "I need a WhatsApp reservation chatbot"
  }'
```

## Notes

- TinaBrain is deliberately separate from CPM.
- CPM remains the source of truth.
- The prompt is editable without touching Python code.
- All profile writes go through CPM validation and API authentication.
