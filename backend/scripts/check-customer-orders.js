const prisma = require('../lib/db');

async function checkCustomerOrders() {
  try {
    const phoneNumber = '03444971113';
    const customerName = 'Suneela';
    
    console.log(`\n🔍 Checking customer records and orders for:`);
    console.log(`   Phone: ${phoneNumber}`);
    console.log(`   Name: ${customerName}\n`);
    
    // Find all customers with this phone number
    const customers = await prisma.customer.findMany({
      where: {
        phoneNumber: phoneNumber
      },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentAmount: true,
            shippingCharges: true,
            createdAt: true,
            formData: true
          }
        },
        tenant: {
          select: {
            businessName: true
          }
        }
      }
    });
    
    console.log(`📊 Found ${customers.length} customer record(s) with phone ${phoneNumber}:\n`);
    
    customers.forEach((customer, index) => {
      console.log(`Customer ${index + 1}:`);
      console.log(`  ID: ${customer.id}`);
      console.log(`  Name: ${customer.name || 'N/A'}`);
      console.log(`  Phone: ${customer.phoneNumber}`);
      console.log(`  Email: ${customer.email || 'N/A'}`);
      console.log(`  Tenant: ${customer.tenant.businessName}`);
      console.log(`  Total Orders (from customer record): ${customer.totalOrders}`);
      console.log(`  Total Spent: Rs. ${customer.totalSpent}`);
      console.log(`  Actual Orders Linked: ${customer.orders.length}`);
      
      if (customer.orders.length > 0) {
        console.log(`  Orders:`);
        customer.orders.forEach((order, orderIndex) => {
          // Parse formData to get customer name from order
          let orderCustomerName = 'N/A';
          try {
            const formData = typeof order.formData === 'string' 
              ? JSON.parse(order.formData) 
              : order.formData;
            orderCustomerName = formData['Customer Name'] || formData['Name'] || 'N/A';
          } catch (e) {
            // Ignore parsing errors
          }
          
          console.log(`    ${orderIndex + 1}. Order #${order.orderNumber}`);
          console.log(`       Status: ${order.status}`);
          console.log(`       Payment: Rs. ${order.paymentAmount || 0}`);
          console.log(`       Shipping: Rs. ${order.shippingCharges || 0}`);
          console.log(`       Customer Name in Order: ${orderCustomerName}`);
          console.log(`       Created: ${order.createdAt.toISOString()}`);
        });
      }
      console.log('');
    });
    
    // Also check for customers with similar name but different phone
    console.log(`\n🔍 Checking for other customers named "${customerName}":\n`);
    const customersWithName = await prisma.customer.findMany({
      where: {
        name: {
          contains: customerName,
          mode: 'insensitive'
        }
      },
      include: {
        orders: {
          select: {
            orderNumber: true,
            status: true,
            createdAt: true
          }
        },
        tenant: {
          select: {
            businessName: true
          }
        }
      }
    });
    
    console.log(`Found ${customersWithName.length} customer(s) with name containing "${customerName}":\n`);
    customersWithName.forEach((customer, index) => {
      console.log(`${index + 1}. ${customer.name} - ${customer.phoneNumber}`);
      console.log(`   Orders: ${customer.orders.length}`);
      customer.orders.forEach(order => {
        console.log(`     - ${order.orderNumber} (${order.status})`);
      });
      console.log('');
    });
    
    // Check all orders and see which ones have this phone number in formData
    console.log(`\n🔍 Checking all orders for phone number "${phoneNumber}" in formData:\n`);
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
    
    const ordersWithPhone = [];
    for (const order of allOrders) {
      try {
        const formData = typeof order.formData === 'string' 
          ? JSON.parse(order.formData) 
          : order.formData;
        
        // Check all form fields for phone number
        const phoneFields = Object.keys(formData).filter(key => 
          key.toLowerCase().includes('phone') || 
          key.toLowerCase().includes('mobile') ||
          key.toLowerCase().includes('contact')
        );
        
        for (const field of phoneFields) {
          const value = formData[field];
          if (value && value.toString().includes(phoneNumber)) {
            ordersWithPhone.push({
              order,
              formData,
              phoneField: field,
              phoneValue: value
            });
            break;
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    console.log(`Found ${ordersWithPhone.length} order(s) with phone "${phoneNumber}" in formData:\n`);
    ordersWithPhone.forEach((item, index) => {
      const order = item.order;
      console.log(`${index + 1}. Order #${order.orderNumber}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Customer ID in Order: ${order.customerId || 'NULL'}`);
      console.log(`   Linked Customer: ${order.customer ? `${order.customer.name} (${order.customer.phoneNumber})` : 'NONE'}`);
      console.log(`   Phone in FormData: ${item.phoneValue}`);
      console.log(`   Customer Name in FormData: ${item.formData['Customer Name'] || item.formData['Name'] || 'N/A'}`);
      console.log(`   Created: ${order.createdAt.toISOString()}`);
      console.log('');
    });
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkCustomerOrders();

