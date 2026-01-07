const prisma = require('../lib/db');

async function checkOrderPayment() {
  try {
    const orderNumber = '1004-JAN-26-002';
    
    console.log(`\n🔍 Checking order: ${orderNumber}\n`);
    
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phoneNumber: true
          }
        }
      }
    });
    
    if (!order) {
      console.log('❌ Order not found!');
      return;
    }
    
    console.log('📦 Order Details:');
    console.log(`   ID: ${order.id}`);
    console.log(`   Order Number: ${order.orderNumber}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Payment Amount: ${order.paymentAmount}`);
    console.log(`   Verified Payment Amount: ${order.verifiedPaymentAmount}`);
    console.log(`   Payment Verified: ${order.paymentVerified}`);
    console.log(`   Shipping Charges: ${order.shippingCharges}`);
    console.log(`   COD Fee: ${order.codFee}`);
    console.log(`   COD Fee Paid By: ${order.codFeePaidBy}`);
    console.log(`   Created At: ${order.createdAt}`);
    console.log(`   Updated At: ${order.updatedAt}`);
    
    // Parse product data
    let selectedProducts = [];
    let productQuantities = {};
    let productPrices = {};
    
    try {
      selectedProducts = typeof order.selectedProducts === 'string'
        ? JSON.parse(order.selectedProducts)
        : (order.selectedProducts || []);
      productQuantities = typeof order.productQuantities === 'string'
        ? JSON.parse(order.productQuantities)
        : (order.productQuantities || {});
      productPrices = typeof order.productPrices === 'string'
        ? JSON.parse(order.productPrices)
        : (order.productPrices || {});
    } catch (e) {
      console.error('Error parsing product data:', e);
    }
    
    console.log('\n📊 Product Details:');
    console.log(`   Number of Products: ${selectedProducts.length}`);
    
    let productsTotal = 0;
    selectedProducts.forEach((product, index) => {
      const productId = product.id || product;
      const quantity = productQuantities[productId] || product.quantity || 1;
      const price = productPrices[productId] || product.price || product.currentRetailPrice || 0;
      const subtotal = price * quantity;
      productsTotal += subtotal;
      
      console.log(`\n   Product ${index + 1}:`);
      console.log(`      ID: ${productId}`);
      console.log(`      Name: ${product.name || 'N/A'}`);
      console.log(`      Quantity: ${quantity}`);
      console.log(`      Price: Rs. ${price}`);
      console.log(`      Subtotal: Rs. ${subtotal}`);
    });
    
    console.log(`\n💰 Financial Summary:`);
    console.log(`   Products Total: Rs. ${productsTotal}`);
    console.log(`   Shipping Charges: Rs. ${order.shippingCharges || 0}`);
    const codFee = order.codFee || 0;
    const codFeeToAdd = order.codFeePaidBy === 'CUSTOMER' ? codFee : 0;
    console.log(`   COD Fee: Rs. ${codFee} (${order.codFeePaidBy === 'CUSTOMER' ? 'Customer pays' : 'Business pays'})`);
    const orderTotal = productsTotal + (order.shippingCharges || 0) + codFeeToAdd;
    console.log(`   Order Total: Rs. ${orderTotal}`);
    console.log(`   Payment Amount: Rs. ${order.paymentAmount || 0}`);
    console.log(`   COD Amount: Rs. ${orderTotal - (order.paymentAmount || 0)}`);
    
    console.log(`\n👤 Customer:`);
    if (order.customer) {
      console.log(`   Name: ${order.customer.name}`);
      console.log(`   Phone: ${order.customer.phoneNumber}`);
    } else {
      console.log(`   No customer linked`);
    }
    
    console.log('\n✅ Check complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkOrderPayment();

