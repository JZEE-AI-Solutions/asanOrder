BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [password] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [users_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[tenants] (
    [id] NVARCHAR(1000) NOT NULL,
    [businessName] NVARCHAR(1000) NOT NULL,
    [contactPerson] NVARCHAR(1000) NOT NULL,
    [whatsappNumber] NVARCHAR(1000) NOT NULL,
    [businessType] NVARCHAR(1000) NOT NULL,
    [businessCode] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [tenants_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [ownerId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [tenants_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [tenants_businessCode_key] UNIQUE NONCLUSTERED ([businessCode]),
    CONSTRAINT [tenants_ownerId_key] UNIQUE NONCLUSTERED ([ownerId])
);

-- CreateTable
CREATE TABLE [dbo].[forms] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [isPublished] BIT NOT NULL CONSTRAINT [forms_isPublished_df] DEFAULT 0,
    [isHidden] BIT NOT NULL CONSTRAINT [forms_isHidden_df] DEFAULT 0,
    [formLink] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [forms_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [tenantId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [forms_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [forms_formLink_key] UNIQUE NONCLUSTERED ([formLink])
);

-- CreateTable
CREATE TABLE [dbo].[form_fields] (
    [id] NVARCHAR(1000) NOT NULL,
    [label] NVARCHAR(1000) NOT NULL,
    [fieldType] NVARCHAR(1000) NOT NULL,
    [isRequired] BIT NOT NULL CONSTRAINT [form_fields_isRequired_df] DEFAULT 0,
    [placeholder] NVARCHAR(1000),
    [options] NVARCHAR(1000),
    [order] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [form_fields_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [formId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [form_fields_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[orders] (
    [id] NVARCHAR(1000) NOT NULL,
    [orderNumber] NVARCHAR(1000) NOT NULL,
    [formData] NVARCHAR(1000) NOT NULL,
    [images] NVARCHAR(1000),
    [imagesData] VARBINARY(max),
    [imagesType] NVARCHAR(1000),
    [paymentAmount] FLOAT(53),
    [paymentReceipt] NVARCHAR(1000),
    [paymentReceiptData] VARBINARY(max),
    [paymentReceiptType] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [orders_status_df] DEFAULT 'PENDING',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [orders_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [formId] NVARCHAR(1000) NOT NULL,
    [tenantId] NVARCHAR(1000) NOT NULL,
    [businessOwnerId] NVARCHAR(1000),
    CONSTRAINT [orders_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [orders_orderNumber_key] UNIQUE NONCLUSTERED ([orderNumber])
);

-- CreateTable
CREATE TABLE [dbo].[products] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [purchasePrice] FLOAT(53) NOT NULL,
    [sellingPrice] FLOAT(53),
    [quantity] INT NOT NULL CONSTRAINT [products_quantity_df] DEFAULT 0,
    [category] NVARCHAR(1000),
    [sku] NVARCHAR(1000),
    [image] NVARCHAR(1000),
    [imageData] VARBINARY(max),
    [imageType] NVARCHAR(1000),
    [isActive] BIT NOT NULL CONSTRAINT [products_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [products_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [tenantId] NVARCHAR(1000) NOT NULL,
    [purchaseInvoiceId] NVARCHAR(1000),
    CONSTRAINT [products_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[purchase_invoices] (
    [id] NVARCHAR(1000) NOT NULL,
    [invoiceNumber] NVARCHAR(1000) NOT NULL,
    [supplierName] NVARCHAR(1000),
    [invoiceDate] DATETIME2 NOT NULL,
    [totalAmount] FLOAT(53) NOT NULL,
    [image] NVARCHAR(1000),
    [imageData] VARBINARY(max),
    [imageType] NVARCHAR(1000),
    [notes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [purchase_invoices_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [tenantId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [purchase_invoices_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[returns] (
    [id] NVARCHAR(1000) NOT NULL,
    [returnNumber] NVARCHAR(1000) NOT NULL,
    [reason] NVARCHAR(1000),
    [returnDate] DATETIME2 NOT NULL,
    [totalAmount] FLOAT(53) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [returns_status_df] DEFAULT 'PENDING',
    [notes] NVARCHAR(1000),
    [image] NVARCHAR(1000),
    [imageData] VARBINARY(max),
    [imageType] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [returns_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [tenantId] NVARCHAR(1000) NOT NULL,
    [purchaseInvoiceId] NVARCHAR(1000),
    CONSTRAINT [returns_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[return_items] (
    [id] NVARCHAR(1000) NOT NULL,
    [productName] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [purchasePrice] FLOAT(53) NOT NULL,
    [quantity] INT NOT NULL,
    [reason] NVARCHAR(1000),
    [sku] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [return_items_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [returnId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [return_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[tenants] ADD CONSTRAINT [tenants_ownerId_fkey] FOREIGN KEY ([ownerId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[forms] ADD CONSTRAINT [forms_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[form_fields] ADD CONSTRAINT [form_fields_formId_fkey] FOREIGN KEY ([formId]) REFERENCES [dbo].[forms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_formId_fkey] FOREIGN KEY ([formId]) REFERENCES [dbo].[forms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_businessOwnerId_fkey] FOREIGN KEY ([businessOwnerId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[products] ADD CONSTRAINT [products_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[products] ADD CONSTRAINT [products_purchaseInvoiceId_fkey] FOREIGN KEY ([purchaseInvoiceId]) REFERENCES [dbo].[purchase_invoices]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[purchase_invoices] ADD CONSTRAINT [purchase_invoices_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[returns] ADD CONSTRAINT [returns_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[returns] ADD CONSTRAINT [returns_purchaseInvoiceId_fkey] FOREIGN KEY ([purchaseInvoiceId]) REFERENCES [dbo].[purchase_invoices]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[return_items] ADD CONSTRAINT [return_items_returnId_fkey] FOREIGN KEY ([returnId]) REFERENCES [dbo].[returns]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
