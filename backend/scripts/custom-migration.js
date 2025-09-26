const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const customMigration = async () => {
  console.log('🔄 Starting custom inventory migration...\n');

  try {
    // Step 1: Create new tables first
    console.log('📋 Creating new tables...');
    
    // Create purchase_items table
    await prisma.$executeRaw`
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
    `;

    // Create product_logs table
    await prisma.$executeRaw`
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
    `;

    console.log('✅ New tables created');

    // Step 2: Migrate existing products to purchase_items
    console.log('\n📦 Migrating existing products to purchase_items...');
    
    const existingProducts = await prisma.$queryRaw`
      SELECT * FROM [dbo].[products]
    `;
    console.log(`   Found ${existingProducts.length} products to migrate`);

    for (const product of existingProducts) {
      await prisma.$executeRaw`
        INSERT INTO [dbo].[purchase_items] (
          [id], [name], [description], [purchasePrice], [quantity], 
          [category], [sku], [image], [imageData], [imageType], 
          [createdAt], [updatedAt], [tenantId], [purchaseInvoiceId]
        ) VALUES (
          ${product.id}, ${product.name}, ${product.description}, 
          ${product.purchasePrice}, ${product.quantity}, 
          ${product.category}, ${product.sku}, ${product.image}, 
          ${product.imageData}, ${product.imageType}, 
          ${product.createdAt}, ${product.updatedAt}, 
          ${product.tenantId}, ${product.purchaseInvoiceId}
        );
      `;
    }

    console.log('✅ Products migrated to purchase_items');

    // Step 3: Update products table structure
    console.log('\n🔧 Updating products table structure...');
    
    // Drop foreign key constraint first
    await prisma.$executeRaw`
      ALTER TABLE [dbo].[products] DROP CONSTRAINT [products_purchaseInvoiceId_fkey];
    `;

    // Drop default constraint on quantity
    await prisma.$executeRaw`
      ALTER TABLE [dbo].[products] DROP CONSTRAINT [products_quantity_df];
    `;

    // Drop columns
    await prisma.$executeRaw`
      ALTER TABLE [dbo].[products] DROP COLUMN [purchaseInvoiceId], [purchasePrice], [quantity], [sellingPrice];
    `;

    // Add new columns
    await prisma.$executeRaw`
      ALTER TABLE [dbo].[products] ADD 
        [currentQuantity] INT NOT NULL CONSTRAINT [products_currentQuantity_df] DEFAULT 0,
        [currentRetailPrice] FLOAT(53),
        [lastPurchasePrice] FLOAT(53),
        [lastUpdated] DATETIME2 NOT NULL CONSTRAINT [products_lastUpdated_df] DEFAULT CURRENT_TIMESTAMP,
        [maxStockLevel] INT,
        [minStockLevel] INT NOT NULL CONSTRAINT [products_minStockLevel_df] DEFAULT 0;
    `;

    console.log('✅ Products table structure updated');

    // Step 4: Add foreign key constraints
    console.log('\n🔗 Adding foreign key constraints...');
    
    await prisma.$executeRaw`
      ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_tenantId_fkey] 
      FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
    `;

    await prisma.$executeRaw`
      ALTER TABLE [dbo].[purchase_items] ADD CONSTRAINT [purchase_items_purchaseInvoiceId_fkey] 
      FOREIGN KEY ([purchaseInvoiceId]) REFERENCES [dbo].[purchase_invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
    `;

    await prisma.$executeRaw`
      ALTER TABLE [dbo].[product_logs] ADD CONSTRAINT [product_logs_tenantId_fkey] 
      FOREIGN KEY ([tenantId]) REFERENCES [dbo].[tenants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
    `;

    await prisma.$executeRaw`
      ALTER TABLE [dbo].[product_logs] ADD CONSTRAINT [product_logs_productId_fkey] 
      FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
    `;

    await prisma.$executeRaw`
      ALTER TABLE [dbo].[product_logs] ADD CONSTRAINT [product_logs_purchaseItemId_fkey] 
      FOREIGN KEY ([purchaseItemId]) REFERENCES [dbo].[purchase_items]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
    `;

    console.log('✅ Foreign key constraints added');

    // Step 5: Create consolidated products
    console.log('\n📊 Creating consolidated products...');
    
    const purchaseItems = await prisma.$queryRaw`
      SELECT 
        [name], [description], [category], [sku], [image], [imageData], [imageType], [tenantId],
        SUM([quantity]) as totalQuantity,
        MAX([purchasePrice]) as lastPurchasePrice,
        MAX([createdAt]) as lastPurchaseDate
      FROM [dbo].[purchase_items]
      GROUP BY [name], [description], [category], [sku], [image], [imageData], [imageType], [tenantId]
    `;

    for (const item of purchaseItems) {
      const productId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await prisma.$executeRaw`
        INSERT INTO [dbo].[products] (
          [id], [name], [description], [category], [sku], [image], [imageData], [imageType],
          [currentQuantity], [lastPurchasePrice], [currentRetailPrice], [isActive], 
          [lastUpdated], [createdAt], [updatedAt], [tenantId]
        ) VALUES (
          ${productId}, ${item.name}, ${item.description}, ${item.category}, ${item.sku}, 
          ${item.image}, ${item.imageData}, ${item.imageType},
          ${item.totalQuantity}, ${item.lastPurchasePrice}, ${item.lastPurchasePrice}, 1,
          ${item.lastPurchaseDate}, ${item.lastPurchaseDate}, ${item.lastPurchaseDate}, ${item.tenantId}
        );
      `;
    }

    console.log(`✅ Created ${purchaseItems.length} consolidated products`);

    console.log('\n🎉 Custom migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Run migration if called directly
if (require.main === module) {
  customMigration();
}

module.exports = customMigration;
