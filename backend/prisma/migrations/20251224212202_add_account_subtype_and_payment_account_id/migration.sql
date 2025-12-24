-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "accountSubType" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "accountId" TEXT;

-- CreateIndex
CREATE INDEX "accounts_accountSubType_tenantId_idx" ON "accounts"("accountSubType", "tenantId");

-- CreateIndex
CREATE INDEX "payments_accountId_idx" ON "payments"("accountId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
