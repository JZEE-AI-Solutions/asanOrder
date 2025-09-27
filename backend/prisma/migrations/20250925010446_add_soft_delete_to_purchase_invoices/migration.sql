/*
  Warnings:

  - You are about to drop the column `purchaseInvoiceId` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `purchasePrice` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `sellingPrice` on the `products` table. All the data in the column will be lost.

*/
BEGIN TRY

BEGIN TRAN;

-- Check if the foreign key constraint exists before dropping it
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'products_purchaseInvoiceId_fkey')
BEGIN
    ALTER TABLE [dbo].[products] DROP CONSTRAINT [products_purchaseInvoiceId_fkey];
END

-- Check if columns exist before dropping them
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('products') AND name = 'purchaseInvoiceId')
BEGIN
    ALTER TABLE [dbo].[products] DROP COLUMN [purchaseInvoiceId];
END

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('products') AND name = 'purchasePrice')
BEGIN
    ALTER TABLE [dbo].[products] DROP COLUMN [purchasePrice];
END

-- Drop constraint before dropping column
IF EXISTS (SELECT * FROM sys.default_constraints WHERE name = 'products_quantity_df')
BEGIN
    ALTER TABLE [dbo].[products] DROP CONSTRAINT [products_quantity_df];
END

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('products') AND name = 'quantity')
BEGIN
    ALTER TABLE [dbo].[products] DROP COLUMN [quantity];
END

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('products') AND name = 'sellingPrice')
BEGIN
    ALTER TABLE [dbo].[products] DROP COLUMN [sellingPrice];
END
-- Add new columns only if they don't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('products') AND name = 'currentQuantity')
BEGIN
    ALTER TABLE [dbo].[products] ADD [currentQuantity] INT NOT NULL CONSTRAINT [products_currentQuantity_df] DEFAULT 0;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('products') AND name = 'currentRetailPrice')
BEGIN
    ALTER TABLE [dbo].[products] ADD [currentRetailPrice] FLOAT(53);
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('products') AND name = 'lastPurchasePrice')
BEGIN
    ALTER TABLE [dbo].[products] ADD [lastPurchasePrice] FLOAT(53);
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('products') AND name = 'lastUpdated')
BEGIN
    ALTER TABLE [dbo].[products] ADD [lastUpdated] DATETIME2 NOT NULL CONSTRAINT [products_lastUpdated_df] DEFAULT CURRENT_TIMESTAMP;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('products') AND name = 'maxStockLevel')
BEGIN
    ALTER TABLE [dbo].[products] ADD [maxStockLevel] INT;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('products') AND name = 'minStockLevel')
BEGIN
    ALTER TABLE [dbo].[products] ADD [minStockLevel] INT NOT NULL CONSTRAINT [products_minStockLevel_df] DEFAULT 0;
END

-- Add soft delete columns to purchase_invoices if they don't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('purchase_invoices') AND name = 'deleteReason')
BEGIN
    ALTER TABLE [dbo].[purchase_invoices] ADD [deleteReason] NVARCHAR(1000);
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('purchase_invoices') AND name = 'deletedAt')
BEGIN
    ALTER TABLE [dbo].[purchase_invoices] ADD [deletedAt] DATETIME2;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('purchase_invoices') AND name = 'deletedBy')
BEGIN
    ALTER TABLE [dbo].[purchase_invoices] ADD [deletedBy] NVARCHAR(1000);
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('purchase_invoices') AND name = 'isDeleted')
BEGIN
    ALTER TABLE [dbo].[purchase_invoices] ADD [isDeleted] BIT NOT NULL CONSTRAINT [purchase_invoices_isDeleted_df] DEFAULT 0;
END

-- CreateTable only if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'purchase_items')
BEGIN
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
    [isDeleted] BIT NOT NULL CONSTRAINT [purchase_items_isDeleted_df] DEFAULT 0,
    [deletedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [purchase_items_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [tenantId] NVARCHAR(1000) NOT NULL,
    [purchaseInvoiceId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [purchase_items_pkey] PRIMARY KEY CLUSTERED ([id])
);
END

-- CreateTable only if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'product_logs')
BEGIN
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
END

-- Add foreign keys only if they don't exist
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'purchase_items_tenantId_fkey')
BEGIN
    ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'purchase_items_purchaseInvoiceId_fkey')
BEGIN
    ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_purchaseInvoiceId_fkey] FOREIGN KEY ([purchaseInvoiceId]) REFERENCES [dbo].[purchase_invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'product_logs_tenantId_fkey')
BEGIN
    ALTER TABLE [dbo].[product_logs] ADD CONSTRAINT [product_logs_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'product_logs_productId_fkey')
BEGIN
    ALTER TABLE [dbo].[product_logs] ADD CONSTRAINT [product_logs_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'product_logs_purchaseItemId_fkey')
BEGIN
    ALTER TABLE [dbo].[product_logs] ADD CONSTRAINT [product_logs_purchaseItemId_fkey] FOREIGN KEY ([purchaseItemId]) REFERENCES [dbo].[purchase_items]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
END

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
