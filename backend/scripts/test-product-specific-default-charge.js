/**
 * Test script to verify product-specific default quantity charge works correctly
 * This simulates an order with multiple products, some with custom defaults
 */

const prisma = require('../lib/db')
const ShippingChargesService = require('../services/shippingChargesService')

async function testProductSpecificDefaultCharge() {
  console.log('🧪 Testing Product-Specific Default Quantity Charge...\n')

  try {
    // Get a tenant (assuming you have one)
    const tenant = await prisma.tenant.findFirst({
      where: {
        shippingQuantityRules: { not: null }
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

    // Test scenario: Multiple products with different default charges
    const testProducts = [
      {
        id: 'test-product-1',
        name: 'Product A (Custom Default: Rs. 0)',
        quantity: 1
      },
      {
        id: 'test-product-2',
        name: 'Product B (Uses Tenant Default: Rs. 150)',
        quantity: 1
      }
    ]

    // First, let's find actual products with custom defaults
    const productsWithCustomDefaults = await prisma.product.findMany({
      where: {
        tenantId: tenant.id,
        shippingDefaultQuantityCharge: { not: null },
        useDefaultShipping: false
      },
      select: {
        id: true,
        name: true,
        shippingDefaultQuantityCharge: true,
        shippingQuantityRules: true
      },
      take: 2
    })

    // Find products using default shipping
    const productsWithDefaultShipping = await prisma.product.findMany({
      where: {
        tenantId: tenant.id,
        useDefaultShipping: true
      },
      select: {
        id: true,
        name: true
      },
      take: 1
    })

    if (productsWithCustomDefaults.length === 0 && productsWithDefaultShipping.length === 0) {
      console.log('⚠️  No products found to test. Please create products with custom shipping defaults first.')
      return
    }

    const selectedProducts = []
    const productQuantities = {}

    // Add product with custom default
    if (productsWithCustomDefaults.length > 0) {
      const product = productsWithCustomDefaults[0]
      selectedProducts.push({ id: product.id, name: product.name })
      productQuantities[product.id] = 1
      console.log(`📦 Product 1: ${product.name}`)
      console.log(`   Custom Default Charge: Rs. ${product.shippingDefaultQuantityCharge}`)
      console.log(`   Quantity: 1`)
    }

    // Add product with default shipping
    if (productsWithDefaultShipping.length > 0) {
      const product = productsWithDefaultShipping[0]
      selectedProducts.push({ id: product.id, name: product.name })
      productQuantities[product.id] = 1
      console.log(`📦 Product 2: ${product.name}`)
      console.log(`   Uses Tenant Default Charge: Rs. 150 (assumed)`)
      console.log(`   Quantity: 1`)
    }

    if (selectedProducts.length === 0) {
      console.log('⚠️  No products selected for testing')
      return
    }

    console.log(`\n📍 City: Lahore\n`)

    // Calculate shipping
    const shippingCharges = await ShippingChargesService.calculateShippingCharges(
      tenant.id,
      'Lahore',
      selectedProducts,
      productQuantities
    )

    console.log(`\n💰 Total Shipping Charges: Rs. ${shippingCharges.toFixed(2)}\n`)

    // Expected breakdown:
    // - City charge: Rs. 200 (Lahore)
    // - Product 1 (custom default): Rs. 0 (if quantity 1 doesn't match rules)
    // - Product 2 (tenant default): Rs. 150 (if quantity 1 doesn't match rules)
    // - Total: Rs. 350

    console.log('✅ Test completed!')
    console.log('\n📊 Expected behavior:')
    console.log('   - Each product should use its own default quantity charge')
    console.log('   - Products with custom defaults use their custom value')
    console.log('   - Products with default shipping use tenant default')
    console.log('   - City charge is added once for the entire order')

  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testProductSpecificDefaultCharge()

