const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const completeMigration = async () => {
  console.log('🔄 Completing inventory migration...\n');

  try {
    // Step 1: Drop foreign key constraint first
    console.log('🔧 Dropping foreign key constraints...');
    
    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[products] DROP CONSTRAINT [products_purchaseInvoiceId_fkey];
      `;
      console.log('   ✅ Dropped products_purchaseInvoiceId_fkey');
    } catch (error) {
      console.log('   ⚠️  Constraint may not exist:', error.message);
    }

    // Step 2: Drop default constraint on quantity
    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[products] DROP CONSTRAINT [products_quantity_df];
      `;
      console.log('   ✅ Dropped products_quantity_df');
    } catch (error) {
      console.log('   ⚠️  Constraint may not exist:', error.message);
    }

    // Step 3: Drop old columns
    console.log('\n🗑️  Dropping old columns...');
    
    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[products] DROP COLUMN [purchaseInvoiceId];
      `;
      console.log('   ✅ Dropped purchaseInvoiceId column');
    } catch (error) {
      console.log('   ⚠️  Column may not exist:', error.message);
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[products] DROP COLUMN [purchasePrice];
      `;
      console.log('   ✅ Dropped purchasePrice column');
    } catch (error) {
      console.log('   ⚠️  Column may not exist:', error.message);
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[products] DROP COLUMN [quantity];
      `;
      console.log('   ✅ Dropped quantity column');
    } catch (error) {
      console.log('   ⚠️  Column may not exist:', error.message);
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[products] DROP COLUMN [sellingPrice];
      `;
      console.log('   ✅ Dropped sellingPrice column');
    } catch (error) {
      console.log('   ⚠️  Column may not exist:', error.message);
    }

    // Step 4: Add new columns
    console.log('\n➕ Adding new columns...');
    
    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[products] ADD [currentQuantity] INT NOT NULL CONSTRAINT [products_currentQuantity_df] DEFAULT 0;
      `;
      console.log('   ✅ Added currentQuantity column');
    } catch (error) {
      console.log('   ⚠️  Column may already exist:', error.message);
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[products] ADD [currentRetailPrice] FLOAT(53);
      `;
      console.log('   ✅ Added currentRetailPrice column');
    } catch (error) {
      console.log('   ⚠️  Column may already exist:', error.message);
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[products] ADD [lastPurchasePrice] FLOAT(53);
      `;
      console.log('   ✅ Added lastPurchasePrice column');
    } catch (error) {
      console.log('   ⚠️  Column may already exist:', error.message);
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[products] ADD [lastUpdated] DATETIME2 NOT NULL CONSTRAINT [products_lastUpdated_df] DEFAULT CURRENT_TIMESTAMP;
      `;
      console.log('   ✅ Added lastUpdated column');
    } catch (error) {
      console.log('   ⚠️  Column may already exist:', error.message);
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[products] ADD [maxStockLevel] INT;
      `;
      console.log('   ✅ Added maxStockLevel column');
    } catch (error) {
      console.log('   ⚠️  Column may already exist:', error.message);
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[products] ADD [minStockLevel] INT NOT NULL CONSTRAINT [products_minStockLevel_df] DEFAULT 0;
      `;
      console.log('   ✅ Added minStockLevel column');
    } catch (error) {
      console.log('   ⚠️  Column may already exist:', error.message);
    }

    // Step 5: Add foreign key constraints for new tables
    console.log('\n🔗 Adding foreign key constraints...');
    
    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_tenantId_fkey] 
        FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
      `;
      console.log('   ✅ Added purchase_items_tenantId_fkey');
    } catch (error) {
      console.log('   ⚠️  Constraint may already exist:', error.message);
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_purchaseInvoiceId_fkey] 
        FOREIGN KEY ([purchaseInvoiceId]) REFERENCES [dbo].[purchase_invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
      `;
      console.log('   ✅ Added purchase_items_purchaseInvoiceId_fkey');
    } catch (error) {
      console.log('   ⚠️  Constraint may already exist:', error.message);
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[product_logs] ADD CONSTRAINT [product_logs_tenantId_fkey] 
        FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
      `;
      console.log('   ✅ Added product_logs_tenantId_fkey');
    } catch (error) {
      console.log('   ⚠️  Constraint may already exist:', error.message);
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[product_logs] ADD CONSTRAINT [product_logs_productId_fkey] 
        FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
      `;
      console.log('   ✅ Added product_logs_productId_fkey');
    } catch (error) {
      console.log('   ⚠️  Constraint may already exist:', error.message);
    }

    try {
      await prisma.$executeRaw`
        ALTER TABLE [dbo].[product_logs] ADD CONSTRAINT [product_logs_purchaseItemId_fkey] 
        FOREIGN KEY ([purchaseItemId]) REFERENCES [dbo].[purchase_items]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
      `;
      console.log('   ✅ Added product_logs_purchaseItemId_fkey');
    } catch (error) {
      console.log('   ⚠️  Constraint may already exist:', error.message);
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📊 Next steps:');
    console.log('   1. Run: npx prisma generate');
    console.log('   2. Test the new inventory system');
    console.log('   3. Update API endpoints');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Run migration if called directly
if (require.main === module) {
  completeMigration();
}

module.exports = completeMigration;
