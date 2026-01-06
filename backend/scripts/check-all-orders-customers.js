const prisma = require('../lib/db');

async function checkAllOrdersCustomers() {
  try {
    console.log(`\n🔍 Checking all orders and their customer links:\n`);
    
    // Get all orders
    const allOrders = await prisma.order.findMany({
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phoneNumber: true
          }
        },
        tenant: {
          select: {
            businessName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`Total Orders: ${allOrders.length}\n`);
    
    // Group orders by customer link status
    const ordersWithCustomer = [];
    const ordersWithoutCustomer = [];
    const ordersWithPhone03444971113 = [];
    
    for (const order of allOrders) {
      // Parse formData
      let formData = {};
      let phoneNumber = null;
      let customerName = null;
      
      try {
        formData = typeof order.formData === 'string' 
          ? JSON.parse(order.formData) 
          : order.formData;
        
        // Find phone number in formData
        const phoneFields = Object.keys(formData).filter(key => 
          key.toLowerCase().includes('phone') || 
          key.toLowerCase().includes('mobile') ||
          key.toLowerCase().includes('contact')
        );
        
        if (phoneFields.length > 0) {
          phoneNumber = formData[phoneFields[0]];
        }
        
        customerName = formData['Customer Name'] || formData['Name'] || null;
      } catch (e) {
        // Ignore parsing errors
      }
      
      const orderInfo = {
        orderNumber: order.orderNumber,
        id: order.id,
        status: order.status,
        customerId: order.customerId,
        linkedCustomer: order.customer,
        phoneInFormData: phoneNumber,
        customerNameInFormData: customerName,
        createdAt: order.createdAt,
        tenant: order.tenant.businessName
      };
      
      if (order.customerId) {
        ordersWithCustomer.push(orderInfo);
      } else {
        ordersWithoutCustomer.push(orderInfo);
      }
      
      // Check if phone number matches
      if (phoneNumber && phoneNumber.toString().includes('03444971113')) {
        ordersWithPhone03444971113.push(orderInfo);
      }
    }
    
    console.log(`📊 Orders with customer link: ${ordersWithCustomer.length}`);
    console.log(`📊 Orders without customer link: ${ordersWithoutCustomer.length}`);
    console.log(`📊 Orders with phone 03444971113: ${ordersWithPhone03444971113.length}\n`);
    
    // Show orders with phone 03444971113
    if (ordersWithPhone03444971113.length > 0) {
      console.log(`\n✅ Orders with phone "03444971113" in formData:\n`);
      ordersWithPhone03444971113.forEach((order, index) => {
        console.log(`${index + 1}. Order #${order.orderNumber}`);
        console.log(`   ID: ${order.id}`);
        console.log(`   Status: ${order.status}`);
        console.log(`   Customer ID: ${order.customerId || 'NULL (NOT LINKED!)'}`);
        console.log(`   Linked Customer: ${order.linkedCustomer ? `${order.linkedCustomer.name} (${order.linkedCustomer.phoneNumber})` : 'NONE'}`);
        console.log(`   Customer Name in FormData: ${order.customerNameInFormData || 'N/A'}`);
        console.log(`   Phone in FormData: ${order.phoneInFormData}`);
        console.log(`   Created: ${order.createdAt.toISOString()}`);
        console.log('');
      });
    }
    
    // Show orders without customer link
    if (ordersWithoutCustomer.length > 0) {
      console.log(`\n⚠️  Orders without customer link (customerId is NULL):\n`);
      ordersWithoutCustomer.slice(0, 10).forEach((order, index) => {
        console.log(`${index + 1}. Order #${order.orderNumber}`);
        console.log(`   Customer Name: ${order.customerNameInFormData || 'N/A'}`);
        console.log(`   Phone: ${order.phoneInFormData || 'N/A'}`);
        console.log(`   Status: ${order.status}`);
        console.log('');
      });
      if (ordersWithoutCustomer.length > 10) {
        console.log(`   ... and ${ordersWithoutCustomer.length - 10} more orders without customer link\n`);
      }
    }
    
    // Check the specific customer record
    console.log(`\n🔍 Checking customer record for phone "03444971113":\n`);
    const customer = await prisma.customer.findFirst({
      where: {
        phoneNumber: '03444971113'
      },
      include: {
        orders: {
          select: {
            orderNumber: true,
            status: true,
            createdAt: true
          }
        }
      }
    });
    
    if (customer) {
      console.log(`Customer ID: ${customer.id}`);
      console.log(`Name: ${customer.name}`);
      console.log(`Phone: ${customer.phoneNumber}`);
      console.log(`Total Orders (from customer.totalOrders): ${customer.totalOrders}`);
      console.log(`Total Spent: Rs. ${customer.totalSpent}`);
      console.log(`Actual Orders Linked (from orders relation): ${customer.orders.length}`);
      
      if (customer.orders.length === 0 && customer.totalOrders > 0) {
        console.log(`\n⚠️  ISSUE DETECTED: Customer record shows ${customer.totalOrders} orders, but no orders are actually linked!`);
        console.log(`   This means the customer.totalOrders field is out of sync with the actual order links.\n`);
      }
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkAllOrdersCustomers();

