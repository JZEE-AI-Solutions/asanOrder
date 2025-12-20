const ShippingChargesService = require('../services/shippingChargesService');

async function testShippingCalculation() {
  try {
    console.log('🧪 Testing Shipping Calculation...\n');

    // Test case: Kameez Shalwar, quantity 1, Lahore
    const tenantId = 'cmjempjwd0003rs41fa4r9okh'; // JZ Company
    const city = 'Lahore';
    const products = [
      { id: 'cmjenzkgk000gzfgy9sog5taq', name: 'Kameez Shalwar', quantity: 1 }
    ];
    const productQuantities = {
      'cmjenzkgk000gzfgy9sog5taq': 1
    };

    console.log('Test Scenario:');
    console.log(`  Product: Kameez Shalwar`);
    console.log(`  Quantity: 1`);
    console.log(`  City: ${city}`);
    console.log(`  Tenant ID: ${tenantId}\n`);

    const shippingCharges = await ShippingChargesService.calculateShippingCharges(
      tenantId,
      city,
      products,
      productQuantities
    );

    console.log(`\n💰 Calculated Shipping Charges: Rs. ${shippingCharges.toFixed(2)}`);
    console.log(`\nExpected:`);
    console.log(`  City charge (Lahore): Rs. 200`);
    console.log(`  Quantity charge (qty 1, no rule match): Rs. 150 (default)`);
    console.log(`  Total: Rs. 350`);
    console.log(`\nActual: Rs. ${shippingCharges.toFixed(2)}`);
    
    if (Math.abs(shippingCharges - 350) < 0.01) {
      console.log(`\n✅ Calculation is CORRECT!`);
    } else {
      console.log(`\n❌ Calculation is INCORRECT!`);
      console.log(`   Difference: Rs. ${Math.abs(shippingCharges - 350).toFixed(2)}`);
    }
  } catch (error) {
    console.error('❌ Error testing calculation:', error);
  } finally {
    process.exit(0);
  }
}

testShippingCalculation();

