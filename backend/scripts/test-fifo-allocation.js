const prisma = require('../lib/db');
const profitService = require('../services/profitService');

async function testFIFOAllocation() {
  try {
    console.log('🧪 Testing FIFO Allocation Logic\n');
    
    // Get the purchase invoices
    const invoice1 = await prisma.purchaseInvoice.findFirst({
      where: { invoiceNumber: '1005-DEC-25-001' }
    });
    
    const invoice2 = await prisma.purchaseInvoice.findFirst({
      where: { invoiceNumber: '1005-DEC-25-002' }
    });
    
    const order1 = await prisma.order.findFirst({
      where: { orderNumber: '1005-DEC-25-001' }
    });

    if (!invoice1 || !invoice2 || !order1) {
      console.log('❌ Could not find invoices or order');
      await prisma.$disconnect();
      return;
    }

    console.log('📋 Current State:');
    console.log(`   Invoice 1005-DEC-25-001 created: ${invoice1.createdAt}`);
    console.log(`   Invoice 1005-DEC-25-002 created: ${invoice2.createdAt}`);
    console.log(`   Order 1005-DEC-25-001 created: ${order1.createdAt}`);
    console.log(`   Order 1005-DEC-25-001 status: ${order1.status}`);
    
    // Parse order quantities
    const productQuantities = typeof order1.productQuantities === 'string'
      ? JSON.parse(order1.productQuantities)
      : order1.productQuantities;
    
    console.log(`   Order quantity: ${JSON.stringify(productQuantities)}`);
    console.log('');

    // Calculate profit for Invoice 1
    console.log('📊 Invoice 1005-DEC-25-001 Profit Calculation:');
    const profit1 = await profitService.calculatePurchaseInvoiceProfit(invoice1.id, invoice1.tenantId);
    if (profit1.items && profit1.items.length > 0) {
      profit1.items.forEach(item => {
        console.log(`   Product: ${item.productName}`);
        console.log(`   Quantity: ${item.quantity}`);
        console.log(`   Sold: ${item.soldQuantity}`);
        console.log(`   Revenue: Rs. ${item.revenue.toFixed(2)}`);
      });
    }
    console.log('');

    // Calculate profit for Invoice 2
    console.log('📊 Invoice 1005-DEC-25-002 Profit Calculation:');
    const profit2 = await profitService.calculatePurchaseInvoiceProfit(invoice2.id, invoice2.tenantId);
    if (profit2.items && profit2.items.length > 0) {
      profit2.items.forEach(item => {
        console.log(`   Product: ${item.productName}`);
        console.log(`   Quantity: ${item.quantity}`);
        console.log(`   Sold: ${item.soldQuantity}`);
        console.log(`   Revenue: Rs. ${item.revenue.toFixed(2)}`);
      });
    }
    console.log('');

    // Expected behavior
    console.log('✅ Expected Behavior:');
    const orderQty = productQuantities && Object.values(productQuantities)[0] || 2;
    console.log(`   If Order quantity = ${orderQty}:`);
    console.log(`   - Invoice 1005-DEC-25-001 should show: ${Math.min(2, orderQty)}/2 sold`);
    console.log(`   - Invoice 1005-DEC-25-002 should show: ${Math.max(0, orderQty - 2)}/10 sold`);
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testFIFOAllocation();

