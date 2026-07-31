ALTER TABLE "Customer" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Customer" ADD COLUMN "archivedBy" TEXT;
ALTER TABLE "Customer" ADD COLUMN "archivedReason" TEXT;
ALTER TABLE "Customer" ADD COLUMN "archivedMode" TEXT;

ALTER TABLE "Conversation" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "archivedReason" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "archivedMode" TEXT;

CREATE INDEX "Customer_archivedAt_idx" ON "Customer"("archivedAt");
CREATE INDEX "Customer_archivedMode_idx" ON "Customer"("archivedMode");
CREATE INDEX "Conversation_archivedAt_idx" ON "Conversation"("archivedAt");
