const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const testInventoryFlow = async () => {
  console.log('🧪 Testing inventory flow with purchase invoice...\n');

  try {
    // Step 1: Get a tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      console.log('❌ No tenant found. Please seed users first.');
      return;
    }
    console.log(`✅ Using tenant: ${tenant.businessName}`);

    // Step 2: Create a test purchase invoice
    console.log('\n📄 Creating test purchase invoice...');
    const purchaseInvoice = await prisma.purchaseInvoice.create({
      data: {
        invoiceNumber: 'TEST-INV-001',
        supplierName: 'Test Supplier',
        invoiceDate: new Date(),
        totalAmount: 1500.00,
        notes: 'Test invoice for inventory flow',
        tenantId: tenant.id
      }
    });
    console.log(`✅ Created invoice: ${purchaseInvoice.invoiceNumber}`);

    // Step 3: Create test purchase items
    console.log('\n🛒 Creating test purchase items...');
    const purchaseItems = [
      {
        name: 'Test Product 1',
        description: 'Test product description 1',
        purchasePrice: 100.00,
        quantity: 5,
        category: 'Test Category',
        sku: 'TEST-001',
        tenantId: tenant.id,
        purchaseInvoiceId: purchaseInvoice.id
      },
      {
        name: 'Test Product 2',
        description: 'Test product description 2',
        purchasePrice: 200.00,
        quantity: 3,
        category: 'Test Category',
        sku: 'TEST-002',
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

    // Step 4: Test inventory service
    console.log('\n🔄 Testing inventory service...');
    const InventoryService = require('../services/inventoryService');
    
    const inventoryResult = await InventoryService.updateInventoryFromPurchase(
      tenant.id,
      purchaseItems,
      purchaseInvoice.id,
      purchaseInvoice.invoiceNumber
    );
    
    console.log('📊 Inventory update result:', inventoryResult);

    // Step 5: Verify products were created/updated
    console.log('\n📦 Verifying products in inventory...');
    const products = await prisma.product.findMany({
      where: { tenantId: tenant.id }
    });
    
    console.log(`✅ Found ${products.length} products in inventory:`);
    products.forEach(product => {
      console.log(`   • ${product.name}: Qty ${product.currentQuantity}, Price Rs.${product.lastPurchasePrice}`);
    });

    // Step 6: Verify product logs were created
    console.log('\n📊 Verifying product logs...');
    const logs = await prisma.productLog.findMany({
      where: { tenantId: tenant.id },
      include: {
        product: { select: { name: true } }
      }
    });
    
    console.log(`✅ Found ${logs.length} product logs:`);
    logs.forEach(log => {
      console.log(`   • ${log.product?.name}: ${log.action} - Qty: ${log.quantity}, Reason: ${log.reason}`);
    });

    // Step 7: Test adding more of the same product
    console.log('\n🔄 Testing inventory update with existing product...');
    const additionalItems = [
      {
        name: 'Test Product 1', // Same name as existing
        description: 'Test product description 1',
        purchasePrice: 120.00, // Different price
        quantity: 2,
        category: 'Test Category',
        sku: 'TEST-001',
        tenantId: tenant.id,
        purchaseInvoiceId: purchaseInvoice.id
      }
    ];

    const additionalResult = await InventoryService.updateInventoryFromPurchase(
      tenant.id,
      additionalItems,
      purchaseInvoice.id,
      purchaseInvoice.invoiceNumber
    );
    
    console.log('📊 Additional inventory update result:', additionalResult);

    // Step 8: Verify updated quantities
    console.log('\n📦 Verifying updated inventory...');
    const updatedProducts = await prisma.product.findMany({
      where: { tenantId: tenant.id }
    });
    
    console.log(`✅ Updated products:`);
    updatedProducts.forEach(product => {
      console.log(`   • ${product.name}: Qty ${product.currentQuantity}, Price Rs.${product.lastPurchasePrice}`);
    });

    console.log('\n🎉 Inventory flow test completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   • Purchase Invoice: ${purchaseInvoice.invoiceNumber}`);
    console.log(`   • Purchase Items: ${createdPurchaseItems.length}`);
    console.log(`   • Products in Inventory: ${products.length}`);
    console.log(`   • Product Logs: ${logs.length}`);
    console.log(`   • Inventory Updates: ${inventoryResult.productsUpdated + inventoryResult.productsCreated}`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Run test if called directly
if (require.main === module) {
  testInventoryFlow();
}

module.exports = testInventoryFlow;
