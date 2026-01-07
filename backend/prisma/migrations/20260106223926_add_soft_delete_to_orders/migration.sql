-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;
