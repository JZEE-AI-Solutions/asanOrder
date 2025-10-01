BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[orders] ADD [customerId] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[customers] (
    [id] NVARCHAR(1000) NOT NULL,
    [phoneNumber] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000),
    [email] NVARCHAR(1000),
    [address] NVARCHAR(1000),
    [city] NVARCHAR(1000),
    [state] NVARCHAR(1000),
    [country] NVARCHAR(1000),
    [postalCode] NVARCHAR(1000),
    [notes] NVARCHAR(1000),
    [isActive] BIT NOT NULL CONSTRAINT [customers_isActive_df] DEFAULT 1,
    [totalOrders] INT NOT NULL CONSTRAINT [customers_totalOrders_df] DEFAULT 0,
    [totalSpent] FLOAT(53) NOT NULL CONSTRAINT [customers_totalSpent_df] DEFAULT 0,
    [lastOrderDate] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [customers_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [tenantId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [customers_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [customers_phoneNumber_tenantId_key] UNIQUE NONCLUSTERED ([phoneNumber],[tenantId])
);

-- CreateTable
CREATE TABLE [dbo].[customer_logs] (
    [id] NVARCHAR(1000) NOT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [fieldName] NVARCHAR(1000),
    [oldValue] NVARCHAR(1000),
    [newValue] NVARCHAR(1000),
    [description] NVARCHAR(1000),
    [metadata] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [customer_logs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [customerId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [customer_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[customers]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[customers] ADD CONSTRAINT [customers_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[customer_logs] ADD CONSTRAINT [customer_logs_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[customers]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
