const prisma = require('../lib/db');

async function checkAllOrders() {
  try {
    console.log('🔍 Checking all orders in database...\n');
    
    // Get all tenants
    const tenants = await prisma.tenant.findMany({
      include: {
        owner: true,
        _count: {
          select: { orders: true }
        }
      }
    });

    console.log('📊 Tenants:');
    tenants.forEach(tenant => {
      console.log(`  - ${tenant.businessName} (ID: ${tenant.id})`);
      console.log(`    Owner: ${tenant.owner?.email}`);
      console.log(`    Orders: ${tenant._count.orders}`);
    });
    console.log('');

    // Get all orders with tenant info
    const allOrders = await prisma.order.findMany({
      include: {
        tenant: {
          select: {
            businessName: true,
            id: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    });

    console.log(`📦 Total Orders in Database: ${allOrders.length}`);
    if (allOrders.length > 0) {
      console.log('\nRecent Orders:');
      allOrders.forEach(order => {
        console.log(`  - Order #${order.orderNumber}`);
        console.log(`    Tenant: ${order.tenant?.businessName} (${order.tenant?.id})`);
        console.log(`    Status: ${order.status}`);
        console.log(`    Created: ${order.createdAt}`);
      });
    } else {
      console.log('⚠️  No orders found in database!');
    }

    // Check users
    console.log('\n👥 Business Owners:');
    const businessOwners = await prisma.user.findMany({
      where: {
        role: 'BUSINESS_OWNER'
      },
      include: {
        tenant: {
          include: {
            _count: {
              select: { orders: true }
            }
          }
        }
      }
    });

    businessOwners.forEach(user => {
      console.log(`  - ${user.email}`);
      if (user.tenant) {
        console.log(`    Tenant: ${user.tenant.businessName} (${user.tenant.id})`);
        console.log(`    Orders: ${user.tenant._count.orders}`);
      } else {
        console.log(`    ⚠️  No tenant assigned!`);
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllOrders();

