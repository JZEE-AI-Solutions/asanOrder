/*
  Warnings:

  - A unique constraint covering the columns `[formLink]` on the table `forms` will be added. If there are existing duplicate values, this will fail.

*/
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[orders] ADD [selectedProducts] NVARCHAR(max);
ALTER TABLE [dbo].[orders] ADD [productQuantities] NVARCHAR(max);

-- CreateIndex
ALTER TABLE [dbo].[forms] ADD CONSTRAINT [forms_formLink_key] UNIQUE NONCLUSTERED ([formLink]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
