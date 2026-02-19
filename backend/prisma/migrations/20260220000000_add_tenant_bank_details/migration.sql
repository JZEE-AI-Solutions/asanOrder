-- CreateTable
CREATE TABLE "tenant_bank_details" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "accountTitle" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "iban" TEXT,
    "bankName" TEXT,
    "instructions" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_bank_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_bank_details_tenantId_idx" ON "tenant_bank_details"("tenantId");

-- AddForeignKey
ALTER TABLE "tenant_bank_details" ADD CONSTRAINT "tenant_bank_details_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
