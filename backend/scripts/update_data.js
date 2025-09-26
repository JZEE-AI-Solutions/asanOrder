const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateData() {
  try {
    console.log('Updating business codes and order numbers...');
    
    // Get all tenants
    const tenants = await prisma.tenant.findMany();
    console.log(`Found ${tenants.length} tenants`);
    
    // Update tenants with business codes
    for (let i = 0; i < tenants.length; i++) {
      const businessCode = `100${i + 1}`.padStart(4, '0');
      await prisma.tenant.update({
        where: { id: tenants[i].id },
        data: { businessCode }
      });
      console.log(`Updated tenant ${tenants[i].businessName} with business code ${businessCode}`);
    }
    
    // Get all orders
    const orders = await prisma.order.findMany({
      include: {
        tenant: true
      },
      orderBy: [
        { tenantId: 'asc' },
        { createdAt: 'asc' }
      ]
    });
    
    console.log(`Found ${orders.length} orders`);
    
    // Group orders by tenant and month
    const orderGroups = {};
    
    for (const order of orders) {
      const month = order.createdAt.getMonth() + 1; // 1-12
      const year = order.createdAt.getFullYear().toString().slice(-2); // Last 2 digits
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                         'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const monthName = monthNames[month - 1];
      
      const key = `${order.tenantId}-${year}-${month}`;
      
      if (!orderGroups[key]) {
        orderGroups[key] = {
          tenant: order.tenant,
          year,
          month: monthName,
          orders: []
        };
      }
      
      orderGroups[key].orders.push(order);
    }
    
    // Generate order numbers for each group
    for (const [key, group] of Object.entries(orderGroups)) {
      for (let i = 0; i < group.orders.length; i++) {
        const sequence = (i + 1).toString().padStart(3, '0');
        const orderNumber = `${group.tenant.businessCode}-${group.month}-${group.year}-${sequence}`;
        
        await prisma.order.update({
          where: { id: group.orders[i].id },
          data: { orderNumber }
        });
        
        console.log(`Updated order ${group.orders[i].id} with order number ${orderNumber}`);
      }
    }
    
    console.log('Data updated successfully!');
    
  } catch (error) {
    console.error('Error updating data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateData();
