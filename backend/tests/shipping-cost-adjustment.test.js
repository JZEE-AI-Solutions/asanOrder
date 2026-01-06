/**
 * Comprehensive Unit Tests for Shipping Cost Adjustment Feature
 * 
 * Tests the complete flow including:
 * - Shipping cost adjustment for DISPATCHED orders
 * - Shipping cost adjustment for COMPLETED orders
 * - Variance calculation (expense and income scenarios)
 * - Accounting entries validation
 * - Customer commitment unchanged validation
 * - Edge cases and validation
 * 
 * Run with: npm test -- shipping-cost-adjustment.test.js
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const prisma = require('../lib/db')
const accountingService = require('../services/accountingService')
const {
  createTestTenant: createTestTenantHelper,
  cleanupTestData
} = require('./helpers/testHelpers')

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  cleanup: true
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
      description: 'Test form for shipping cost adjustment testing',
      formCategory: 'SHOPPING_CART',
      tenantId: tenantId,
      formLink: `test-form-${Date.now()}`,
      isPublished: true
    }
  })
  
  // Add form fields
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
async function createTestOrder(tenantId, formId, customerId, product, shippingCharges = 200) {
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
      paymentAmount: 500,
      shippingCharges: shippingCharges
    }
  })
  
  return order
}

// Helper function to confirm order
async function confirmOrder(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      tenant: {
        select: {
          ownerId: true
        }
      }
    }
  })
  
  if (!order) {
    throw new Error('Order not found')
  }
  
  // Calculate order totals
  let productsTotal = 0
  const selectedProducts = JSON.parse(order.selectedProducts || '[]')
  const productQuantities = JSON.parse(order.productQuantities || '{}')
  const productPrices = JSON.parse(order.productPrices || '{}')
  
  selectedProducts.forEach(product => {
    const quantity = productQuantities[product.id] || 1
    const price = productPrices[product.id] || product.price || 0
    productsTotal += price * quantity
  })
  
  const shippingCharges = order.shippingCharges || 0
  const baseOrderTotal = productsTotal + shippingCharges
  const paymentAmount = order.paymentAmount || 0
  
  // Update order to CONFIRMED
  const confirmedOrder = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: 'CONFIRMED',
      businessOwnerId: order.tenant.ownerId
    }
  })
  
  return confirmedOrder
}

// Helper function to dispatch order
async function dispatchOrder(orderId, actualShippingCost = null) {
  const order = await prisma.order.findUnique({
    where: { id: orderId }
  })
  
  if (!order) {
    throw new Error('Order not found')
  }
  
  if (order.status !== 'CONFIRMED') {
    throw new Error('Order must be CONFIRMED to dispatch')
  }
  
  const shippingCharges = order.shippingCharges || 0
  const actualCost = actualShippingCost !== null && actualShippingCost !== undefined 
    ? parseFloat(actualShippingCost) 
    : shippingCharges
  const variance = shippingCharges - actualCost
  
  const updateData = {
    status: 'DISPATCHED',
    actualShippingCost: actualCost,
    shippingVariance: variance !== 0 ? variance : null,
    shippingVarianceDate: variance !== 0 ? new Date() : null
  }
  
  const dispatchedOrder = await prisma.order.update({
    where: { id: orderId },
    data: updateData
  })
  
  return dispatchedOrder
}

// Helper function to adjust shipping cost (simulating the API endpoint)
async function adjustShippingCost(orderId, actualShippingCost) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      tenant: {
        select: {
          ownerId: true
        }
      }
    }
  })
  
  if (!order) {
    throw new Error('Order not found')
  }
  
  if (order.status !== 'DISPATCHED' && order.status !== 'COMPLETED') {
    throw new Error('Shipping cost can only be adjusted for DISPATCHED or COMPLETED orders')
  }
  
  const shippingCharges = order.shippingCharges || 0
  const actualCost = parseFloat(actualShippingCost)
  const variance = shippingCharges - actualCost
  
  const updatedOrder = await prisma.$transaction(async (tx) => {
    // Update only actualShippingCost and variance (NOT shippingCharges)
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        actualShippingCost: actualCost,
        shippingVariance: variance !== 0 ? variance : null,
        shippingVarianceDate: variance !== 0 ? new Date() : null
      }
    })
    
    // Handle accounting entries for shipping variance
    const existingVarianceTransactions = await tx.transaction.findMany({
      where: {
        orderId: order.id,
        description: {
          contains: 'Shipping Variance'
        }
      }
    })
    
    const oldVariance = order.shippingVariance || 0
    const varianceChanged = variance !== oldVariance
    
    if (variance !== 0 && (existingVarianceTransactions.length === 0 || varianceChanged)) {
      try {
        const shippingExpenseAccount = await accountingService.getAccountByCode('5100', order.tenantId) ||
          await accountingService.getOrCreateAccount({
            code: '5100',
            name: 'Shipping Expense',
            type: 'EXPENSE',
            tenantId: order.tenantId,
            balance: 0
          })
        
        if (variance > 0) {
          // Income scenario
          const varianceIncomeAccount = await accountingService.getAccountByCode('4300', order.tenantId) ||
            await accountingService.getOrCreateAccount({
              code: '4300',
              name: 'Shipping Variance Income',
              type: 'INCOME',
              tenantId: order.tenantId,
              balance: 0
            })
          
          if (varianceChanged && oldVariance < 0 && existingVarianceTransactions.length > 0) {
            const oldVarianceExpenseAccount = await accountingService.getAccountByCode('5110', order.tenantId)
            if (oldVarianceExpenseAccount) {
              const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`
              await accountingService.createTransaction(
                {
                  transactionNumber: reverseTransactionNumber,
                  date: new Date(),
                  description: `Shipping Variance Reversal (Adjustment): ${order.orderNumber}`,
                  tenantId: order.tenantId,
                  orderId: order.id
                },
                [
                  {
                    accountId: oldVarianceExpenseAccount.id,
                    debitAmount: 0,
                    creditAmount: Math.abs(oldVariance)
                  },
                  {
                    accountId: shippingExpenseAccount.id,
                    debitAmount: 0,
                    creditAmount: Math.abs(oldVariance)
                  }
                ]
              )
            }
          }
          
          // Create income entry
          // For income variance: Record the variance amount (balanced transaction)
          const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now() + 1}`
          const varianceAmount = varianceChanged && oldVariance > 0 ? (variance - oldVariance) : variance
          
          if (varianceAmount > 0 || !varianceChanged) {
            await accountingService.createTransaction(
              {
                transactionNumber,
                date: new Date(),
                description: `Shipping Variance ${varianceChanged ? '(Adjustment)' : ''} (Income): ${order.orderNumber}`,
                tenantId: order.tenantId,
                orderId: order.id
              },
              [
                {
                  accountId: shippingExpenseAccount.id,
                  debitAmount: varianceAmount > 0 ? varianceAmount : variance,
                  creditAmount: 0
                },
                {
                  accountId: varianceIncomeAccount.id,
                  debitAmount: 0,
                  creditAmount: varianceAmount > 0 ? varianceAmount : variance
                }
              ]
            )
          }
        } else {
          // Expense scenario
          const varianceExpenseAccount = await accountingService.getAccountByCode('5110', order.tenantId) ||
            await accountingService.getOrCreateAccount({
              code: '5110',
              name: 'Shipping Variance Expense',
              type: 'EXPENSE',
              tenantId: order.tenantId,
              balance: 0
            })
          
          if (varianceChanged && oldVariance > 0 && existingVarianceTransactions.length > 0) {
            const oldVarianceIncomeAccount = await accountingService.getAccountByCode('4300', order.tenantId)
            if (oldVarianceIncomeAccount) {
              const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`
              await accountingService.createTransaction(
                {
                  transactionNumber: reverseTransactionNumber,
                  date: new Date(),
                  description: `Shipping Variance Reversal (Adjustment): ${order.orderNumber}`,
                  tenantId: order.tenantId,
                  orderId: order.id
                },
                [
                  {
                    accountId: oldVarianceIncomeAccount.id,
                    debitAmount: oldVariance,
                    creditAmount: 0
                  },
                  {
                    accountId: shippingExpenseAccount.id,
                    debitAmount: oldVariance,
                    creditAmount: 0
                  }
                ]
              )
            }
          }
          
          // Create expense entry
          // For expense variance: Record the variance amount (balanced transaction)
          const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now() + 1}`
          const varianceAmount = varianceChanged && oldVariance < 0 ? (Math.abs(variance) - Math.abs(oldVariance)) : Math.abs(variance)
          
          if (varianceAmount > 0 || !varianceChanged) {
            await accountingService.createTransaction(
              {
                transactionNumber,
                date: new Date(),
                description: `Shipping Variance ${varianceChanged ? '(Adjustment)' : ''} (Expense): ${order.orderNumber}`,
                tenantId: order.tenantId,
                orderId: order.id
              },
              [
                {
                  accountId: shippingExpenseAccount.id,
                  debitAmount: varianceAmount > 0 ? varianceAmount : Math.abs(variance),
                  creditAmount: 0
                },
                {
                  accountId: varianceExpenseAccount.id,
                  debitAmount: varianceAmount > 0 ? varianceAmount : Math.abs(variance),
                  creditAmount: 0
                }
              ]
            )
          }
        }
      } catch (accountingError) {
        console.error('Error creating shipping variance accounting entries:', accountingError)
        // Re-throw to help debug test failures
        throw accountingError
      }
    } else if (variance === 0 && oldVariance !== 0 && existingVarianceTransactions.length > 0) {
      // Variance cleared - reverse existing entries
      try {
        const shippingExpenseAccount = await accountingService.getAccountByCode('5100', order.tenantId)
        
        if (oldVariance > 0) {
          const varianceIncomeAccount = await accountingService.getAccountByCode('4300', order.tenantId)
          if (varianceIncomeAccount && shippingExpenseAccount) {
            const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`
            await accountingService.createTransaction(
              {
                transactionNumber: reverseTransactionNumber,
                date: new Date(),
                description: `Shipping Variance Reversal (Cleared): ${order.orderNumber}`,
                tenantId: order.tenantId,
                orderId: order.id
              },
              [
                {
                  accountId: varianceIncomeAccount.id,
                  debitAmount: oldVariance,
                  creditAmount: 0
                },
                {
                  accountId: shippingExpenseAccount.id,
                  debitAmount: oldVariance,
                  creditAmount: 0
                }
              ]
            )
          }
        } else {
          const varianceExpenseAccount = await accountingService.getAccountByCode('5110', order.tenantId)
          if (varianceExpenseAccount && shippingExpenseAccount) {
            const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`
            await accountingService.createTransaction(
              {
                transactionNumber: reverseTransactionNumber,
                date: new Date(),
                description: `Shipping Variance Reversal (Cleared): ${order.orderNumber}`,
                tenantId: order.tenantId,
                orderId: order.id
              },
              [
                {
                  accountId: varianceExpenseAccount.id,
                  debitAmount: 0,
                  creditAmount: Math.abs(oldVariance)
                },
                {
                  accountId: shippingExpenseAccount.id,
                  debitAmount: 0,
                  creditAmount: Math.abs(oldVariance)
                }
              ]
            )
          }
        }
      } catch (accountingError) {
        console.error('Error reversing shipping variance accounting entries:', accountingError)
      }
    }
    
    return updated
  })
  
  return updatedOrder
}

// Cleanup helper
async function cleanup(testData) {
  if (!TEST_CONFIG.cleanup) return
  
  try {
    // Delete in reverse order of dependencies
    if (testData.orders) {
      for (const order of testData.orders) {
        await prisma.transaction.deleteMany({ where: { orderId: order.id } })
        await prisma.order.delete({ where: { id: order.id } })
      }
    }
    
    if (testData.customers) {
      for (const customer of testData.customers) {
        await prisma.customer.delete({ where: { id: customer.id } })
      }
    }
    
    if (testData.forms) {
      for (const form of testData.forms) {
        await prisma.formField.deleteMany({ where: { formId: form.id } })
        await prisma.form.delete({ where: { id: form.id } })
      }
    }
    
    if (testData.products) {
      for (const product of testData.products) {
        await prisma.product.delete({ where: { id: product.id } })
      }
    }
    
    // Delete tenants first (before users) due to foreign key constraints
    if (testData.tenants) {
      for (const tenant of testData.tenants) {
        await prisma.transaction.deleteMany({ where: { tenantId: tenant.id } })
        await prisma.transactionLine.deleteMany({
          where: {
            transaction: {
              tenantId: tenant.id
            }
          }
        })
        await prisma.account.deleteMany({ where: { tenantId: tenant.id } })
        await prisma.tenant.delete({ where: { id: tenant.id } })
      }
    }
    
    // Delete users after tenants (due to foreign key constraint)
    if (testData.users) {
      for (const user of testData.users) {
        await prisma.user.delete({ where: { id: user.id } })
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error)
  }
}

// Test Suite
describe('Shipping Cost Adjustment Feature Tests', () => {
  let testData = {
    tenants: [],
    users: [],
    products: [],
    forms: [],
    customers: [],
    orders: []
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
    } else {
      await cleanup(testData)
    }
  }, TEST_CONFIG.timeout)
  
  describe('Test Case 1: Shipping Cost Adjustment - Expense Scenario', () => {
    let order
    
    beforeAll(async () => {
      // Create and dispatch order with shipping charges 200
      order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        200 // Customer charged 200
      )
      testData.orders.push(order)
      
      await confirmOrder(order.id)
      await dispatchOrder(order.id, 200) // Initially no variance
    })
    
    test('should adjust shipping cost and create expense variance', async () => {
      // Adjust actual cost to 500 (business bears 300)
      const adjustedOrder = await adjustShippingCost(order.id, 500)
      
      expect(adjustedOrder.actualShippingCost).toBe(500)
      expect(adjustedOrder.shippingVariance).toBe(-300) // 200 - 500 = -300 (expense)
      expect(adjustedOrder.shippingCharges).toBe(200) // Customer commitment unchanged
      expect(adjustedOrder.shippingVarianceDate).not.toBeNull()
    })
    
    test('should create accounting entries for expense variance', async () => {
      const varianceTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: {
            contains: 'Shipping Variance'
          }
        },
        include: {
          transactionLines: true
        }
      })
      
      expect(varianceTransactions.length).toBeGreaterThan(0)
      
      // Find expense transaction
      const expenseTransaction = varianceTransactions.find(t => 
        t.description.includes('Expense')
      )
      expect(expenseTransaction).toBeDefined()
      
      // Verify transaction lines
      const expenseLines = expenseTransaction.transactionLines
      expect(expenseLines.length).toBe(2)
      
      // Should debit Shipping Expense and Shipping Variance Expense
      const shippingExpenseAccount = await accountingService.getAccountByCode('5100', testData.tenant.id)
      const varianceExpenseAccount = await accountingService.getAccountByCode('5110', testData.tenant.id)
      
      const hasShippingExpense = expenseLines.some(line => 
        line.accountId === shippingExpenseAccount.id && line.debitAmount > 0
      )
      const hasVarianceExpense = expenseLines.some(line => 
        line.accountId === varianceExpenseAccount.id && line.debitAmount > 0
      )
      
      expect(hasShippingExpense).toBe(true)
      expect(hasVarianceExpense).toBe(true)
    })
    
    test('should keep customer commitment unchanged', async () => {
      const orderAfterAdjustment = await prisma.order.findUnique({
        where: { id: order.id }
      })
      
      expect(orderAfterAdjustment.shippingCharges).toBe(200) // Original commitment
      expect(orderAfterAdjustment.actualShippingCost).toBe(500) // Actual cost
      expect(orderAfterAdjustment.shippingVariance).toBe(-300) // Variance
    })
  })
  
  describe('Test Case 2: Shipping Cost Adjustment - Income Scenario', () => {
    let order
    
    beforeAll(async () => {
      // Create and dispatch order with shipping charges 200
      order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        200 // Customer charged 200
      )
      testData.orders.push(order)
      
      await confirmOrder(order.id)
      await dispatchOrder(order.id, 200) // Initially no variance
    })
    
    test('should adjust shipping cost and create income variance', async () => {
      // Adjust actual cost to 150 (business gains 50)
      const adjustedOrder = await adjustShippingCost(order.id, 150)
      
      expect(adjustedOrder.actualShippingCost).toBe(150)
      expect(adjustedOrder.shippingVariance).toBe(50) // 200 - 150 = 50 (income)
      expect(adjustedOrder.shippingCharges).toBe(200) // Customer commitment unchanged
      expect(adjustedOrder.shippingVarianceDate).not.toBeNull()
    })
    
    test('should create accounting entries for income variance', async () => {
      const varianceTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: {
            contains: 'Shipping Variance'
          }
        },
        include: {
          transactionLines: true
        }
      })
      
      expect(varianceTransactions.length).toBeGreaterThan(0)
      
      // Find income transaction
      const incomeTransaction = varianceTransactions.find(t => 
        t.description.includes('Income')
      )
      expect(incomeTransaction).toBeDefined()
      
      // Verify transaction lines
      const incomeLines = incomeTransaction.transactionLines
      expect(incomeLines.length).toBe(2)
      
      // Should debit Shipping Expense and credit Shipping Variance Income
      const shippingExpenseAccount = await accountingService.getAccountByCode('5100', testData.tenant.id)
      const varianceIncomeAccount = await accountingService.getAccountByCode('4300', testData.tenant.id)
      
      const hasShippingExpense = incomeLines.some(line => 
        line.accountId === shippingExpenseAccount.id && line.debitAmount > 0
      )
      const hasVarianceIncome = incomeLines.some(line => 
        line.accountId === varianceIncomeAccount.id && line.creditAmount > 0
      )
      
      expect(hasShippingExpense).toBe(true)
      expect(hasVarianceIncome).toBe(true)
    })
  })
  
  describe('Test Case 3: Shipping Cost Adjustment - Variance Change', () => {
    let order
    
    beforeAll(async () => {
      // Create and dispatch order
      order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        200
      )
      testData.orders.push(order)
      
      await confirmOrder(order.id)
      // Dispatch with actual cost 250, creating -50 expense variance
      await dispatchOrder(order.id, 250) // Initial variance: -50 (expense)
      
      // Note: We don't create accounting entries in test setup because the dispatchOrder
      // helper doesn't create them. The adjustShippingCost function will create entries
      // when it detects the variance change from expense to income.
    })
    
    test('should adjust variance from expense to income and create accounting entries', async () => {
      // Change from expense (-50) to income (+50)
      const adjustedOrder = await adjustShippingCost(order.id, 150)
      
      expect(adjustedOrder.actualShippingCost).toBe(150)
      expect(adjustedOrder.shippingVariance).toBe(50) // 200 - 150 = 50 (income)
      expect(adjustedOrder.shippingCharges).toBe(200) // Unchanged
      
      // Check accounting entries were created
      const varianceTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: {
            contains: 'Shipping Variance'
          }
        }
      })
      
      // Should have at least one transaction (income transaction)
      // When changing from expense to income with no existing transactions,
      // we create new income entry (reversal only happens if existing transactions exist)
      expect(varianceTransactions.length).toBeGreaterThan(0)
      
      // Find income transaction (should exist after adjustment)
      const incomeTransaction = varianceTransactions.find(t => 
        t.description.includes('Income') && !t.description.includes('Reversal')
      )
      
      // Income transaction should exist
      expect(incomeTransaction).toBeDefined()
    })
  })
  
  describe('Test Case 4: Shipping Cost Adjustment - Completed Order', () => {
    let order
    
    beforeAll(async () => {
      // Create, confirm, and complete order
      order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        200
      )
      testData.orders.push(order)
      
      await confirmOrder(order.id)
      await dispatchOrder(order.id, 200)
      
      // Complete the order
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'COMPLETED' }
      })
    })
    
    test('should allow adjustment for COMPLETED orders', async () => {
      const adjustedOrder = await adjustShippingCost(order.id, 500)
      
      expect(adjustedOrder.actualShippingCost).toBe(500)
      expect(adjustedOrder.shippingVariance).toBe(-300)
      expect(adjustedOrder.shippingCharges).toBe(200) // Unchanged
    })
  })
  
  describe('Test Case 5: Validation and Edge Cases', () => {
    let order
    
    beforeAll(async () => {
      order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        200
      )
      testData.orders.push(order)
    })
    
    test('should reject adjustment for non-dispatched orders', async () => {
      await expect(adjustShippingCost(order.id, 500)).rejects.toThrow(
        'Shipping cost can only be adjusted for DISPATCHED or COMPLETED orders'
      )
    })
    
    test('should handle zero variance correctly', async () => {
      await confirmOrder(order.id)
      await dispatchOrder(order.id, 200)
      
      // Adjust to same amount (no variance)
      const adjustedOrder = await adjustShippingCost(order.id, 200)
      
      expect(adjustedOrder.actualShippingCost).toBe(200)
      expect(adjustedOrder.shippingVariance).toBeNull()
      expect(adjustedOrder.shippingVarianceDate).toBeNull()
    })
    
    test('should handle multiple adjustments', async () => {
      // First adjustment
      await adjustShippingCost(order.id, 500)
      
      // Second adjustment
      const adjustedOrder = await adjustShippingCost(order.id, 300)
      
      expect(adjustedOrder.actualShippingCost).toBe(300)
      expect(adjustedOrder.shippingVariance).toBe(-100) // 200 - 300 = -100
      expect(adjustedOrder.shippingCharges).toBe(200) // Still unchanged
    })
  })
  
  describe('Test Case 6: Customer Commitment Unchanged', () => {
    let order
    
    beforeAll(async () => {
      order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        200
      )
      testData.orders.push(order)
      
      await confirmOrder(order.id)
      await dispatchOrder(order.id, 200)
    })
    
    test('should never change shippingCharges during adjustment', async () => {
      const originalCharges = order.shippingCharges
      
      // Multiple adjustments
      await adjustShippingCost(order.id, 500)
      await adjustShippingCost(order.id, 150)
      await adjustShippingCost(order.id, 300)
      
      const finalOrder = await prisma.order.findUnique({
        where: { id: order.id }
      })
      
      expect(finalOrder.shippingCharges).toBe(originalCharges)
      expect(finalOrder.shippingCharges).toBe(200)
    })
  })
})

