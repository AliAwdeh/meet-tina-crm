CREATE TABLE "Customer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "displayName" TEXT,
  "pushName" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "phoneNumber" TEXT,
  "whatsappId" TEXT,
  "lid" TEXT,
  "chatId" TEXT,
  "email" TEXT,
  "company" TEXT,
  "jobTitle" TEXT,
  "country" TEXT,
  "city" TEXT,
  "source" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "interests" TEXT NOT NULL DEFAULT '[]',
  "freeTextProfile" TEXT,
  "internalNotes" TEXT,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "firstContactAt" DATETIME,
  "lastContactAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CustomerAttribute" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "valueType" TEXT NOT NULL DEFAULT 'string',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerAttribute_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "externalChatId" TEXT,
  "sessionId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Message" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "externalMessageId" TEXT,
  "idempotencyKey" TEXT,
  "deliveryId" TEXT,
  "direction" TEXT NOT NULL,
  "senderType" TEXT NOT NULL,
  "messageType" TEXT NOT NULL DEFAULT 'text',
  "body" TEXT,
  "mediaUrl" TEXT,
  "caption" TEXT,
  "rawPayload" TEXT NOT NULL DEFAULT '{}',
  "sentAt" DATETIME,
  "receivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CustomerAttribute_customerId_key_key" ON "CustomerAttribute"("customerId", "key");
CREATE UNIQUE INDEX "Message_externalMessageId_key" ON "Message"("externalMessageId");
CREATE UNIQUE INDEX "Message_idempotencyKey_key" ON "Message"("idempotencyKey");
CREATE UNIQUE INDEX "Message_deliveryId_key" ON "Message"("deliveryId");

CREATE INDEX "Customer_whatsappId_idx" ON "Customer"("whatsappId");
CREATE INDEX "Customer_lid_idx" ON "Customer"("lid");
CREATE INDEX "Customer_phoneNumber_idx" ON "Customer"("phoneNumber");
CREATE INDEX "Customer_status_idx" ON "Customer"("status");
CREATE INDEX "Customer_lastContactAt_idx" ON "Customer"("lastContactAt");
CREATE INDEX "CustomerAttribute_key_idx" ON "CustomerAttribute"("key");
CREATE INDEX "Conversation_customerId_idx" ON "Conversation"("customerId");
CREATE INDEX "Conversation_externalChatId_idx" ON "Conversation"("externalChatId");
CREATE INDEX "Conversation_sessionId_idx" ON "Conversation"("sessionId");
CREATE INDEX "Conversation_status_idx" ON "Conversation"("status");
CREATE INDEX "Message_customerId_idx" ON "Message"("customerId");
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");
CREATE INDEX "Message_direction_idx" ON "Message"("direction");
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");
