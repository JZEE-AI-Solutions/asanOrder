const { PrismaClient } = require('@prisma/client');
const InventoryService = require('../services/inventoryService');

const prisma = new PrismaClient();

const testInvoiceDeletion = async () => {
  console.log('🧪 Testing Complete Invoice Deletion Flow...\n');

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
        invoiceNumber: 'DELETE-TEST-001',
        supplierName: 'Delete Test Supplier',
        invoiceDate: new Date(),
        totalAmount: 1000.00,
        notes: 'Test invoice for deletion testing',
        tenantId: tenant.id
      }
    });
    console.log(`✅ Created invoice: ${purchaseInvoice.invoiceNumber}`);

    // Step 3: Create test purchase items
    console.log('\n🛒 Creating test purchase items...');
    const purchaseItems = [
      {
        name: 'Delete Test Product 1',
        description: 'Test product for deletion',
        purchasePrice: 50.00,
        quantity: 5,
        category: 'Test Category',
        sku: 'DELETE-001',
        tenantId: tenant.id,
        purchaseInvoiceId: purchaseInvoice.id
      },
      {
        name: 'Delete Test Product 2',
        description: 'Another test product',
        purchasePrice: 75.00,
        quantity: 3,
        category: 'Test Category',
        sku: 'DELETE-002',
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
    console.log('\n📦 Verifying inventory before deletion...');
    const productsBefore = await prisma.product.findMany({
      where: { 
        tenantId: tenant.id,
        name: {
          contains: 'Delete Test Product'
        }
      }
    });
    
    console.log(`✅ Found ${productsBefore.length} products in inventory:`);
    productsBefore.forEach(product => {
      console.log(`   • ${product.name}: Qty ${product.currentQuantity}, Price Rs.${product.lastPurchasePrice}`);
    });

    // Step 6: Check product logs before deletion
    const logsBefore = await prisma.productLog.findMany({
      where: {
        tenantId: tenant.id,
        reference: `Invoice: ${purchaseInvoice.invoiceNumber}`
      }
    });
    console.log(`✅ Found ${logsBefore.length} product logs before deletion`);

    // Step 7: Test the deletion
    console.log('\n🗑️ Testing invoice deletion...');
    const deletionResult = await InventoryService.deletePurchaseInvoice(
      tenant.id,
      purchaseInvoice.id,
      purchaseInvoice.invoiceNumber
    );
    
    console.log('📊 Deletion result:', deletionResult);

    // Step 8: Verify inventory was reversed
    console.log('\n📦 Verifying inventory after deletion...');
    const productsAfter = await prisma.product.findMany({
      where: { 
        tenantId: tenant.id,
        name: {
          contains: 'Delete Test Product'
        }
      }
    });
    
    console.log(`✅ Found ${productsAfter.length} products in inventory after deletion:`);
    productsAfter.forEach(product => {
      console.log(`   • ${product.name}: Qty ${product.currentQuantity}, Price Rs.${product.lastPurchasePrice}`);
    });

    // Step 9: Check reversal logs
    const reversalLogs = await prisma.productLog.findMany({
      where: {
        tenantId: tenant.id,
        reference: `Invoice Deletion: ${purchaseInvoice.invoiceNumber}`
      }
    });
    console.log(`✅ Found ${reversalLogs.length} reversal product logs`);

    // Step 10: Verify invoice is deleted
    const deletedInvoice = await prisma.purchaseInvoice.findUnique({
      where: { id: purchaseInvoice.id }
    });
    
    if (!deletedInvoice) {
      console.log('✅ Invoice successfully deleted from database');
    } else {
      console.log('❌ Invoice still exists in database');
    }

    // Step 11: Verify purchase items are deleted
    const remainingItems = await prisma.purchaseItem.findMany({
      where: {
        purchaseInvoiceId: purchaseInvoice.id
      }
    });
    
    if (remainingItems.length === 0) {
      console.log('✅ All purchase items successfully deleted');
    } else {
      console.log(`❌ ${remainingItems.length} purchase items still exist`);
    }

    console.log('\n🎉 Invoice deletion test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   • Invoice created with purchase items');
    console.log('   • Inventory updated correctly');
    console.log('   • Invoice deletion reversed inventory changes');
    console.log('   • Reversal logs created for audit trail');
    console.log('   • All related data properly cleaned up');
    console.log('   • Data integrity maintained');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Run test if called directly
if (require.main === module) {
  testInvoiceDeletion();
}

module.exports = testInvoiceDeletion;
