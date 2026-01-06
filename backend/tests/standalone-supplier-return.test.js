const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const request = require('supertest');
const prisma = require('../lib/db');
const accountingService = require('../services/accountingService');
const InventoryService = require('../services/inventoryService');
const {
  createTestTenant,
  generateTestToken,
  cleanupTestData,
  verifyAccountBalance,
  getSupplierBalance,
  getProductQuantity,
  getPaymentAccount,
  getAccountByCode,
  createTestApp,
  setTestAuth
} = require('./helpers/testHelpers');

// Create test app with mock auth
const app = createTestApp();

// Test data
let testUser;
let testTenant;
let authToken;
let supplierId;
let purchaseInvoiceId;
let productId;
let inventoryAccount;
let apAccount;
let cashAccount;

describe('Standalone Supplier Return Tests', () => {
  beforeAll(async () => {
    // Create test tenant and user
    const { user, tenant } = await createTestTenant();
    testUser = user;
    testTenant = tenant;
    authToken = generateTestToken(user, tenant);
    
    // Set test user/tenant for app
    setTestAuth(user, tenant);
    
    // Get or create accounts
    inventoryAccount = await accountingService.getAccountByCode('1300', tenant.id) ||
      await accountingService.getOrCreateAccount({
        code: '1300',
        name: 'Inventory',
        type: 'ASSET',
        tenantId: tenant.id,
        balance: 0
      });

    apAccount = await accountingService.getAccountByCode('2000', tenant.id) ||
      await accountingService.getOrCreateAccount({
        code: '2000',
        name: 'Accounts Payable',
        type: 'LIABILITY',
        tenantId: tenant.id,
        balance: 0
      });

    // Get or create a cash account for refunds
    cashAccount = await prisma.account.findFirst({
      where: {
        tenantId: tenant.id,
        type: 'ASSET',
        accountSubType: 'CASH'
      }
    });

    if (!cashAccount) {
      cashAccount = await accountingService.getOrCreateAccount({
        code: '1100',
        name: 'Cash Account',
        type: 'ASSET',
        accountSubType: 'CASH',
        tenantId: tenant.id,
        balance: 100000
      });
    } else {
      // Update balance if needed
      if (cashAccount.balance < 100000) {
        await prisma.account.update({
          where: { id: cashAccount.id },
          data: { balance: 100000 }
        });
        cashAccount = await prisma.account.findUnique({ where: { id: cashAccount.id } });
      }
    }

    // Create supplier
    const supplier = await prisma.supplier.create({
      data: {
        name: 'Test Supplier',
        tenantId: tenant.id,
        balance: 0
      }
    });
    supplierId = supplier.id;

    // Create product
    const product = await prisma.product.create({
      data: {
        name: 'Test Product',
        tenantId: tenant.id,
        currentQuantity: 100,
        lastPurchasePrice: 100
      }
    });
    productId = product.id;

    // Create purchase invoice
    const invoice = await prisma.purchaseInvoice.create({
      data: {
        invoiceNumber: `INV-${Date.now()}`,
        supplierId: supplierId,
        supplierName: 'Test Supplier',
        invoiceDate: new Date(),
        totalAmount: 10000,
        tenantId: tenant.id
      }
    });
    purchaseInvoiceId = invoice.id;

    // Create purchase items
    await prisma.purchaseItem.create({
      data: {
        name: 'Test Product',
        purchasePrice: 100,
        quantity: 100,
        tenantId: tenant.id,
        purchaseInvoiceId: invoice.id,
        productId: product.id
      }
    });

    // Create accounting transaction for purchase
    await accountingService.createTransaction(
      {
        transactionNumber: `TXN-${Date.now()}`,
        date: new Date(),
        description: `Purchase Invoice: ${invoice.invoiceNumber}`,
        tenantId: tenant.id,
        purchaseInvoiceId: invoice.id
      },
      [
        {
          accountId: inventoryAccount.id,
          debitAmount: 10000,
          creditAmount: 0
        },
        {
          accountId: apAccount.id,
          debitAmount: 0,
          creditAmount: 10000
        }
      ]
    );

    console.log(`✅ Test setup completed`);
  });

  afterAll(async () => {
    // Clean up test data
    if (testTenant) {
      await cleanupTestData(testTenant.id);
      console.log('✅ Test data cleaned up');
    }
  });

  describe('Test Case 1: Create Standalone Return with REDUCE_AP', () => {
    test('should create standalone return and verify accounting entries use return date', async () => {
      const returnDate = new Date('2024-01-15');
      const returnDateISO = returnDate.toISOString().split('T')[0];

      const response = await request(app)
        .post('/return')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          purchaseInvoiceId: purchaseInvoiceId,
          returnDate: returnDateISO,
          reason: 'Defective items',
          totalAmount: 1000,
          returnItems: [
            {
              productName: 'Test Product',
              purchasePrice: 100,
              quantity: 10,
              reason: 'Defective'
            }
          ],
          returnHandlingMethod: 'REDUCE_AP',
          notes: 'Test return'
        });

      expect(response.status).toBe(201);
      expect(response.body.return).toBeDefined();
      expect(response.body.return.status).toBe('APPROVED');
      expect(response.body.return.returnType).toBe('SUPPLIER');
      expect(response.body.return.purchaseInvoiceId).toBe(purchaseInvoiceId);

      const returnId = response.body.return.id;

      // Verify accounting transaction uses return date
      const transaction = await prisma.transaction.findFirst({
        where: {
          orderReturnId: returnId,
          tenantId: testTenant.id
        },
        include: {
          transactionLines: {
            include: {
              account: true
            }
          }
        }
      });

      expect(transaction).toBeDefined();
      expect(new Date(transaction.date).toISOString().split('T')[0]).toBe(returnDateISO);

      // Verify transaction lines
      const inventoryLine = transaction.transactionLines.find(
        line => line.account.code === '1300' || line.account.accountSubType === 'INVENTORY'
      );
      const apLine = transaction.transactionLines.find(
        line => line.account.code === '2000'
      );

      expect(inventoryLine).toBeDefined();
      expect(inventoryLine.creditAmount).toBe(1000);
      expect(apLine).toBeDefined();
      expect(apLine.debitAmount).toBe(1000);

      // Verify account balances
      const inventoryBalance = await getAccountByCode('1300', testTenant.id);
      expect(inventoryBalance.balance).toBeCloseTo(9000, 2); // 10000 - 1000

      const apBalance = await getAccountByCode('2000', testTenant.id);
      expect(apBalance.balance).toBeCloseTo(9000, 2); // 10000 - 1000

      // Verify stock decreased
      const product = await prisma.product.findUnique({
        where: { id: productId }
      });
      expect(product.currentQuantity).toBe(90); // 100 - 10
    });
  });

  describe('Test Case 2: Create Standalone Return with REFUND', () => {
    test('should create standalone return with refund and verify accounting', async () => {
      const returnDate = new Date('2024-01-20');
      const returnDateISO = returnDate.toISOString().split('T')[0];

      const response = await request(app)
        .post('/return')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          purchaseInvoiceId: purchaseInvoiceId,
          returnDate: returnDateISO,
          reason: 'Wrong items',
          totalAmount: 500,
          returnItems: [
            {
              productName: 'Test Product',
              purchasePrice: 100,
              quantity: 5,
              reason: 'Wrong items'
            }
          ],
          returnHandlingMethod: 'REFUND',
          returnRefundAccountId: cashAccount.id,
          notes: 'Refund return'
        });

      expect(response.status).toBe(201);
      expect(response.body.return.status).toBe('APPROVED');

      const returnId = response.body.return.id;

      // Verify accounting transaction
      const transaction = await prisma.transaction.findFirst({
        where: {
          orderReturnId: returnId,
          tenantId: testTenant.id
        },
        include: {
          transactionLines: {
            include: {
              account: true
            }
          }
        }
      });

      expect(transaction).toBeDefined();
      expect(new Date(transaction.date).toISOString().split('T')[0]).toBe(returnDateISO);

      // Verify refund account was credited (decrease cash - we pay supplier)
      const cashLine = transaction.transactionLines.find(
        line => line.accountId === cashAccount.id
      );
      expect(cashLine).toBeDefined();
      expect(cashLine.creditAmount).toBe(500);

      // Verify cash account balance decreased
      const updatedCashAccount = await prisma.account.findUnique({
        where: { id: cashAccount.id }
      });
      expect(updatedCashAccount.balance).toBeCloseTo(99500, 2); // 100000 - 500
    });
  });

  describe('Test Case 3: Edit Standalone Return with Accounting Reversal', () => {
    test('should edit return and verify accounting reversal', async () => {
      // Create initial return
      const initialReturnDate = new Date('2024-01-25');
      const initialReturnDateISO = initialReturnDate.toISOString().split('T')[0];

      const createResponse = await request(app)
        .post('/return')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          purchaseInvoiceId: purchaseInvoiceId,
          returnDate: initialReturnDateISO,
          reason: 'Initial return',
          totalAmount: 800,
          returnItems: [
            {
              productName: 'Test Product',
              purchasePrice: 100,
              quantity: 8,
              reason: 'Initial'
            }
          ],
          returnHandlingMethod: 'REDUCE_AP'
        });

      expect(createResponse.status).toBe(201);
      const returnId = createResponse.body.return.id;

      // Get initial transaction
      const initialTransaction = await prisma.transaction.findFirst({
        where: {
          orderReturnId: returnId,
          tenantId: testTenant.id
        }
      });
      expect(initialTransaction).toBeDefined();

      // Edit return - change date and amount
      const newReturnDate = new Date('2024-01-30');
      const newReturnDateISO = newReturnDate.toISOString().split('T')[0];

      const updateResponse = await request(app)
        .put(`/return/${returnId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          returnDate: newReturnDateISO,
          totalAmount: 1200,
          returnItems: [
            {
              productName: 'Test Product',
              purchasePrice: 100,
              quantity: 12,
              reason: 'Updated return'
            }
          ],
          returnHandlingMethod: 'REDUCE_AP'
        });

      expect(updateResponse.status).toBe(200);

      // Verify reversal transaction was created
      const reversalTransaction = await prisma.transaction.findFirst({
        where: {
          orderReturnId: returnId,
          tenantId: testTenant.id,
          description: {
            contains: 'Reverse'
          }
        }
      });
      expect(reversalTransaction).toBeDefined();

      // Verify new transaction was created with new date
      const newTransaction = await prisma.transaction.findFirst({
        where: {
          orderReturnId: returnId,
          tenantId: testTenant.id,
          description: {
            contains: 'Supplier Return'
          },
          date: new Date(newReturnDateISO)
        }
      });
      expect(newTransaction).toBeDefined();

      // Verify stock was updated correctly (reversed old, applied new)
      const product = await prisma.product.findUnique({
        where: { id: productId }
      });
      // Initial: 85 (after Test Case 2), then -8 (from first return), then +8 (reversal), then -12 (new return) = 73
      expect(product.currentQuantity).toBe(73);
    });
  });

  describe('Test Case 4: Invoice Search with Product Filter', () => {
    test('should search invoices by product name', async () => {
      const response = await request(app)
        .get('/purchase-invoice/search')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          productName: 'Test Product',
          limit: 10
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.purchaseInvoices).toBeDefined();
      expect(Array.isArray(response.body.purchaseInvoices)).toBe(true);

      // Verify invoice contains the product
      const invoice = response.body.purchaseInvoices.find(
        inv => inv.id === purchaseInvoiceId
      );
      expect(invoice).toBeDefined();
      expect(invoice.purchaseItems).toBeDefined();
      expect(invoice.purchaseItems.length).toBeGreaterThan(0);
      expect(invoice.productAvailability).toBeDefined();
    });
  });

  describe('Test Case 5: Validation - Return Quantity Exceeds Available', () => {
    test('should reject return if quantity exceeds available', async () => {
      const response = await request(app)
        .post('/return')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          purchaseInvoiceId: purchaseInvoiceId,
          returnDate: new Date().toISOString().split('T')[0],
          reason: 'Test',
          totalAmount: 100000, // Exceeds available
          returnItems: [
            {
              productName: 'Test Product',
              purchasePrice: 100,
              quantity: 1000, // Exceeds available (100 - 10 - 5 - 8 = 77 available)
              reason: 'Test'
            }
          ],
          returnHandlingMethod: 'REDUCE_AP'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('exceeds available quantity');
    });
  });

  describe('Test Case 6: Validation - Missing Return Handling Method', () => {
    test('should reject return without handling method', async () => {
      const response = await request(app)
        .post('/return')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          purchaseInvoiceId: purchaseInvoiceId,
          returnDate: new Date().toISOString().split('T')[0],
          reason: 'Test',
          totalAmount: 100,
          returnItems: [
            {
              productName: 'Test Product',
              purchasePrice: 100,
              quantity: 1,
              reason: 'Test'
            }
          ]
          // Missing returnHandlingMethod
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Return handling method is required');
    });
  });

  describe('Test Case 7: Validation - Missing Refund Account for REFUND', () => {
    test('should reject REFUND return without refund account', async () => {
      const response = await request(app)
        .post('/return')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          purchaseInvoiceId: purchaseInvoiceId,
          returnDate: new Date().toISOString().split('T')[0],
          reason: 'Test',
          totalAmount: 100,
          returnItems: [
            {
              productName: 'Test Product',
              purchasePrice: 100,
              quantity: 1,
              reason: 'Test'
            }
          ],
          returnHandlingMethod: 'REFUND'
          // Missing returnRefundAccountId
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Return refund account is required');
    });
  });
});

