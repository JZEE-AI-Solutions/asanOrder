const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const testPurchaseItemLinking = async () => {
  console.log('🧪 Testing purchase item linking in product logs...\n');

  try {
    // Step 1: Get a tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      console.log('❌ No tenant found. Please seed users first.');
      return;
    }
    console.log(`✅ Using tenant: ${tenant.businessName}`);

    // Step 2: Create a fresh test purchase invoice
    console.log('\n📄 Creating fresh test purchase invoice...');
    const purchaseInvoice = await prisma.purchaseInvoice.create({
      data: {
        invoiceNumber: 'LINK-TEST-001',
        supplierName: 'Link Test Supplier',
        invoiceDate: new Date(),
        totalAmount: 500.00,
        notes: 'Test invoice for purchase item linking',
        tenantId: tenant.id
      }
    });
    console.log(`✅ Created invoice: ${purchaseInvoice.invoiceNumber}`);

    // Step 3: Create test purchase items
    console.log('\n🛒 Creating test purchase items...');
    const purchaseItems = [
      {
        name: 'Link Test Product 1',
        description: 'Test product for linking verification',
        purchasePrice: 50.00,
        quantity: 2,
        category: 'Test Category',
        sku: 'LINK-001',
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
    console.log('\n🔄 Testing inventory service with purchase item linking...');
    const InventoryService = require('../services/inventoryService');
    
    const inventoryResult = await InventoryService.updateInventoryFromPurchase(
      tenant.id,
      purchaseItems,
      purchaseInvoice.id,
      purchaseInvoice.invoiceNumber
    );
    
    console.log('📊 Inventory update result:', inventoryResult);

    // Step 5: Verify product logs have purchase item IDs
    console.log('\n📊 Verifying product logs with purchase item linking...');
    const logs = await prisma.productLog.findMany({
      where: { 
        tenantId: tenant.id,
        reference: `Invoice: ${purchaseInvoice.invoiceNumber}`
      },
      include: {
        product: { select: { name: true } },
        purchaseItem: { 
          select: { 
            id: true, 
            name: true, 
            purchasePrice: true, 
            quantity: true 
          } 
        }
      }
    });
    
    console.log(`✅ Found ${logs.length} product logs:`);
    logs.forEach(log => {
      console.log(`   • Product: ${log.product?.name}`);
      console.log(`     Action: ${log.action}`);
      console.log(`     Quantity: ${log.quantity}`);
      console.log(`     Purchase Item ID: ${log.purchaseItemId || 'NULL'}`);
      if (log.purchaseItem) {
        console.log(`     Purchase Item: ${log.purchaseItem.name} (Rs.${log.purchaseItem.purchasePrice}, Qty: ${log.purchaseItem.quantity})`);
      }
      console.log(`     Reason: ${log.reason}`);
      console.log('');
    });

    // Step 6: Verify the linking is correct
    console.log('🔍 Verifying purchase item linking accuracy...');
    let correctLinks = 0;
    let totalLogs = logs.length;

    for (const log of logs) {
      if (log.purchaseItemId && log.purchaseItem) {
        // Check if the purchase item matches the log details
        const matches = (
          log.purchaseItem.name === log.product?.name &&
          log.purchaseItem.quantity === log.quantity &&
          log.purchaseItem.purchasePrice === log.newPrice
        );
        
        if (matches) {
          correctLinks++;
          console.log(`   ✅ Log ${log.id}: Correctly linked to purchase item ${log.purchaseItemId}`);
        } else {
          console.log(`   ❌ Log ${log.id}: Incorrectly linked to purchase item ${log.purchaseItemId}`);
        }
      } else {
        console.log(`   ⚠️  Log ${log.id}: No purchase item linked`);
      }
    }

    console.log(`\n📊 Linking Accuracy: ${correctLinks}/${totalLogs} (${Math.round((correctLinks/totalLogs)*100)}%)`);

    if (correctLinks === totalLogs) {
      console.log('🎉 All product logs are correctly linked to their purchase items!');
    } else {
      console.log('⚠️  Some product logs are not correctly linked to purchase items.');
    }

    console.log('\n🎉 Purchase item linking test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Run test if called directly
if (require.main === module) {
  testPurchaseItemLinking();
}

module.exports = testPurchaseItemLinking;
