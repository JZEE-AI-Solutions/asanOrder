-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shippingCharges" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "shippingQuantityRules" TEXT,
ADD COLUMN     "useDefaultShipping" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "shippingCityCharges" TEXT,
ADD COLUMN     "shippingQuantityRules" TEXT;
