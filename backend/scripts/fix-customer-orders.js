const prisma = require('../lib/db');

async function fixCustomerOrders() {
  try {
    const phoneNumber = '03444971113';
    const customerName = 'Suneela';
    
    console.log(`\n🔧 Fixing customer orders for:`);
    console.log(`   Phone: ${phoneNumber}`);
    console.log(`   Name: ${customerName}\n`);
    
    // Get the customer record
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
    console.log(`   Current totalOrders: ${customer.totalOrders}`);
    console.log(`   Current totalSpent: Rs. ${customer.totalSpent}\n`);
    
    // Get all orders and check which ones should be linked to this customer
    const allOrders = await prisma.order.findMany({
      where: {
        tenantId: customer.tenantId
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phoneNumber: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`📋 Checking ${allOrders.length} orders...\n`);
    
    const ordersToLink = [];
    const ordersWithName = [];
    
    for (const order of allOrders) {
      try {
        const formData = typeof order.formData === 'string' 
          ? JSON.parse(order.formData) 
          : order.formData;
        
        // Check if customer name matches
        const orderCustomerName = formData['Customer Name'] || formData['Name'] || null;
        const orderPhoneNumber = formData['Phone Number'] || formData['Phone'] || formData['Mobile'] || null;
        
        // Check if this order should be linked to our customer
        const nameMatches = orderCustomerName && 
          orderCustomerName.toLowerCase().includes(customerName.toLowerCase());
        const phoneMatches = orderPhoneNumber && 
          orderPhoneNumber.toString().trim() === phoneNumber;
        
        if (nameMatches || phoneMatches) {
          ordersWithName.push({
            order,
            orderCustomerName,
            orderPhoneNumber,
            currentCustomer: order.customer,
            shouldLink: order.customerId !== customer.id
          });
          
          if (order.customerId !== customer.id) {
            ordersToLink.push(order);
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    console.log(`📊 Found ${ordersWithName.length} order(s) that match customer "${customerName}":\n`);
    
    ordersWithName.forEach((item, index) => {
      const order = item.order;
      console.log(`${index + 1}. Order #${order.orderNumber}`);
      console.log(`   Customer Name in Order: ${item.orderCustomerName || 'N/A'}`);
      console.log(`   Phone in Order: ${item.orderPhoneNumber || 'N/A'}`);
      console.log(`   Current Customer ID: ${order.customerId || 'NULL'}`);
      console.log(`   Current Linked Customer: ${item.currentCustomer ? `${item.currentCustomer.name} (${item.currentCustomer.phoneNumber})` : 'NONE'}`);
      console.log(`   Should Link to: ${customer.name} (${customer.phoneNumber})`);
      console.log(`   Action: ${item.shouldLink ? '🔗 NEEDS TO BE LINKED' : '✅ Already linked'}`);
      console.log('');
    });
    
    if (ordersToLink.length === 0) {
      console.log(`✅ All matching orders are already linked correctly.\n`);
    } else {
      console.log(`\n🔧 Linking ${ordersToLink.length} order(s) to customer...\n`);
      
      for (const order of ordersToLink) {
        try {
          await prisma.order.update({
            where: { id: order.id },
            data: { customerId: customer.id }
          });
          console.log(`✅ Linked order #${order.orderNumber} to customer ${customer.name}`);
        } catch (error) {
          console.error(`❌ Failed to link order #${order.orderNumber}:`, error.message);
        }
      }
      
      // Recalculate customer stats
      console.log(`\n📊 Recalculating customer statistics...\n`);
      
      const linkedOrders = await prisma.order.findMany({
        where: {
          customerId: customer.id,
          tenantId: customer.tenantId
        },
        select: {
          paymentAmount: true,
          shippingCharges: true,
          createdAt: true
        }
      });
      
      const totalOrders = linkedOrders.length;
      const totalSpent = linkedOrders.reduce((sum, order) => {
        return sum + (order.paymentAmount || 0) + (order.shippingCharges || 0);
      }, 0);
      const lastOrderDate = linkedOrders.length > 0 
        ? linkedOrders.sort((a, b) => b.createdAt - a.createdAt)[0].createdAt
        : null;
      
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          totalOrders: totalOrders,
          totalSpent: totalSpent,
          lastOrderDate: lastOrderDate
        }
      });
      
      console.log(`✅ Updated customer statistics:`);
      console.log(`   Total Orders: ${totalOrders}`);
      console.log(`   Total Spent: Rs. ${totalSpent}`);
      console.log(`   Last Order Date: ${lastOrderDate ? lastOrderDate.toISOString() : 'N/A'}\n`);
    }
    
    await prisma.$disconnect();
    console.log(`✅ Done!\n`);
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixCustomerOrders();

