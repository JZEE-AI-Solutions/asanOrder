const prisma = require('../lib/db');
const customerService = require('../services/customerService');

async function fixSuneelaStats() {
  try {
    const phoneNumber = '03444971113';
    
    console.log(`\n🔧 Fixing customer statistics for phone: ${phoneNumber}\n`);
    
    // Find the customer
    const customer = await prisma.customer.findFirst({
      where: {
        phoneNumber: phoneNumber
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
    console.log(`     - totalOrders: ${customer.totalOrders}`);
    console.log(`     - totalSpent: Rs. ${customer.totalSpent}\n`);
    
    // Recalculate stats
    console.log(`📊 Recalculating statistics from actual linked orders...\n`);
    const updatedCustomer = await customerService.recalculateCustomerStats(customer.id);
    
    console.log(`✅ Customer statistics updated successfully!`);
    console.log(`   New Stats:`);
    console.log(`     - totalOrders: ${updatedCustomer.totalOrders}`);
    console.log(`     - totalSpent: Rs. ${updatedCustomer.totalSpent}`);
    console.log(`     - lastOrderDate: ${updatedCustomer.lastOrderDate ? updatedCustomer.lastOrderDate.toISOString() : 'null'}\n`);
    
    await prisma.$disconnect();
    console.log(`✅ Done! The customer list should now show 0 orders instead of 3.\n`);
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixSuneelaStats();

