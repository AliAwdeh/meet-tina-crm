ALTER TABLE "Message" ADD COLUMN "metadata" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Message" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'received';
ALTER TABLE "Message" ADD COLUMN "n8nStatus" TEXT NOT NULL DEFAULT 'not_queued';
ALTER TABLE "Message" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Message" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "Message" ADD COLUMN "processedText" TEXT;
ALTER TABLE "Message" ADD COLUMN "deliveredAt" DATETIME;
ALTER TABLE "Message" ADD COLUMN "readAt" DATETIME;

CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "event" TEXT NOT NULL,
  "sessionId" TEXT,
  "idempotencyKey" TEXT,
  "deliveryId" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "signatureValid" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'received',
  "rawPayload" TEXT NOT NULL DEFAULT '{}',
  "headers" TEXT NOT NULL DEFAULT '{}',
  "error" TEXT,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" DATETIME
);

CREATE TABLE "MediaAttachment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "externalMediaId" TEXT,
  "mediaType" TEXT NOT NULL,
  "mimeType" TEXT,
  "filename" TEXT,
  "sourceUrl" TEXT,
  "localPath" TEXT,
  "publicUrl" TEXT,
  "sizeBytes" INTEGER,
  "transcript" TEXT,
  "visionSummary" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "rawPayload" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MediaAttachment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MediaAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProcessingJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL DEFAULT 'n8n_ai',
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextRunAt" DATETIME,
  "lastError" TEXT,
  "payload" TEXT NOT NULL DEFAULT '{}',
  "result" TEXT NOT NULL DEFAULT '{}',
  "correlationId" TEXT NOT NULL,
  "customerId" TEXT,
  "conversationId" TEXT,
  "messageId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  CONSTRAINT "ProcessingJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProcessingJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProcessingJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WebhookDelivery_idempotencyKey_key" ON "WebhookDelivery"("idempotencyKey");
CREATE INDEX "WebhookDelivery_event_idx" ON "WebhookDelivery"("event");
CREATE INDEX "WebhookDelivery_sessionId_idx" ON "WebhookDelivery"("sessionId");
CREATE INDEX "WebhookDelivery_deliveryId_idx" ON "WebhookDelivery"("deliveryId");
CREATE INDEX "WebhookDelivery_status_idx" ON "WebhookDelivery"("status");
CREATE INDEX "WebhookDelivery_receivedAt_idx" ON "WebhookDelivery"("receivedAt");

CREATE INDEX "MediaAttachment_messageId_idx" ON "MediaAttachment"("messageId");
CREATE INDEX "MediaAttachment_customerId_idx" ON "MediaAttachment"("customerId");
CREATE INDEX "MediaAttachment_conversationId_idx" ON "MediaAttachment"("conversationId");
CREATE INDEX "MediaAttachment_status_idx" ON "MediaAttachment"("status");

CREATE UNIQUE INDEX "ProcessingJob_correlationId_key" ON "ProcessingJob"("correlationId");
CREATE INDEX "ProcessingJob_status_idx" ON "ProcessingJob"("status");
CREATE INDEX "ProcessingJob_type_idx" ON "ProcessingJob"("type");
CREATE INDEX "ProcessingJob_customerId_idx" ON "ProcessingJob"("customerId");
CREATE INDEX "ProcessingJob_conversationId_idx" ON "ProcessingJob"("conversationId");
CREATE INDEX "ProcessingJob_messageId_idx" ON "ProcessingJob"("messageId");
CREATE INDEX "ProcessingJob_createdAt_idx" ON "ProcessingJob"("createdAt");

CREATE INDEX "Message_status_idx" ON "Message"("status");
CREATE INDEX "Message_n8nStatus_idx" ON "Message"("n8nStatus");
