/*
  Warnings:

  - You are about to drop the column `purchaseInvoiceId` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `purchasePrice` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `sellingPrice` on the `products` table. All the data in the column will be lost.

*/
BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[products] DROP CONSTRAINT [products_purchaseInvoiceId_fkey];

-- AlterTable
ALTER TABLE [dbo].[products] DROP COLUMN [purchaseInvoiceId],
[purchasePrice],
[quantity],
[sellingPrice];
ALTER TABLE [dbo].[products] ADD [currentQuantity] INT NOT NULL CONSTRAINT [products_currentQuantity_df] DEFAULT 0,
[currentRetailPrice] FLOAT(53),
[lastPurchasePrice] FLOAT(53),
[lastUpdated] DATETIME2 NOT NULL CONSTRAINT [products_lastUpdated_df] DEFAULT CURRENT_TIMESTAMP,
[maxStockLevel] INT,
[minStockLevel] INT NOT NULL CONSTRAINT [products_minStockLevel_df] DEFAULT 0;

-- AlterTable
ALTER TABLE [dbo].[purchase_invoices] ADD [deleteReason] NVARCHAR(1000),
[deletedAt] DATETIME2,
[deletedBy] NVARCHAR(1000),
[isDeleted] BIT NOT NULL CONSTRAINT [purchase_invoices_isDeleted_df] DEFAULT 0;

-- CreateTable
CREATE TABLE [dbo].[purchase_items] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [purchasePrice] FLOAT(53) NOT NULL,
    [quantity] INT NOT NULL CONSTRAINT [purchase_items_quantity_df] DEFAULT 0,
    [category] NVARCHAR(1000),
    [sku] NVARCHAR(1000),
    [image] NVARCHAR(1000),
    [imageData] VARBINARY(max),
    [imageType] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [purchase_items_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [tenantId] NVARCHAR(1000) NOT NULL,
    [purchaseInvoiceId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [purchase_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[product_logs] (
    [id] NVARCHAR(1000) NOT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [quantity] INT,
    [oldQuantity] INT,
    [newQuantity] INT,
    [oldPrice] FLOAT(53),
    [newPrice] FLOAT(53),
    [reason] NVARCHAR(1000),
    [reference] NVARCHAR(1000),
    [notes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [product_logs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [tenantId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000),
    [purchaseItemId] NVARCHAR(1000),
    CONSTRAINT [product_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_purchaseInvoiceId_fkey] FOREIGN KEY ([purchaseInvoiceId]) REFERENCES [dbo].[purchase_invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[product_logs] ADD CONSTRAINT [product_logs_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[product_logs] ADD CONSTRAINT [product_logs_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[product_logs] ADD CONSTRAINT [product_logs_purchaseItemId_fkey] FOREIGN KEY ([purchaseItemId]) REFERENCES [dbo].[purchase_items]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
