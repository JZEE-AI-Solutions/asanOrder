-- Add missing fields and relations to match current schema

BEGIN TRY

BEGIN TRAN;

-- Add selectedProducts field to form_fields table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('form_fields') AND name = 'selectedProducts')
BEGIN
    ALTER TABLE [dbo].[form_fields] ADD [selectedProducts] NVARCHAR(4000);
END

-- Add selectedProducts field to orders table  
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('orders') AND name = 'selectedProducts')
BEGIN
    ALTER TABLE [dbo].[orders] ADD [selectedProducts] NVARCHAR(4000);
END

-- Add productId field to purchase_items table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('purchase_items') AND name = 'productId')
BEGIN
    ALTER TABLE [dbo].[purchase_items] ADD [productId] NVARCHAR(1000);
END

-- Add foreign key constraint for purchase_items.productId -> products.id
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'purchase_items_productId_fkey')
BEGIN
    ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_productId_fkey] 
    FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
END

-- Ensure the filtered unique index on forms.formLink exists (in case it was created manually)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_forms_formLink_unique')
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX [IX_forms_formLink_unique] 
    ON [dbo].[forms] ([formLink])
    WHERE [formLink] IS NOT NULL;
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

