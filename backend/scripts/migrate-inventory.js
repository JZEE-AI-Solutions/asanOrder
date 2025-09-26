const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const migrateInventory = async () => {
  console.log('🔄 Starting inventory system migration...\n');

  try {
    // Step 1: Check if we have existing products
    const existingProducts = await prisma.product.findMany({
      include: {
        purchaseInvoice: true
      }
    });

    console.log(`📦 Found ${existingProducts.length} existing products to migrate`);

    if (existingProducts.length > 0) {
      console.log('\n🔄 Migrating existing products to new structure...');
      
      // Group products by name to consolidate inventory
      const productGroups = {};
      
      for (const product of existingProducts) {
        const key = product.name.toLowerCase().trim();
        if (!productGroups[key]) {
          productGroups[key] = {
            name: product.name,
            description: product.description,
            category: product.category,
            sku: product.sku,
            currentQuantity: 0,
            lastPurchasePrice: null,
            currentRetailPrice: product.sellingPrice,
            image: product.image,
            imageData: product.imageData,
            imageType: product.imageType,
            tenantId: product.tenantId,
            purchaseItems: []
          };
        }
        
        // Add to quantity and track purchase items
        productGroups[key].currentQuantity += product.quantity;
        productGroups[key].purchaseItems.push({
          id: product.id,
          purchasePrice: product.purchasePrice,
          quantity: product.quantity,
          purchaseInvoiceId: product.purchaseInvoiceId,
          createdAt: product.createdAt
        });
        
        // Update last purchase price if this is more recent
        if (!productGroups[key].lastPurchasePrice || 
            (product.purchaseInvoice && product.purchaseInvoice.invoiceDate > 
             (productGroups[key].lastPurchaseDate || new Date(0)))) {
          productGroups[key].lastPurchasePrice = product.purchasePrice;
          productGroups[key].lastPurchaseDate = product.purchaseInvoice?.invoiceDate;
        }
      }

      // Create new Product records
      for (const [key, productData] of Object.entries(productGroups)) {
        console.log(`   📝 Creating product: ${productData.name} (Qty: ${productData.currentQuantity})`);
        
        const newProduct = await prisma.product.create({
          data: {
            name: productData.name,
            description: productData.description,
            category: productData.category,
            sku: productData.sku,
            currentQuantity: productData.currentQuantity,
            lastPurchasePrice: productData.lastPurchasePrice,
            currentRetailPrice: productData.currentRetailPrice,
            image: productData.image,
            imageData: productData.imageData,
            imageType: productData.imageType,
            tenantId: productData.tenantId
          }
        });

        // Create product logs for each purchase item
        for (const purchaseItem of productData.purchaseItems) {
          await prisma.productLog.create({
            data: {
              action: 'INCREASE',
              quantity: purchaseItem.quantity,
              newQuantity: productData.currentQuantity,
              newPrice: purchaseItem.purchasePrice,
              reason: 'Initial migration from purchase items',
              reference: `Purchase Item: ${purchaseItem.id}`,
              notes: `Migrated from old product structure`,
              tenantId: productData.tenantId,
              productId: newProduct.id
            }
          });
        }
      }
    }

    console.log('\n✅ Inventory migration completed successfully!');
    console.log('\n📊 Migration Summary:');
    console.log(`   • ${Object.keys(productGroups).length} unique products created`);
    console.log(`   • ${existingProducts.length} purchase items migrated`);
    console.log(`   • Product logs created for audit trail`);
    
    console.log('\n🎯 Next Steps:');
    console.log('   1. Run: npx prisma migrate dev --name inventory-restructure');
    console.log('   2. Test the new inventory system');
    console.log('   3. Update API endpoints to use new structure');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Run migration if called directly
if (require.main === module) {
  migrateInventory();
}

module.exports = migrateInventory;
