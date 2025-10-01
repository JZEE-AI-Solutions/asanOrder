const prisma = require('./lib/db');

async function checkForms() {
  try {
    console.log('Checking existing forms...');
    
    const forms = await prisma.form.findMany({
      include: {
        fields: true,
        tenant: {
          select: {
            businessName: true
          }
        }
      }
    });
    
    console.log(`Found ${forms.length} forms:`);
    forms.forEach((form, index) => {
      console.log(`${index + 1}. ${form.name} (${form.tenant.businessName})`);
      console.log(`   - Published: ${form.isPublished}`);
      console.log(`   - Form Link: ${form.formLink}`);
      console.log(`   - Fields: ${form.fields.length}`);
      form.fields.forEach(field => {
        console.log(`     - ${field.label} (${field.fieldType})`);
      });
      console.log('');
    });
    
    // Check customers
    const customers = await prisma.customer.findMany({
      include: {
        tenant: {
          select: {
            businessName: true
          }
        }
      }
    });
    
    console.log(`Found ${customers.length} customers:`);
    customers.forEach((customer, index) => {
      console.log(`${index + 1}. ${customer.name || 'No name'} (${customer.phoneNumber})`);
      console.log(`   - Tenant: ${customer.tenant.businessName}`);
      console.log(`   - Total Orders: ${customer.totalOrders}`);
      console.log(`   - Total Spent: $${customer.totalSpent}`);
      console.log('');
    });
    
    // Check orders
    const orders = await prisma.order.findMany({
      include: {
        tenant: {
          select: {
            businessName: true
          }
        },
        customer: {
          select: {
            name: true,
            phoneNumber: true
          }
        }
      }
    });
    
    console.log(`Found ${orders.length} orders:`);
    orders.forEach((order, index) => {
      console.log(`${index + 1}. Order #${order.orderNumber}`);
      console.log(`   - Tenant: ${order.tenant.businessName}`);
      console.log(`   - Customer: ${order.customer ? `${order.customer.name} (${order.customer.phoneNumber})` : 'No customer'}`);
      console.log(`   - Status: ${order.status}`);
      console.log(`   - Created: ${order.createdAt}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkForms();
