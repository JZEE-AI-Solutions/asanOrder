-- Drop existing unique constraint that doesn't allow multiple NULLs
IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'forms_formLink_key')
BEGIN
    ALTER TABLE [dbo].[forms] DROP CONSTRAINT [forms_formLink_key];
END

-- Create filtered unique index that allows multiple NULLs but enforces uniqueness for non-NULL values
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_forms_formLink_unique')
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX [IX_forms_formLink_unique] 
    ON [dbo].[forms] ([formLink])
    WHERE [formLink] IS NOT NULL;
END