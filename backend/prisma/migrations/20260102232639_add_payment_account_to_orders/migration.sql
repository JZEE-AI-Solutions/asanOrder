-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentAccountId" TEXT,
ADD COLUMN     "paymentMethod" TEXT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
