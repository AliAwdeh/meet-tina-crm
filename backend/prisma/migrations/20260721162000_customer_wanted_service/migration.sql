ALTER TABLE "Customer" ADD COLUMN "wantedService" TEXT;

CREATE INDEX "Customer_wantedService_idx" ON "Customer"("wantedService");
