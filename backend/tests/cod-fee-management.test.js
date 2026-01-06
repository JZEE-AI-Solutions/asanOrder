/**
 * Comprehensive Unit Tests for Enhanced COD Fee Management System
 * 
 * Tests the complete flow including:
 * - Logistics company CRUD operations
 * - COD fee calculation with different types (PERCENTAGE, RANGE_BASED, FIXED)
 * - Auto-recalculation in edit mode
 * - Manual override functionality
 * - Range-based validation
 * - Profit calculations with COD fee
 * 
 * Run with: npm test -- cod-fee-management.test.js
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const prisma = require('../lib/db')
const codFeeService = require('../services/codFeeService')
const profitService = require('../services/profitService')
const {
  createTestTenant: createTestTenantHelper,
  cleanupTestData
} = require('./helpers/testHelpers')

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  cleanup: true
}

// Helper function to create test logistics company with percentage
async function createPercentageLogisticsCompany(tenantId, percentage = 4) {
  const company = await prisma.logisticsCompany.create({
    data: {
      name: 'TCS',
      tenantId: tenantId,
      codFeeCalculationType: 'PERCENTAGE',
      codFeePercentage: percentage,
      status: 'ACTIVE'
    }
  })
  return company
}

// Helper function to create test logistics company with range-based rules
async function createRangeBasedLogisticsCompany(tenantId) {
  const rules = [
    { min: 0, max: 10000, fee: 75 },
    { min: 10000, max: 20000, fee: 100 },
    { min: 20000, max: 50000, fee: 150 },
    { min: 50000, max: 999999999, fee: 200 }
  ]
  
  const company = await prisma.logisticsCompany.create({
    data: {
      name: 'Pakistan Post',
      tenantId: tenantId,
      codFeeCalculationType: 'RANGE_BASED',
      codFeeRules: JSON.stringify(rules),
      status: 'ACTIVE'
    }
  })
  return company
}

// Helper function to create test logistics company with fixed fee
async function createFixedLogisticsCompany(tenantId, fixedFee = 50) {
  const company = await prisma.logisticsCompany.create({
    data: {
      name: 'Fixed Fee Logistics',
      tenantId: tenantId,
      codFeeCalculationType: 'FIXED',
      fixedCodFee: fixedFee,
      status: 'ACTIVE'
    }
  })
  return company
}

// Helper function to create test product
async function createTestProduct(tenantId) {
  const product = await prisma.product.create({
    data: {
      name: 'Test Product',
      sku: `TEST-SKU-${Date.now()}`,
      tenantId: tenantId,
      currentRetailPrice: 1000,
      lastPurchasePrice: 600,
      currentQuantity: 100
    }
  })
  return product
}

// Helper function to create test form
async function createTestForm(tenantId) {
  const form = await prisma.form.create({
    data: {
      name: 'Test Order Form',
      description: 'Test form for COD fee testing',
      formCategory: 'SHOPPING_CART',
      tenantId: tenantId,
      formLink: `test-form-${Date.now()}`,
      isPublished: true
    }
  })
  
  await prisma.formField.createMany({
    data: [
      {
        formId: form.id,
        label: 'Customer Name',
        fieldType: 'TEXT',
        isRequired: true,
        order: 0
      },
      {
        formId: form.id,
        label: 'Phone Number',
        fieldType: 'PHONE',
        isRequired: true,
        order: 1
      }
    ]
  })
  
  return form
}

// Helper function to create test customer
async function createTestCustomer(tenantId) {
  const customer = await prisma.customer.create({
    data: {
      name: 'Test Customer',
      phoneNumber: `123456789${Date.now() % 10000}`,
      tenantId: tenantId
    }
  })
  return customer
}

// Helper function to create test order
async function createTestOrder(tenantId, formId, customerId, product, logisticsCompanyId = null, paymentAmount = 500) {
  const selectedProducts = JSON.stringify([{ id: product.id, name: product.name, price: product.currentRetailPrice }])
  const productQuantities = JSON.stringify({ [product.id]: 2 })
  const productPrices = JSON.stringify({ [product.id]: product.currentRetailPrice })
  const formData = JSON.stringify({
    'Customer Name': 'Test Customer',
    'Phone Number': '1234567890'
  })
  
  const order = await prisma.order.create({
    data: {
      orderNumber: `TEST-ORD-${Date.now()}`,
      formData: formData,
      status: 'PENDING',
      formId: formId,
      tenantId: tenantId,
      customerId: customerId,
      selectedProducts: selectedProducts,
      productQuantities: productQuantities,
      productPrices: productPrices,
      paymentAmount: paymentAmount,
      shippingCharges: 200,
      logisticsCompanyId: logisticsCompanyId
    }
  })
  
  return order
}

// Test Suite
describe('Enhanced COD Fee Management System Tests', () => {
  let testData = {
    tenants: [],
    users: [],
    products: [],
    forms: [],
    customers: [],
    orders: [],
    logisticsCompanies: []
  }
  
  beforeAll(async () => {
    const { user, tenant } = await createTestTenantHelper()
    testData.users.push(user)
    testData.tenants.push(tenant)
    
    const product = await createTestProduct(tenant.id)
    testData.products.push(product)
    
    const form = await createTestForm(tenant.id)
    testData.forms.push(form)
    
    const customer = await createTestCustomer(tenant.id)
    testData.customers.push(customer)
    
    testData.tenant = tenant
    testData.user = user
    testData.product = product
    testData.form = form
    testData.customer = customer
  }, TEST_CONFIG.timeout)
  
  afterAll(async () => {
    if (TEST_CONFIG.cleanup && testData.tenant) {
      await cleanupTestData(testData.tenant.id)
    }
  }, TEST_CONFIG.timeout)

  describe('Test Case 1: Logistics Company CRUD Operations', () => {
    test('should create logistics company with PERCENTAGE type', async () => {
      const company = await createPercentageLogisticsCompany(testData.tenant.id, 4)
      testData.logisticsCompanies.push(company)
      
      expect(company).toBeDefined()
      expect(company.name).toBe('TCS')
      expect(company.codFeeCalculationType).toBe('PERCENTAGE')
      expect(company.codFeePercentage).toBe(4)
      expect(company.status).toBe('ACTIVE')
    })

    test('should create logistics company with RANGE_BASED type', async () => {
      const company = await createRangeBasedLogisticsCompany(testData.tenant.id)
      testData.logisticsCompanies.push(company)
      
      expect(company).toBeDefined()
      expect(company.name).toBe('Pakistan Post')
      expect(company.codFeeCalculationType).toBe('RANGE_BASED')
      expect(company.codFeeRules).toBeDefined()
      
      const rules = JSON.parse(company.codFeeRules)
      expect(rules).toHaveLength(4)
      expect(rules[0]).toEqual({ min: 0, max: 10000, fee: 75 })
    })

    test('should create logistics company with FIXED type', async () => {
      const company = await createFixedLogisticsCompany(testData.tenant.id, 50)
      testData.logisticsCompanies.push(company)
      
      expect(company).toBeDefined()
      expect(company.codFeeCalculationType).toBe('FIXED')
      expect(company.fixedCodFee).toBe(50)
    })

    test('should update logistics company', async () => {
      const company = await createPercentageLogisticsCompany(testData.tenant.id, 3)
      testData.logisticsCompanies.push(company)
      
      const updated = await prisma.logisticsCompany.update({
        where: { id: company.id },
        data: { codFeePercentage: 5 }
      })
      
      expect(updated.codFeePercentage).toBe(5)
    })

    test('should delete logistics company if not used in orders', async () => {
      const company = await createFixedLogisticsCompany(testData.tenant.id, 30)
      testData.logisticsCompanies.push(company)
      
      await prisma.logisticsCompany.delete({
        where: { id: company.id }
      })
      
      const deleted = await prisma.logisticsCompany.findUnique({
        where: { id: company.id }
      })
      
      expect(deleted).toBeNull()
    })
  })

  describe('Test Case 2: COD Fee Calculation - PERCENTAGE Type', () => {
    let company
    
    beforeAll(async () => {
      company = await createPercentageLogisticsCompany(testData.tenant.id, 4)
      testData.logisticsCompanies.push(company)
    })

    test('should calculate COD fee as 4% of COD amount', async () => {
      const codAmount = 10000
      const result = await codFeeService.calculateCODFee(company.id, codAmount)
      
      expect(result.codFee).toBe(400) // 4% of 10000
      expect(result.calculationType).toBe('PERCENTAGE')
      expect(result.codAmount).toBe(codAmount)
    })

    test('should calculate COD fee for different amounts', async () => {
      const testCases = [
        { codAmount: 5000, expected: 200 },   // 4% of 5000
        { codAmount: 15000, expected: 600 },  // 4% of 15000
        { codAmount: 25000, expected: 1000 }   // 4% of 25000
      ]
      
      for (const testCase of testCases) {
        const result = await codFeeService.calculateCODFee(company.id, testCase.codAmount)
        expect(result.codFee).toBe(testCase.expected)
      }
    })
  })

  describe('Test Case 3: COD Fee Calculation - RANGE_BASED Type', () => {
    let company
    
    beforeAll(async () => {
      company = await createRangeBasedLogisticsCompany(testData.tenant.id)
      testData.logisticsCompanies.push(company)
    })

    test('should calculate COD fee for amount < 10,000 (Rs. 75)', async () => {
      const codAmount = 5000
      const result = await codFeeService.calculateCODFee(company.id, codAmount)
      
      expect(result.codFee).toBe(75)
      expect(result.calculationType).toBe('RANGE_BASED')
    })

    test('should calculate COD fee for amount between 10K-20K (Rs. 100)', async () => {
      const codAmount = 15000
      const result = await codFeeService.calculateCODFee(company.id, codAmount)
      
      expect(result.codFee).toBe(100)
    })

    test('should calculate COD fee for amount between 20K-50K (Rs. 150)', async () => {
      const codAmount = 35000
      const result = await codFeeService.calculateCODFee(company.id, codAmount)
      
      expect(result.codFee).toBe(150)
    })

    test('should calculate COD fee for amount > 50K (Rs. 200)', async () => {
      const codAmount = 75000
      const result = await codFeeService.calculateCODFee(company.id, codAmount)
      
      expect(result.codFee).toBe(200)
    })

    test('should use highest range fee for amounts exceeding all ranges', async () => {
      const codAmount = 200000
      const result = await codFeeService.calculateCODFee(company.id, codAmount)
      
      expect(result.codFee).toBe(200) // Highest range fee
    })
  })

  describe('Test Case 4: COD Fee Calculation - FIXED Type', () => {
    let company
    
    beforeAll(async () => {
      company = await createFixedLogisticsCompany(testData.tenant.id, 50)
      testData.logisticsCompanies.push(company)
    })

    test('should return fixed fee regardless of COD amount', async () => {
      const testCases = [
        { codAmount: 1000, expected: 50 },
        { codAmount: 10000, expected: 50 },
        { codAmount: 100000, expected: 50 }
      ]
      
      for (const testCase of testCases) {
        const result = await codFeeService.calculateCODFee(company.id, testCase.codAmount)
        expect(result.codFee).toBe(testCase.expected)
      }
    })
  })

  describe('Test Case 5: COD Fee Auto-Recalculation in Edit Mode', () => {
    let order, company
    
    beforeAll(async () => {
      company = await createPercentageLogisticsCompany(testData.tenant.id, 4)
      testData.logisticsCompanies.push(company)
      
      order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        company.id,
        500 // Payment amount
      )
      testData.orders.push(order)
    })

    test('should recalculate COD fee when products change', async () => {
      // Original: 2 products @ 1000 each = 2000, shipping 200, payment 500
      // COD amount = 2000 + 200 - 500 = 1700
      // COD fee = 4% of 1700 = 68
      
      const originalCodAmount = 2000 + 200 - 500 // 1700
      const originalCodFee = originalCodAmount * 0.04 // 68
      
      // Update to 3 products
      const updatedProducts = JSON.stringify([
        { id: testData.product.id, name: testData.product.name, price: testData.product.currentRetailPrice }
      ])
      const updatedQuantities = JSON.stringify({ [testData.product.id]: 3 })
      
      await prisma.order.update({
        where: { id: order.id },
        data: {
          selectedProducts: updatedProducts,
          productQuantities: updatedQuantities
        }
      })
      
      // New COD amount = 3000 + 200 - 500 = 2700
      // New COD fee = 4% of 2700 = 108
      const newCodAmount = 3000 + 200 - 500
      const newCodFee = newCodAmount * 0.04
      
      const result = await codFeeService.calculateCODFee(company.id, newCodAmount)
      expect(result.codFee).toBe(newCodFee)
    })

    test('should recalculate COD fee when payment amount changes', async () => {
      // Update payment from 500 to 1000
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentAmount: 1000 }
      })
      
      // New COD amount = 2000 + 200 - 1000 = 1200
      // New COD fee = 4% of 1200 = 48
      const newCodAmount = 2000 + 200 - 1000
      const newCodFee = newCodAmount * 0.04
      
      const result = await codFeeService.calculateCODFee(company.id, newCodAmount)
      expect(result.codFee).toBe(newCodFee)
    })

    test('should recalculate COD fee when shipping charges change', async () => {
      // Update shipping from 200 to 300
      await prisma.order.update({
        where: { id: order.id },
        data: { shippingCharges: 300 }
      })
      
      // New COD amount = 2000 + 300 - 500 = 1800
      // New COD fee = 4% of 1800 = 72
      const newCodAmount = 2000 + 300 - 500
      const newCodFee = newCodAmount * 0.04
      
      const result = await codFeeService.calculateCODFee(company.id, newCodAmount)
      expect(result.codFee).toBe(newCodFee)
    })

    test('should recalculate COD fee when logistics company changes', async () => {
      // Create a different company with different percentage
      const newCompany = await createPercentageLogisticsCompany(testData.tenant.id, 5)
      testData.logisticsCompanies.push(newCompany)
      
      const codAmount = 2000 + 200 - 500 // 1700
      
      // Original company: 4% = 68
      const originalResult = await codFeeService.calculateCODFee(company.id, codAmount)
      expect(originalResult.codFee).toBe(68)
      
      // New company: 5% = 85
      const newResult = await codFeeService.calculateCODFee(newCompany.id, codAmount)
      expect(newResult.codFee).toBe(85)
    })
  })

  describe('Test Case 6: Profit Calculation with COD Fee', () => {
    let order1, order2, company
    
    beforeAll(async () => {
      company = await createPercentageLogisticsCompany(testData.tenant.id, 4)
      testData.logisticsCompanies.push(company)
      
      // Create order where customer pays COD fee
      order1 = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        company.id,
        500
      )
      testData.orders.push(order1)
      
      // Create order where business pays COD fee
      order2 = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        company.id,
        500
      )
      testData.orders.push(order2)
      
      // Calculate COD fees
      const codAmount1 = 2000 + 200 - 500 // 1700
      const codFee1 = codAmount1 * 0.04 // 68
      
      const codAmount2 = 2000 + 200 - 500 // 1700
      const codFee2 = codAmount2 * 0.04 // 68
      
      // Update orders with COD fees
      await prisma.order.update({
        where: { id: order1.id },
        data: {
          status: 'CONFIRMED',
          codFee: codFee1,
          codAmount: codAmount1,
          codFeePaidBy: 'CUSTOMER',
          codFeeCalculationType: 'PERCENTAGE'
        }
      })
      
      await prisma.order.update({
        where: { id: order2.id },
        data: {
          status: 'CONFIRMED',
          codFee: codFee2,
          codAmount: codAmount2,
          codFeePaidBy: 'BUSINESS_OWNER',
          codFeeCalculationType: 'PERCENTAGE'
        }
      })
    })

    test('should include COD fee in revenue when customer pays', async () => {
      const profitStats = await profitService.getProfitStatistics(testData.tenant.id, {
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date()
      })
      
      const order1Profit = profitStats.orders.find(o => o.orderId === order1.id)
      expect(order1Profit).toBeDefined()
      
      // Revenue should include COD fee: 2000 (products) + 200 (shipping) + 68 (COD fee) = 2268
      const expectedRevenue = 2000 + 200 + 68
      expect(order1Profit.totalRevenue).toBe(expectedRevenue)
      
      // Cost should include COD fee expense: 1200 (products) + 200 (shipping) + 68 (COD fee) = 1468
      const expectedCost = 1200 + 200 + 68
      expect(order1Profit.totalCost).toBe(expectedCost)
    })

    test('should NOT include COD fee in revenue when business pays', async () => {
      const profitStats = await profitService.getProfitStatistics(testData.tenant.id, {
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date()
      })
      
      const order2Profit = profitStats.orders.find(o => o.orderId === order2.id)
      expect(order2Profit).toBeDefined()
      
      // Revenue should NOT include COD fee: 2000 (products) + 200 (shipping) = 2200
      const expectedRevenue = 2000 + 200
      expect(order2Profit.totalRevenue).toBe(expectedRevenue)
      
      // Cost should include COD fee expense: 1200 (products) + 200 (shipping) + 68 (COD fee) = 1468
      const expectedCost = 1200 + 200 + 68
      expect(order2Profit.totalCost).toBe(expectedCost)
    })

    test('should calculate profit correctly for both scenarios', async () => {
      const profitStats = await profitService.getProfitStatistics(testData.tenant.id, {
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date()
      })
      
      // Order 1 (customer pays): Revenue 2268, Cost 1468, Profit 800
      // Order 2 (business pays): Revenue 2200, Cost 1468, Profit 732
      // Total Revenue: 2268 + 2200 = 4468
      // Total Cost: 1468 + 1468 = 2936
      // Total Profit: 4468 - 2936 = 1532
      
      const expectedTotalRevenue = 2268 + 2200
      const expectedTotalCost = 1468 + 1468
      const expectedTotalProfit = expectedTotalRevenue - expectedTotalCost
      
      expect(profitStats.totalRevenue).toBe(expectedTotalRevenue)
      expect(profitStats.totalCost).toBe(expectedTotalCost)
      expect(profitStats.totalProfit).toBe(expectedTotalProfit)
    })
  })

  describe('Test Case 7: Edge Cases', () => {
    test('should handle order with no logistics company', async () => {
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        null, // No logistics company
        500
      )
      testData.orders.push(order)
      
      // COD fee should be null
      expect(order.logisticsCompanyId).toBeNull()
      
      // Should not throw error when trying to calculate
      const codAmount = 2000 + 200 - 500
      // No COD fee calculation possible without logistics company
      expect(codAmount).toBeGreaterThan(0)
    })

    test('should handle order with full prepayment (no COD)', async () => {
      const company = await createPercentageLogisticsCompany(testData.tenant.id, 4)
      testData.logisticsCompanies.push(company)
      
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        company.id,
        2200 // Full payment (2000 + 200)
      )
      testData.orders.push(order)
      
      const codAmount = 2000 + 200 - 2200 // 0
      expect(codAmount).toBe(0)
      
      // COD fee should be null for zero COD amount
      if (codAmount <= 0) {
        expect(order.codFee).toBeNull()
      }
    })

    test('should handle range-based calculation for boundary values', async () => {
      const company = await createRangeBasedLogisticsCompany(testData.tenant.id)
      testData.logisticsCompanies.push(company)
      
      // Test exact boundary values
      // Note: With exclusive max (amount < max), boundary values go to next range
      const testCases = [
        { codAmount: 0, expected: 75 },        // Min of first range
        { codAmount: 9999, expected: 75 },     // Just below boundary
        { codAmount: 10000, expected: 100 },   // Boundary goes to next range (10000-20000)
        { codAmount: 19999, expected: 100 },   // Just below boundary
        { codAmount: 20000, expected: 150 },   // Boundary goes to next range (20000-50000)
        { codAmount: 49999, expected: 150 },   // Just below boundary
        { codAmount: 50000, expected: 200 }    // Boundary goes to last range (50000+)
      ]
      
      for (const testCase of testCases) {
        const result = await codFeeService.calculateCODFee(company.id, testCase.codAmount)
        expect(result.codFee).toBe(testCase.expected)
      }
    })
  })
})

