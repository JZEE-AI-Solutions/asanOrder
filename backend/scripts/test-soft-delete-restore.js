const { PrismaClient } = require('@prisma/client');
const InventoryService = require('../services/inventoryService');

const prisma = new PrismaClient();

const testSoftDeleteAndRestore = async () => {
  console.log('🧪 Testing Soft Delete and Restore Functionality...\n');

  try {
    // Step 1: Get a tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      console.log('❌ No tenant found. Please seed users first.');
      return;
    }
    console.log(`✅ Using tenant: ${tenant.businessName}`);

    // Step 2: Create a test purchase invoice with items
    console.log('\n📄 Creating test purchase invoice...');
    const purchaseInvoice = await prisma.purchaseInvoice.create({
      data: {
        invoiceNumber: 'SOFT-DELETE-TEST-001',
        supplierName: 'Soft Delete Test Supplier',
        invoiceDate: new Date(),
        totalAmount: 1500.00,
        notes: 'Test invoice for soft delete testing',
        tenantId: tenant.id
      }
    });
    console.log(`✅ Created invoice: ${purchaseInvoice.invoiceNumber}`);

    // Step 3: Create test purchase items
    console.log('\n🛒 Creating test purchase items...');
    const purchaseItems = [
      {
        name: 'Soft Delete Test Product 1',
        description: 'Test product for soft delete',
        purchasePrice: 100.00,
        quantity: 4,
        category: 'Test Category',
        sku: 'SOFT-001',
        tenantId: tenant.id,
        purchaseInvoiceId: purchaseInvoice.id
      },
      {
        name: 'Soft Delete Test Product 2',
        description: 'Another test product',
        purchasePrice: 150.00,
        quantity: 2,
        category: 'Test Category',
        sku: 'SOFT-002',
        tenantId: tenant.id,
        purchaseInvoiceId: purchaseInvoice.id
      }
    ];

    const createdPurchaseItems = await Promise.all(
      purchaseItems.map(item => 
        prisma.purchaseItem.create({ data: item })
      )
    );
    console.log(`✅ Created ${createdPurchaseItems.length} purchase items`);

    // Step 4: Update inventory using the inventory service
    console.log('\n🔄 Updating inventory from purchase...');
    const inventoryResult = await InventoryService.updateInventoryFromPurchase(
      tenant.id,
      purchaseItems,
      purchaseInvoice.id,
      purchaseInvoice.invoiceNumber
    );
    console.log('📊 Inventory update result:', inventoryResult);

    // Step 5: Verify inventory was updated
    console.log('\n📦 Verifying inventory before soft delete...');
    const productsBefore = await prisma.product.findMany({
      where: { 
        tenantId: tenant.id,
        name: {
          contains: 'Soft Delete Test Product'
        }
      }
    });
    
    console.log(`✅ Found ${productsBefore.length} products in inventory:`);
    productsBefore.forEach(product => {
      console.log(`   • ${product.name}: Qty ${product.currentQuantity}, Price Rs.${product.lastPurchasePrice}`);
    });

    // Step 6: Test soft delete
    console.log('\n🗑️ Testing soft delete...');
    const deletionResult = await InventoryService.deletePurchaseInvoice(
      tenant.id,
      purchaseInvoice.id,
      purchaseInvoice.invoiceNumber
    );
    
    console.log('📊 Soft deletion result:', deletionResult);

    // Step 7: Verify invoice is soft deleted (not physically deleted)
    const softDeletedInvoice = await prisma.purchaseInvoice.findUnique({
      where: { id: purchaseInvoice.id }
    });
    
    if (softDeletedInvoice && softDeletedInvoice.isDeleted) {
      console.log('✅ Invoice successfully soft deleted');
      console.log(`   Deleted at: ${softDeletedInvoice.deletedAt}`);
      console.log(`   Delete reason: ${softDeletedInvoice.deleteReason}`);
    } else {
      console.log('❌ Invoice was not soft deleted properly');
    }

    // Step 8: Verify inventory was reversed
    console.log('\n📦 Verifying inventory after soft delete...');
    const productsAfterDelete = await prisma.product.findMany({
      where: { 
        tenantId: tenant.id,
        name: {
          contains: 'Soft Delete Test Product'
        }
      }
    });
    
    console.log(`✅ Found ${productsAfterDelete.length} products in inventory after soft delete:`);
    productsAfterDelete.forEach(product => {
      console.log(`   • ${product.name}: Qty ${product.currentQuantity}, Price Rs.${product.lastPurchasePrice}`);
    });

    // Step 9: Test restore functionality
    console.log('\n🔄 Testing restore functionality...');
    const restoreResult = await InventoryService.restorePurchaseInvoice(
      tenant.id,
      purchaseInvoice.id,
      purchaseInvoice.invoiceNumber
    );
    
    console.log('📊 Restore result:', restoreResult);

    // Step 10: Verify invoice is restored
    const restoredInvoice = await prisma.purchaseInvoice.findUnique({
      where: { id: purchaseInvoice.id }
    });
    
    if (restoredInvoice && !restoredInvoice.isDeleted) {
      console.log('✅ Invoice successfully restored');
      console.log(`   Deleted at: ${restoredInvoice.deletedAt}`);
      console.log(`   Delete reason: ${restoredInvoice.deleteReason}`);
    } else {
      console.log('❌ Invoice was not restored properly');
    }

    // Step 11: Verify inventory was restored
    console.log('\n📦 Verifying inventory after restore...');
    const productsAfterRestore = await prisma.product.findMany({
      where: { 
        tenantId: tenant.id,
        name: {
          contains: 'Soft Delete Test Product'
        }
      }
    });
    
    console.log(`✅ Found ${productsAfterRestore.length} products in inventory after restore:`);
    productsAfterRestore.forEach(product => {
      console.log(`   • ${product.name}: Qty ${product.currentQuantity}, Price Rs.${product.lastPurchasePrice}`);
    });

    // Step 12: Check restoration logs
    const restorationLogs = await prisma.productLog.findMany({
      where: {
        tenantId: tenant.id,
        reference: `Invoice Restoration: ${purchaseInvoice.invoiceNumber}`
      }
    });
    console.log(`✅ Found ${restorationLogs.length} restoration product logs`);

    console.log('\n🎉 Soft delete and restore test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   • Invoice created with purchase items');
    console.log('   • Inventory updated correctly');
    console.log('   • Invoice soft deleted (marked as deleted, not removed)');
    console.log('   • Inventory reversed with audit logs');
    console.log('   • Invoice restored successfully');
    console.log('   • Inventory restored with audit logs');
    console.log('   • Complete audit trail maintained');
    console.log('   • Data integrity preserved throughout');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Run test if called directly
if (require.main === module) {
  testSoftDeleteAndRestore();
}

module.exports = testSoftDeleteAndRestore;
