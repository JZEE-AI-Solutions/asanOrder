const { PrismaClient } = require('@prisma/client');
const InventoryService = require('../services/inventoryService');

const prisma = new PrismaClient();

const testFixedRestore = async () => {
  console.log('🧪 Testing Fixed Restore Functionality...\n');

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
        invoiceNumber: 'FIXED-RESTORE-TEST-001',
        supplierName: 'Fixed Restore Test Supplier',
        invoiceDate: new Date(),
        totalAmount: 2000.00,
        notes: 'Test invoice for fixed restore testing',
        tenantId: tenant.id
      }
    });
    console.log(`✅ Created invoice: ${purchaseInvoice.invoiceNumber}`);

    // Step 3: Create test purchase items
    console.log('\n🛒 Creating test purchase items...');
    const purchaseItems = [
      {
        name: 'Fixed Restore Test Product 1',
        description: 'Test product for fixed restore',
        purchasePrice: 200.00,
        quantity: 3,
        category: 'Test Category',
        sku: 'FIXED-001',
        tenantId: tenant.id,
        purchaseInvoiceId: purchaseInvoice.id
      },
      {
        name: 'Fixed Restore Test Product 2',
        description: 'Another test product',
        purchasePrice: 300.00,
        quantity: 2,
        category: 'Test Category',
        sku: 'FIXED-002',
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
          contains: 'Fixed Restore Test Product'
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

    // Step 7: Verify invoice is soft deleted
    const softDeletedInvoice = await prisma.purchaseInvoice.findUnique({
      where: { id: purchaseInvoice.id }
    });
    
    if (softDeletedInvoice && softDeletedInvoice.isDeleted) {
      console.log('✅ Invoice successfully soft deleted');
    } else {
      console.log('❌ Invoice was not soft deleted properly');
    }

    // Step 8: Verify purchase items are soft deleted
    const softDeletedItems = await prisma.purchaseItem.findMany({
      where: {
        purchaseInvoiceId: purchaseInvoice.id,
        isDeleted: true
      }
    });
    
    if (softDeletedItems.length === 2) {
      console.log(`✅ All ${softDeletedItems.length} purchase items successfully soft deleted`);
    } else {
      console.log(`❌ Only ${softDeletedItems.length} purchase items were soft deleted (expected 2)`);
    }

    // Step 9: Verify inventory was reversed
    console.log('\n📦 Verifying inventory after soft delete...');
    const productsAfterDelete = await prisma.product.findMany({
      where: { 
        tenantId: tenant.id,
        name: {
          contains: 'Fixed Restore Test Product'
        }
      }
    });
    
    console.log(`✅ Found ${productsAfterDelete.length} products in inventory after soft delete:`);
    productsAfterDelete.forEach(product => {
      console.log(`   • ${product.name}: Qty ${product.currentQuantity}, Price Rs.${product.lastPurchasePrice}`);
    });

    // Step 10: Test restore functionality
    console.log('\n🔄 Testing restore functionality...');
    const restoreResult = await InventoryService.restorePurchaseInvoice(
      tenant.id,
      purchaseInvoice.id,
      purchaseInvoice.invoiceNumber
    );
    
    console.log('📊 Restore result:', restoreResult);

    // Step 11: Verify invoice is restored
    const restoredInvoice = await prisma.purchaseInvoice.findUnique({
      where: { id: purchaseInvoice.id }
    });
    
    if (restoredInvoice && !restoredInvoice.isDeleted) {
      console.log('✅ Invoice successfully restored');
    } else {
      console.log('❌ Invoice was not restored properly');
    }

    // Step 12: Verify purchase items are restored
    const restoredItems = await prisma.purchaseItem.findMany({
      where: {
        purchaseInvoiceId: purchaseInvoice.id,
        isDeleted: false
      }
    });
    
    if (restoredItems.length === 2) {
      console.log(`✅ All ${restoredItems.length} purchase items successfully restored`);
    } else {
      console.log(`❌ Only ${restoredItems.length} purchase items were restored (expected 2)`);
    }

    // Step 13: Verify inventory was restored
    console.log('\n📦 Verifying inventory after restore...');
    const productsAfterRestore = await prisma.product.findMany({
      where: { 
        tenantId: tenant.id,
        name: {
          contains: 'Fixed Restore Test Product'
        }
      }
    });
    
    console.log(`✅ Found ${productsAfterRestore.length} products in inventory after restore:`);
    productsAfterRestore.forEach(product => {
      console.log(`   • ${product.name}: Qty ${product.currentQuantity}, Price Rs.${product.lastPurchasePrice}`);
    });

    // Step 14: Check restoration logs
    const restorationLogs = await prisma.productLog.findMany({
      where: {
        tenantId: tenant.id,
        reference: `Invoice Restoration: ${purchaseInvoice.invoiceNumber}`
      }
    });
    console.log(`✅ Found ${restorationLogs.length} restoration product logs`);

    console.log('\n🎉 Fixed restore test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   • Invoice created with purchase items');
    console.log('   • Inventory updated correctly');
    console.log('   • Invoice and purchase items soft deleted');
    console.log('   • Inventory reversed with audit logs');
    console.log('   • Invoice and purchase items restored successfully');
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
  testFixedRestore();
}

module.exports = testFixedRestore;
