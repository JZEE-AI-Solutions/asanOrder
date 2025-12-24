-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "purchaseInvoiceId" TEXT;

-- CreateIndex
CREATE INDEX "payments_purchaseInvoiceId_idx" ON "payments"("purchaseInvoiceId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
