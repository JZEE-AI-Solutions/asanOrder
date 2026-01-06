const prisma = require('../lib/db');

async function fixCustomerStats() {
  try {
    const phoneNumber = '03444971113';
    
    console.log(`\n🔧 Fixing customer statistics for phone: ${phoneNumber}\n`);
    
    // Get the customer record
    const customer = await prisma.customer.findFirst({
      where: {
        phoneNumber: phoneNumber
      },
      include: {
        orders: {
          select: {
            paymentAmount: true,
            shippingCharges: true,
            createdAt: true
          }
        }
      }
    });
    
    if (!customer) {
      console.log(`❌ Customer not found with phone ${phoneNumber}`);
      await prisma.$disconnect();
      return;
    }
    
    console.log(`✅ Found customer: ${customer.name} (${customer.phoneNumber})`);
    console.log(`   Customer ID: ${customer.id}`);
    console.log(`   Current Stats:`);
    console.log(`     - totalOrders: ${customer.totalOrders} (should be ${customer.orders.length})`);
    console.log(`     - totalSpent: Rs. ${customer.totalSpent}`);
    console.log(`     - Actual Orders Linked: ${customer.orders.length}\n`);
    
    // Recalculate based on actual linked orders
    const actualTotalOrders = customer.orders.length;
    const actualTotalSpent = customer.orders.reduce((sum, order) => {
      return sum + (order.paymentAmount || 0) + (order.shippingCharges || 0);
    }, 0);
    const lastOrderDate = customer.orders.length > 0 
      ? customer.orders.sort((a, b) => b.createdAt - a.createdAt)[0].createdAt
      : null;
    
    console.log(`📊 Corrected Statistics:`);
    console.log(`     - totalOrders: ${actualTotalOrders}`);
    console.log(`     - totalSpent: Rs. ${actualTotalSpent}`);
    console.log(`     - lastOrderDate: ${lastOrderDate ? lastOrderDate.toISOString() : 'null'}\n`);
    
    // Update customer record
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        totalOrders: actualTotalOrders,
        totalSpent: actualTotalSpent,
        lastOrderDate: lastOrderDate
      }
    });
    
    console.log(`✅ Customer statistics updated successfully!\n`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixCustomerStats();

