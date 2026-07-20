# Implementation Progress

## Completed Tasks

- Read the OpenWA specification and implemented the CPM gateway around its REST and webhook contracts.
- Added webhook HMAC verification for `X-OpenWA-Signature`.
- Added idempotent webhook delivery storage with `WebhookDelivery`.
- Extended message persistence with delivery status, n8n status, retries, failure reason, processed text, delivered/read timestamps, and metadata.
- Added `MediaAttachment` records for inbound media placeholders.
- Added `ProcessingJob` records for n8n AI handoffs.
- Implemented `POST /api/v1/webhooks/openwa`.
- Implemented `POST /api/v1/webhooks/n8n/ai-response`.
- Implemented `GET /api/v1/processing-jobs`.
- Implemented `GET /api/v1/processing-jobs/:id`.
- Implemented `POST /api/v1/processing-jobs/:id/retry`.
- Implemented `GET /api/v1/media/:id`.
- Implemented `POST /api/v1/messages/:id/retry`.
- Implemented `POST /api/v1/conversations/:id/send`.
- Added OpenWA outbound text sending with mocked mode when credentials are placeholders.
- Added n8n dispatch with mocked mode when `N8N_AI_WEBHOOK_URL` is missing.
- Added n8n callback handling that saves and sends bot replies.
- Added OpenAI SDK and an inert media service for transcription/vision when `OPENAI_API_KEY` is configured.
- Updated frontend to show processing jobs and message/n8n statuses.
- Updated frontend composer to send outgoing messages through `/conversations/:id/send`.
- Added production env placeholders, Docker gateway variables, docs, and `.gitignore`.
- Created/updated ignored `backend/.env` with placeholders and local `.ali.env` mappings where possible. Secret values were not printed.

## Modified Files

- `.gitignore`
- `README.md`
- `docker-compose.yml`
- `package-lock.json`
- `backend/package.json`
- `backend/.env.example`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260720143000_openwa_gateway/migration.sql`
- `backend/scripts/setup-sqlite.js`
- `backend/src/app.module.ts`
- `backend/src/main.ts`
- `backend/src/integrations/openwa/openwa.controller.ts`
- `backend/src/integrations/openwa/openwa.module.ts`
- `backend/src/integrations/openwa/openwa-normalizer.service.ts`
- `backend/src/integrations/openwa/openwa.service.ts`
- `backend/src/integrations/openwa/openwa.types.ts`
- `backend/src/integrations/openwa/openwa-client.service.ts`
- `backend/src/integrations/n8n/n8n.controller.ts`
- `backend/src/integrations/n8n/n8n.module.ts`
- `backend/src/integrations/n8n/n8n.service.ts`
- `backend/src/integrations/openai/openai.module.ts`
- `backend/src/integrations/openai/openai-media.service.ts`
- `backend/src/media/media.controller.ts`
- `backend/src/media/media.module.ts`
- `backend/src/media/media.service.ts`
- `backend/src/processing-jobs/processing-jobs.controller.ts`
- `backend/src/processing-jobs/processing-jobs.module.ts`
- `backend/src/processing-jobs/processing-jobs.service.ts`
- `backend/src/messages/dto/message.dto.ts`
- `backend/src/messages/messages.controller.ts`
- `backend/src/messages/messages.module.ts`
- `backend/src/messages/messages.service.ts`
- `backend/test/crm.e2e-spec.ts`
- `frontend/src/main.tsx`
- `frontend/src/styles.css`
- `docs/openwa-integration.md`
- `docs/n8n-integration.md`
- `docs/implementation-progress.md`

## Migrations Already Applied

- `20260720143000_openwa_gateway` was applied to `backend/prisma/test.db` by `npm test --workspace backend`.
- It has not been applied to production or any external database.

## Tests Already Passing

- `npm test --workspace backend`
- `npm run lint --workspace backend`
- `npm run lint --workspace frontend`
- `npm run build`

## Current Blockers

- Real OpenWA sending requires valid `OPENWA_BASE_URL`, `OPENWA_API_KEY`, and `OPENWA_SESSION_ID`.
- Real OpenWA webhook delivery requires registering the CPM webhook URL in OpenWA with `OPENWA_WEBHOOK_SECRET`.
- Real n8n AI handoff requires `N8N_AI_WEBHOOK_URL` and `N8N_AI_CALLBACK_SECRET`.
- Real media transcription/vision requires `OPENAI_API_KEY`.
- Inbound media download and a true standalone worker loop are placeholders. The current Docker `worker` service runs the same backend image and should be replaced with a dedicated worker command when the queue loop is implemented.
- This CPM folder is not currently a Git repository.

## Required User Actions

1. Open `backend/.env`.
2. Set these variables directly in the file:
   - `API_KEY`
   - `CPM_PUBLIC_URL`
   - `CPM_FRONTEND_URL`
   - `OPENWA_BASE_URL`
   - `OPENWA_API_KEY`
   - `OPENWA_SESSION_ID`
   - `OPENWA_WEBHOOK_SECRET`
   - `N8N_AI_WEBHOOK_URL`
   - `N8N_AI_CALLBACK_SECRET`
   - `OPENAI_API_KEY`
3. Do not paste secret values into chat.
4. Register the OpenWA webhook URL:
   - URL: `${CPM_PUBLIC_URL}/api/v1/webhooks/openwa`
   - Events: `message.received`, `message.sent`, `message.ack`, `message.failed`, `message.revoked`, `message.edited`, `session.status`, `session.authenticated`, `session.disconnected`
   - Secret: the same value as `OPENWA_WEBHOOK_SECRET`
5. Configure n8n to call:
   - URL: `${CPM_PUBLIC_URL}/api/v1/webhooks/n8n/ai-response`
   - Header: `X-CPM-Callback-Secret: <N8N_AI_CALLBACK_SECRET>`
   - Header: `X-CPM-Correlation-ID: {{$json.correlationId}}`
6. Restart the backend after env changes.

## Exact Next Implementation Step

Implement the real media worker:

- Download inbound OpenWA media into `MEDIA_STORAGE_PATH`.
- Enforce `MAX_MEDIA_SIZE_MB`.
- Update `MediaAttachment.localPath`, `sizeBytes`, and `status`.
- Call `OpenaiMediaService.transcribeAudio` for audio/voice.
- Call `OpenaiMediaService.describeImage` for image media.
- Store transcript or vision summary and add it to n8n payload context.
- Replace the Docker `worker` placeholder with a dedicated retry/media-processing command.

## Commands Needed To Resume

```bash
cd "/Users/aliawdeh/Documents/Projects/Meet Tina Project/CPM"
npm install
npm run prisma:generate --workspace backend
npm run db:setup --workspace backend
npm test --workspace backend
npm run build
```

## Temporary Mocks Or Placeholders To Replace

- `N8N_AI_WEBHOOK_URL` missing marks jobs as `mocked`.
- Missing OpenWA credentials mark outbound messages as `mocked`.
- Media attachments are recorded with status `deferred`; no media file is downloaded yet.
- `worker` service in `docker-compose.yml` is a placeholder.
