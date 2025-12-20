/**
 * Test script to verify quantity charge logic:
 * - Quantity 1: Only city charge (no quantity charge)
 * - Quantity > 1: City charge + (quantity - 1) × default charge
 */

const prisma = require('../lib/db')
const ShippingChargesService = require('../services/shippingChargesService')

async function testQuantityChargeLogic() {
  console.log('🧪 Testing Quantity Charge Logic...\n')

  try {
    // Get a tenant
    const tenant = await prisma.tenant.findFirst({
      where: {
        shippingCityCharges: { not: null }
      },
      select: {
        id: true,
        businessName: true
      }
    })

    if (!tenant) {
      console.error('❌ No tenant found with shipping configuration')
      return
    }

    console.log(`📋 Testing with tenant: ${tenant.businessName} (${tenant.id})\n`)

    // Test scenarios
    const testCases = [
      { quantity: 1, expectedQuantityCharge: 0, description: 'Quantity 1: No quantity charge' },
      { quantity: 2, expectedQuantityCharge: 150, description: 'Quantity 2: Charge for 1 additional unit' },
      { quantity: 3, expectedQuantityCharge: 300, description: 'Quantity 3: Charge for 2 additional units' },
      { quantity: 5, expectedQuantityCharge: 600, description: 'Quantity 5: Charge for 4 additional units' }
    ]

    // Find a product with custom default charge but NO rules (to test default charge logic)
    const product = await prisma.product.findFirst({
      where: {
        tenantId: tenant.id,
        useDefaultShipping: false,
        OR: [
          { shippingQuantityRules: null },
          { shippingQuantityRules: '[]' }
        ]
      },
      select: {
        id: true,
        name: true,
        shippingDefaultQuantityCharge: true,
        shippingQuantityRules: true
      }
    })

    if (!product) {
      console.log('⚠️  No product with custom shipping found. Using default tenant charge (Rs. 150).\n')
    } else {
      console.log(`📦 Using product: ${product.name}`)
      console.log(`   Custom Default Charge: Rs. ${product.shippingDefaultQuantityCharge || 150}\n`)
    }

    const defaultCharge = product?.shippingDefaultQuantityCharge || 150

    for (const testCase of testCases) {
      console.log(`\n📊 Test: ${testCase.description}`)
      console.log(`   Quantity: ${testCase.quantity}`)
      console.log(`   Expected Quantity Charge: Rs. ${testCase.expectedQuantityCharge}`)
      
      const selectedProducts = [{ id: product?.id || 'test-product', name: product?.name || 'Test Product' }]
      const productQuantities = { [selectedProducts[0].id]: testCase.quantity }

      const shippingCharges = await ShippingChargesService.calculateShippingCharges(
        tenant.id,
        'Lahore',
        selectedProducts,
        productQuantities
      )

      // Expected: City charge (Rs. 200) + Quantity charge
      const expectedTotal = 200 + testCase.expectedQuantityCharge
      
      console.log(`   Calculated Total: Rs. ${shippingCharges.toFixed(2)}`)
      console.log(`   Expected Total: Rs. ${expectedTotal.toFixed(2)}`)
      
      if (Math.abs(shippingCharges - expectedTotal) < 0.01) {
        console.log(`   ✅ PASS`)
      } else {
        console.log(`   ❌ FAIL`)
      }
    }

    console.log('\n✅ Test completed!')

  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testQuantityChargeLogic()

