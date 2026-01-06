/**
 * Comprehensive Unit Tests for Customer Management Enhancement
 * 
 * Tests the complete flow including:
 * - Customer balance update with accounting reversals
 * - Customer ledger endpoint
 * - Direct customer payments without orders
 * - Payment verification workflow
 * - Payment editing
 * - Advance balance usage in payments
 * - Return order editing
 * - Return status management
 * 
 * Run with: npm test -- customer-management-enhancement.test.js
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const request = require('supertest')
const prisma = require('../lib/db')
const balanceService = require('../services/balanceService')
const accountingService = require('../services/accountingService')
const {
  createTestTenant,
  generateTestToken,
  cleanupTestData,
  verifyAccountBalance,
  getAccountByCode,
  createTestApp,
  setTestAuth
} = require('./helpers/testHelpers')

// Access global test user/tenant from testHelpers
const testHelpers = require('./helpers/testHelpers')

// Use the enhanced createTestApp from testHelpers (now includes customer routes)
const app = createTestApp()

// Test data
let testUser
let testTenant
let authToken
let customerId
let orderId
let paymentAccountId
let cashAccountId
let bankAccountId

describe('Customer Management Enhancement Tests', () => {
  beforeAll(async () => {
    // Create test tenant and user
    const { user, tenant } = await createTestTenant()
    testUser = user
    testTenant = tenant
    authToken = generateTestToken(user, tenant)
    
    // Set test user/tenant for app
    setTestAuth(user, tenant)
    
    // Get or create payment accounts
    cashAccountId = (await getAccountByCode('1000', tenant.id))?.id
    bankAccountId = (await getAccountByCode('1100', tenant.id))?.id
    paymentAccountId = cashAccountId || bankAccountId
    
    console.log(`✅ Test tenant created: ${tenant.id}`)
  }, 30000)

  afterAll(async () => {
    // Clean up test data
    if (testTenant) {
      await cleanupTestData(testTenant.id)
      console.log('✅ Test data cleaned up')
    }
  }, 30000)

  describe('Test Case 1: Customer Creation with Opening Balance', () => {
    test('should create customer with positive opening balance (AR)', async () => {
      const response = await request(app)
        .post('/customer')
        .send({
          name: 'Test Customer AR',
          phoneNumber: `123456789${Date.now()}`,
          balance: 5000 // Positive = customer owes us
        })

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)
      customerId = response.body.customer.id

      // Verify accounting impact
      await verifyAccountBalance('1200', testTenant.id, 5000) // Accounts Receivable
      // Opening Balance Equity: Credit 5000 (negative balance means credit)
      const openingBalanceAccount = await getAccountByCode('3001', testTenant.id)
      expect(openingBalanceAccount.balance).toBeCloseTo(-5000, 2)

      // Verify customer balance
      const balance = await balanceService.calculateCustomerBalance(customerId)
      expect(balance.openingARBalance).toBeCloseTo(5000, 2)
    })

    test('should create customer with negative opening balance (Advance)', async () => {
      const response = await request(app)
        .post('/customer')
        .send({
          name: 'Test Customer Advance',
          phoneNumber: `987654321${Date.now()}`,
          balance: -3000 // Negative = customer advance
        })

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)

      // Verify accounting impact
      await verifyAccountBalance('1210', testTenant.id, 3000) // Customer Advance Balance
      // Opening Balance Equity: Credit 3000 (negative balance means credit)
      // Cumulative from previous test: -5000 + -3000 = -8000
      const openingBalanceAccount = await getAccountByCode('3001', testTenant.id)
      expect(openingBalanceAccount.balance).toBeCloseTo(-8000, 2)

      // Verify customer advance balance
      const customer = await prisma.customer.findUnique({
        where: { id: response.body.customer.id }
      })
      expect(customer.advanceBalance).toBeCloseTo(3000, 2)
    })
  })

  describe('Test Case 2: Customer Balance Update', () => {
    test('should update customer balance from AR to Advance', async () => {
      // Create customer with AR balance
      const customer = await prisma.customer.create({
        data: {
          name: 'Balance Test Customer',
          phoneNumber: `555${Date.now()}`,
          tenantId: testTenant.id,
          advanceBalance: 0
        }
      })

      // Create opening balance transaction
      const arAccount = await getAccountByCode('1200', testTenant.id)
      const openingBalanceAccount = await getAccountByCode('3001', testTenant.id)
      
      await accountingService.createTransaction(
        {
          transactionNumber: `TXN-TEST-${Date.now()}`,
          date: new Date(),
          description: `Customer Opening Balance - ${customer.name}`,
          tenantId: testTenant.id
        },
        [
          { accountId: arAccount.id, debitAmount: 5000, creditAmount: 0 },
          { accountId: openingBalanceAccount.id, debitAmount: 0, creditAmount: 5000 }
        ]
      )

      // Update balance to advance (negative)
      const response = await request(app)
        .put(`/customer/${customer.id}/balance`)
        .send({
          balance: -2000,
          openingBalanceDate: new Date().toISOString()
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // Verify customer advance balance updated
      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: customer.id }
      })
      expect(updatedCustomer.advanceBalance).toBeCloseTo(2000, 2)

      // Verify accounting reversals created
      const transactions = await prisma.transaction.findMany({
        where: {
          tenantId: testTenant.id,
          description: { contains: 'Customer Balance Adjustment' }
        },
        include: { transactionLines: { include: { account: true } } }
      })
      
      expect(transactions.length).toBeGreaterThan(0)
    })

    test('should update customer balance from Advance to AR', async () => {
      // Create customer with advance balance
      const customer = await prisma.customer.create({
        data: {
          name: 'Advance to AR Customer',
          phoneNumber: `666${Date.now()}`,
          tenantId: testTenant.id,
          advanceBalance: 1000
        }
      })

      // Update balance to AR (positive)
      const response = await request(app)
        .put(`/customer/${customer.id}/balance`)
        .send({
          balance: 3000
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // Verify customer advance balance updated
      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: customer.id }
      })
      expect(updatedCustomer.advanceBalance).toBe(0)
    })
  })

  describe('Test Case 3: Direct Customer Payments (Without Orders)', () => {
    test('should record unverified direct payment', async () => {
      const customer = await prisma.customer.create({
        data: {
          name: 'Direct Payment Customer',
          phoneNumber: `777${Date.now()}`,
          tenantId: testTenant.id
        }
      })

      const response = await request(app)
        .post('/accounting/payments')
        .send({
          date: new Date().toISOString(),
          type: 'CUSTOMER_PAYMENT',
          amount: 2000,
          customerId: customer.id,
          orderId: null, // Direct payment
          isVerified: false
        })

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)
      expect(response.body.data.transactionId).toBeNull() // Unverified = no transaction

      // Verify payment record exists
      const payment = await prisma.payment.findUnique({
        where: { id: response.body.data.id }
      })
      expect(payment).toBeDefined()
      expect(payment.transactionId).toBeNull()
    })

    test('should record verified direct payment and create accounting entries', async () => {
      const customer = await prisma.customer.create({
        data: {
          name: 'Verified Payment Customer',
          phoneNumber: `888${Date.now()}`,
          tenantId: testTenant.id
        }
      })

      const response = await request(app)
        .post('/accounting/payments')
        .send({
          date: new Date().toISOString(),
          type: 'CUSTOMER_PAYMENT',
          amount: 3000,
          paymentAccountId: paymentAccountId,
          customerId: customer.id,
          orderId: null,
          isVerified: true
        })

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)
      expect(response.body.data.transactionId).not.toBeNull()

      // Verify accounting entries
      const transaction = await prisma.transaction.findUnique({
        where: { id: response.body.data.transactionId },
        include: { transactionLines: { include: { account: true } } }
      })

      expect(transaction).toBeDefined()
      const advanceAccountLine = transaction.transactionLines.find(
        line => line.account.code === '1210'
      )
      expect(advanceAccountLine).toBeDefined()
      expect(advanceAccountLine.creditAmount).toBe(3000)

      // Verify customer advance balance updated
      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: customer.id }
      })
      expect(updatedCustomer.advanceBalance).toBeCloseTo(3000, 2)
    })
  })

  describe('Test Case 4: Payment Verification Workflow', () => {
    test('should verify unverified direct payment', async () => {
      const customer = await prisma.customer.create({
        data: {
          name: 'Verification Test Customer',
          phoneNumber: `999${Date.now()}`,
          tenantId: testTenant.id
        }
      })

      // Create unverified payment
      const paymentResponse = await request(app)
        .post('/accounting/payments')
        .send({
          date: new Date().toISOString(),
          type: 'CUSTOMER_PAYMENT',
          amount: 1500,
          customerId: customer.id,
          orderId: null,
          isVerified: false
        })

      const paymentId = paymentResponse.body.data.id

      // Verify the payment
      const verifyResponse = await request(app)
        .post(`/accounting/payments/${paymentId}/verify`)
        .send({
          paymentAccountId: paymentAccountId
        })

      expect(verifyResponse.status).toBe(200)
      expect(verifyResponse.body.success).toBe(true)
      expect(verifyResponse.body.data.transactionId).not.toBeNull()

      // Verify accounting entries created
      const transaction = await prisma.transaction.findUnique({
        where: { id: verifyResponse.body.data.transactionId },
        include: { transactionLines: { include: { account: true } } }
      })

      expect(transaction).toBeDefined()
      const advanceAccountLine = transaction.transactionLines.find(
        line => line.account.code === '1210'
      )
      expect(advanceAccountLine.creditAmount).toBe(1500)

      // Verify customer advance balance updated
      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: customer.id }
      })
      expect(updatedCustomer.advanceBalance).toBeCloseTo(1500, 2)
    })
  })

  describe('Test Case 5: Advance Balance Usage in Payments', () => {
    test('should use advance balance when making payment', async () => {
      const customer = await prisma.customer.create({
        data: {
          name: 'Advance Usage Customer',
          phoneNumber: `111${Date.now()}`,
          tenantId: testTenant.id,
          advanceBalance: 2000
        }
      })

      // Create order
      const form = await prisma.form.create({
        data: {
          name: 'Test Form',
          formLink: `test-${Date.now()}`,
          tenantId: testTenant.id,
          isPublished: true
        }
      })

      const product = await prisma.product.create({
        data: {
          name: 'Test Product',
          sku: `SKU-${Date.now()}`,
          tenantId: testTenant.id,
          currentRetailPrice: 1000,
          currentQuantity: 10
        }
      })

      const order = await prisma.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}`,
          formId: form.id,
          customerId: customer.id,
          tenantId: testTenant.id,
          status: 'CONFIRMED',
          formData: JSON.stringify({ 'Customer Name': 'Test Customer', 'Phone Number': '1234567890' }),
          selectedProducts: JSON.stringify([{ id: product.id }]),
          productQuantities: JSON.stringify({ [product.id]: 2 }),
          productPrices: JSON.stringify({ [product.id]: 1000 }),
          shippingCharges: 200
        }
      })

      // Record payment using advance balance
      const response = await request(app)
        .post('/accounting/payments')
        .send({
          date: new Date().toISOString(),
          type: 'CUSTOMER_PAYMENT',
          amount: 1500,
          paymentAccountId: paymentAccountId,
          customerId: customer.id,
          orderId: order.id,
          useAdvanceBalance: true,
          advanceAmountUsed: 1000, // Use 1000 from advance
          isVerified: true
        })

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)

      // Verify customer advance balance decreased
      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: customer.id }
      })
      expect(updatedCustomer.advanceBalance).toBeCloseTo(1000, 2) // 2000 - 1000 = 1000

      // Verify accounting entries
      const payment = await prisma.payment.findUnique({
        where: { id: response.body.data.id },
        include: { transaction: { include: { transactionLines: { include: { account: true } } } } }
      })

      const advanceAccountLine = payment.transaction.transactionLines.find(
        line => line.account.code === '1210'
      )
      expect(advanceAccountLine).toBeDefined()
      expect(advanceAccountLine.debitAmount).toBe(1000) // Advance used
    })
  })

  describe('Test Case 6: Customer Ledger', () => {
    test('should fetch customer ledger with all transactions', async () => {
      const customer = await prisma.customer.create({
        data: {
          name: 'Ledger Test Customer',
          phoneNumber: `222${Date.now()}`,
          tenantId: testTenant.id,
          advanceBalance: 1000
        }
      })

      // Create order
      const form = await prisma.form.create({
        data: {
          name: 'Test Form',
          formLink: `test-form-${Date.now()}`,
          tenantId: testTenant.id,
          isPublished: true
        }
      })

      const product = await prisma.product.create({
        data: {
          name: 'Test Product',
          sku: `SKU-${Date.now()}`,
          tenantId: testTenant.id,
          currentRetailPrice: 500,
          currentQuantity: 10
        }
      })

      const order = await prisma.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}`,
          formId: form.id,
          customerId: customer.id,
          tenantId: testTenant.id,
          status: 'CONFIRMED',
          formData: JSON.stringify({ 'Customer Name': 'Test Customer', 'Phone Number': '1234567890' }),
          selectedProducts: JSON.stringify([{ id: product.id }]),
          productQuantities: JSON.stringify({ [product.id]: 1 }),
          productPrices: JSON.stringify({ [product.id]: 500 }),
          shippingCharges: 100
        }
      })

      // Create payment
      await request(app)
        .post('/accounting/payments')
        .send({
          date: new Date().toISOString(),
          type: 'CUSTOMER_PAYMENT',
          amount: 300,
          paymentAccountId: paymentAccountId,
          customerId: customer.id,
          orderId: order.id,
          isVerified: true
        })

      // Fetch ledger
      const response = await request(app)
        .get(`/customer/${customer.id}/ledger`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.ledger).toBeDefined()
      expect(Array.isArray(response.body.ledger)).toBe(true)
      expect(response.body.summary).toBeDefined()
      expect(response.body.summary.openingAdvanceBalance).toBeCloseTo(1000, 2)
    })
  })

  describe('Test Case 7: Return Order Editing', () => {
    test('should update return order when status is PENDING', async () => {
      const customer = await prisma.customer.create({
        data: {
          name: 'Return Test Customer',
          phoneNumber: `333${Date.now()}`,
          tenantId: testTenant.id
        }
      })

      const form = await prisma.form.create({
        data: {
          name: 'Test Form',
          formLink: `test-return-${Date.now()}`,
          tenantId: testTenant.id,
          isPublished: true
        }
      })

      const product = await prisma.product.create({
        data: {
          name: 'Test Product',
          sku: `SKU-RET-${Date.now()}`,
          tenantId: testTenant.id,
          currentRetailPrice: 1000,
          currentQuantity: 10
        }
      })

      const order = await prisma.order.create({
        data: {
          orderNumber: `ORD-RET-${Date.now()}`,
          formId: form.id,
          customerId: customer.id,
          tenantId: testTenant.id,
          status: 'CONFIRMED',
          formData: JSON.stringify({ 'Customer Name': 'Test Customer', 'Phone Number': '1234567890' }),
          selectedProducts: JSON.stringify([{ id: product.id }]),
          productQuantities: JSON.stringify({ [product.id]: 2 }),
          productPrices: JSON.stringify({ [product.id]: 1000 }),
          shippingCharges: 200
        }
      })

      // Create return
      const returnResponse = await request(app)
        .post('/accounting/returns')
        .send({
          orderId: order.id,
          returnType: 'CUSTOMER_PARTIAL',
          returnDate: new Date().toISOString(),
          reason: 'Defective product',
          shippingChargeHandling: 'CUSTOMER_PAYS',
          selectedProducts: [{ id: product.id, quantity: 1 }]
        })

      expect(returnResponse.status).toBe(201)
      const returnId = returnResponse.body.data.id

      // Update return
      const updateResponse = await request(app)
        .put(`/accounting/returns/${returnId}`)
        .send({
          returnType: 'CUSTOMER_PARTIAL',
          reason: 'Updated reason',
          shippingChargeHandling: 'FULL_REFUND',
          selectedProducts: [{ id: product.id, quantity: 1 }]
        })

      expect(updateResponse.status).toBe(200)
      expect(updateResponse.body.success).toBe(true)
      expect(updateResponse.body.data.reason).toBe('Updated reason')
    })

    test('should reject return and reverse accounting entries', async () => {
      const customer = await prisma.customer.create({
        data: {
          name: 'Reject Test Customer',
          phoneNumber: `444${Date.now()}`,
          tenantId: testTenant.id
        }
      })

      const form = await prisma.form.create({
        data: {
          name: 'Test Form',
          formLink: `test-reject-${Date.now()}`,
          tenantId: testTenant.id,
          isPublished: true
        }
      })

      const product = await prisma.product.create({
        data: {
          name: 'Test Product',
          sku: `SKU-REJ-${Date.now()}`,
          tenantId: testTenant.id,
          currentRetailPrice: 500,
          currentQuantity: 10
        }
      })

      const order = await prisma.order.create({
        data: {
          orderNumber: `ORD-REJ-${Date.now()}`,
          formId: form.id,
          customerId: customer.id,
          tenantId: testTenant.id,
          status: 'CONFIRMED',
          formData: JSON.stringify({ 'Customer Name': 'Test Customer', 'Phone Number': '1234567890' }),
          selectedProducts: JSON.stringify([{ id: product.id }]),
          productQuantities: JSON.stringify({ [product.id]: 1 }),
          productPrices: JSON.stringify({ [product.id]: 500 }),
          shippingCharges: 100
        }
      })

      // Create return
      const returnResponse = await request(app)
        .post('/accounting/returns')
        .send({
          orderId: order.id,
          returnType: 'CUSTOMER_PARTIAL',
          returnDate: new Date().toISOString(),
          reason: 'Test return',
          shippingChargeHandling: 'CUSTOMER_PAYS',
          selectedProducts: [{ id: product.id, quantity: 1 }]
        })

      const returnId = returnResponse.body.data.id

      // Reject return
      const rejectResponse = await request(app)
        .post(`/accounting/returns/${returnId}/reject`)
        .send({
          reason: 'Return not valid'
        })

      expect(rejectResponse.status).toBe(200)
      expect(rejectResponse.body.success).toBe(true)
      expect(rejectResponse.body.data.status).toBe('REJECTED')

      // Verify reversing transaction created
      const transactions = await prisma.transaction.findMany({
        where: {
          tenantId: testTenant.id,
          description: { contains: 'Return Rejected (Reverse)' }
        }
      })
      expect(transactions.length).toBeGreaterThan(0)
    })
  })

  describe('Test Case 8: Enhanced Balance Calculation', () => {
    test('should calculate customer balance including all transactions', async () => {
      // Create customer with opening balance through API to ensure transaction is created
      const customerResponse = await request(app)
        .post('/customer')
        .send({
          name: 'Balance Calc Customer',
          phoneNumber: `555${Date.now()}`,
          balance: -500 // Negative = advance
        })
      
      const customer = customerResponse.body.customer

      const form = await prisma.form.create({
        data: {
          name: 'Test Form',
          formLink: `test-bal-${Date.now()}`,
          tenantId: testTenant.id,
          isPublished: true
        }
      })

      const product = await prisma.product.create({
        data: {
          name: 'Test Product',
          sku: `SKU-BAL-${Date.now()}`,
          tenantId: testTenant.id,
          currentRetailPrice: 1000,
          currentQuantity: 10
        }
      })

      // Create order
      const order = await prisma.order.create({
        data: {
          orderNumber: `ORD-BAL-${Date.now()}`,
          formId: form.id,
          customerId: customer.id,
          tenantId: testTenant.id,
          status: 'CONFIRMED',
          formData: JSON.stringify({ 'Customer Name': 'Test Customer', 'Phone Number': '1234567890' }),
          selectedProducts: JSON.stringify([{ id: product.id }]),
          productQuantities: JSON.stringify({ [product.id]: 2 }),
          productPrices: JSON.stringify({ [product.id]: 1000 }),
          shippingCharges: 200,
          verifiedPaymentAmount: 1500,
          paymentVerified: true
        }
      })

      // Create direct payment
      await request(app)
        .post('/accounting/payments')
        .send({
          date: new Date().toISOString(),
          type: 'CUSTOMER_PAYMENT',
          amount: 300,
          paymentAccountId: paymentAccountId,
          customerId: customer.id,
          orderId: null,
          isVerified: true
        })

      // Calculate balance
      const balance = await balanceService.calculateCustomerBalance(customer.id)

      expect(balance).toBeDefined()
      expect(balance.openingAdvanceBalance).toBeCloseTo(500, 2)
      expect(balance.totalOrderValue).toBeCloseTo(2200, 2) // 2 * 1000 + 200
      expect(balance.totalVerifiedPayments).toBeCloseTo(1500, 2)
      expect(balance.totalDirectPayments).toBeCloseTo(300, 2)
      expect(balance.availableAdvance).toBeGreaterThan(0)
    })
  })
})

