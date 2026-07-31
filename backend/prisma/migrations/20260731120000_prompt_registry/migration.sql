CREATE TABLE "Prompt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'Other',
  "content" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'active',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "model" TEXT,
  "temperature" REAL,
  "maxTokens" INTEGER,
  "responseFormat" TEXT,
  "variables" TEXT NOT NULL DEFAULT '[]',
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "usage" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT
);

CREATE TABLE "PromptVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "promptId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "model" TEXT,
  "temperature" REAL,
  "maxTokens" INTEGER,
  "responseFormat" TEXT,
  "variables" TEXT NOT NULL DEFAULT '[]',
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "changeNote" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "PromptVersion_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Prompt_key_key" ON "Prompt"("key");
CREATE INDEX "Prompt_category_idx" ON "Prompt"("category");
CREATE INDEX "Prompt_status_idx" ON "Prompt"("status");
CREATE INDEX "Prompt_isActive_idx" ON "Prompt"("isActive");
CREATE INDEX "Prompt_updatedAt_idx" ON "Prompt"("updatedAt");
CREATE UNIQUE INDEX "PromptVersion_promptId_version_key" ON "PromptVersion"("promptId", "version");
CREATE INDEX "PromptVersion_promptId_idx" ON "PromptVersion"("promptId");
CREATE INDEX "PromptVersion_createdAt_idx" ON "PromptVersion"("createdAt");
