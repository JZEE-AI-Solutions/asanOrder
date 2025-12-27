const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const request = require('supertest');
const prisma = require('../lib/db');
const accountingService = require('../services/accountingService');
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
let supplierAId; // Supplier with advance
let supplierBId; // Supplier with pending
let supplierCId; // Supplier for complex scenarios

describe('Supplier, Purchase, Payment & Accounting Integration Tests', () => {
  beforeAll(async () => {
    // Create test tenant and user
    const { user, tenant } = await createTestTenant();
    testUser = user;
    testTenant = tenant;
    authToken = generateTestToken(user, tenant);
    
    // Set test user/tenant for app
    setTestAuth(user, tenant);
    
    console.log(`✅ Test tenant created: ${tenant.id}`);
  });

  afterAll(async () => {
    // Clean up test data
    if (testTenant) {
      await cleanupTestData(testTenant.id);
      console.log('✅ Test data cleaned up');
    }
  });

  describe('Test Case 1: Supplier Creation with Advance Payment', () => {
    test('should create supplier with Rs. 10,000 advance and verify accounting', async () => {
      const response = await request(app)
        .post('/accounting/suppliers')
        .send({
          name: 'Supplier A - Advance',
          balanceType: 'they_owe',
          balance: 10000
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      supplierAId = response.body.data.id;

      // Verify accounting impact
      await verifyAccountBalance('1220', testTenant.id, 10000); // Supplier Advance Balance
      await verifyAccountBalance('3001', testTenant.id, -10000); // Opening Balance Equity

      // Verify supplier balance
      const balance = await getSupplierBalance(supplierAId, testTenant.id);
      expect(balance.pending).toBeLessThan(0); // Negative means advance
      expect(Math.abs(balance.pending)).toBeCloseTo(10000, 2);
    });
  });

  describe('Test Case 2: Supplier Creation with Pending Amount', () => {
    test('should create supplier with Rs. 15,000 pending and verify accounting', async () => {
      const response = await request(app)
        .post('/accounting/suppliers')
        .send({
          name: 'Supplier B - Pending',
          balanceType: 'we_owe',
          balance: 15000
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      supplierBId = response.body.data.id;

      // Verify accounting impact
      await verifyAccountBalance('2000', testTenant.id, 15000); // Accounts Payable
      await verifyAccountBalance('3001', testTenant.id, -25000); // Opening Balance Equity (cumulative)

      // Verify supplier balance
      const balance = await getSupplierBalance(supplierBId, testTenant.id);
      expect(balance.pending).toBeGreaterThan(0); // Positive means we owe them
      expect(balance.pending).toBeCloseTo(15000, 2);
    });
  });

  describe('Test Case 3: Edit Supplier - Change from Advance to Pending', () => {
    test('should edit supplier A from advance to pending and verify accounting adjustment', async () => {
      const response = await request(app)
        .put(`/accounting/suppliers/${supplierAId}`)
        .send({
          name: 'Supplier A - Advance',
          balanceType: 'we_owe',
          balance: 5000
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify accounting impact
      await verifyAccountBalance('1220', testTenant.id, 0); // Supplier Advance Balance (reversed)
      await verifyAccountBalance('2000', testTenant.id, 20000); // Accounts Payable (15k + 5k)
      await verifyAccountBalance('3001', testTenant.id, -20000); // Opening Balance Equity

      // Verify supplier balance
      const balance = await getSupplierBalance(supplierAId, testTenant.id);
      expect(balance.pending).toBeGreaterThan(0);
      expect(balance.pending).toBeCloseTo(5000, 2);
    });
  });

  describe('Test Case 4: Create Purchase Invoice - Using Full Advance', () => {
    test('should create purchase invoice using full advance and verify accounting', async () => {
      // First, recreate supplier A with advance
      await request(app)
        .put(`/accounting/suppliers/${supplierAId}`)
        .send({
          name: 'Supplier A - Advance',
          balanceType: 'they_owe',
          balance: 10000
        });

      const response = await request(app)
        .post('/purchase-invoice/with-products')
        .send({
          supplierId: supplierAId,
          invoiceNumber: 'PI-001',
          invoiceDate: new Date().toISOString(),
          totalAmount: 8000,
          useAdvanceBalance: true,
          products: [
            {
              name: 'Product X',
              quantity: 10,
              purchasePrice: 800,
              total: 8000
            }
          ]
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);

      // Verify accounting impact
      await verifyAccountBalance('1300', testTenant.id, 8000); // Inventory
      await verifyAccountBalance('1220', testTenant.id, 2000); // Supplier Advance Balance (10k - 8k)
      await verifyAccountBalance('2000', testTenant.id, 20000); // Accounts Payable (unchanged)

      // Verify product balance
      const productQty = await getProductQuantity('Product X', testTenant.id);
      expect(productQty).toBe(10);

      // Verify payment record created
      const payments = await prisma.payment.findMany({
        where: {
          purchaseInvoiceId: response.body.data.id,
          tenantId: testTenant.id
        }
      });
      expect(payments.length).toBeGreaterThan(0);
      const advancePayment = payments.find(p => p.paymentMethod === 'Advance Balance');
      expect(advancePayment).toBeDefined();
      expect(advancePayment.amount).toBeCloseTo(8000, 2);
    });
  });

  describe('Test Case 5: Create Purchase Invoice - Partial Advance + Cash Payment', () => {
    test('should create purchase invoice with partial advance and cash payment', async () => {
      const response = await request(app)
        .post('/purchase-invoice/with-products')
        .send({
          supplierId: supplierAId,
          invoiceNumber: 'PI-002',
          invoiceDate: new Date().toISOString(),
          totalAmount: 5000,
          useAdvanceBalance: true,
          paymentAmount: 3000,
          paymentMethod: 'Cash',
          products: [
            {
              name: 'Product Y',
              quantity: 5,
              purchasePrice: 1000,
              total: 5000
            }
          ]
        });

      expect(response.status).toBe(201);

      // Verify accounting impact
      await verifyAccountBalance('1300', testTenant.id, 13000); // Inventory (8k + 5k)
      await verifyAccountBalance('1220', testTenant.id, 0); // Supplier Advance Balance (fully utilized)
      await verifyAccountBalance('2000', testTenant.id, 20000); // Accounts Payable (net zero after adjustments)
      await verifyAccountBalance('1000', testTenant.id, -3000); // Cash (decreased)

      // Verify product balance
      const productQty = await getProductQuantity('Product Y', testTenant.id);
      expect(productQty).toBe(5);

      // Verify payment records
      const payments = await prisma.payment.findMany({
        where: {
          purchaseInvoiceId: response.body.data.id,
          tenantId: testTenant.id
        }
      });
      expect(payments.length).toBe(2); // Advance + Cash
    });
  });

  describe('Test Case 6: Create Purchase Invoice - No Advance, Full Cash Payment', () => {
    test('should create purchase invoice with full cash payment', async () => {
      const response = await request(app)
        .post('/purchase-invoice/with-products')
        .send({
          supplierId: supplierBId,
          invoiceNumber: 'PI-003',
          invoiceDate: new Date().toISOString(),
          totalAmount: 12000,
          paymentAmount: 12000,
          paymentMethod: 'Cash',
          products: [
            {
              name: 'Product Z',
              quantity: 20,
              purchasePrice: 600,
              total: 12000
            }
          ]
        });

      expect(response.status).toBe(201);

      // Verify accounting impact
      await verifyAccountBalance('1300', testTenant.id, 25000); // Inventory (13k + 12k)
      await verifyAccountBalance('2000', testTenant.id, 20000); // Accounts Payable (15k + 5k + 12k - 12k = 20k)
      await verifyAccountBalance('1000', testTenant.id, -15000); // Cash (decreased by 3k + 12k)

      // Verify product balance
      const productQty = await getProductQuantity('Product Z', testTenant.id);
      expect(productQty).toBe(20);
    });
  });

  describe('Test Case 7: Create Purchase Invoice - Unpaid', () => {
    test('should create unpaid purchase invoice', async () => {
      const response = await request(app)
        .post('/purchase-invoice/with-products')
        .send({
          supplierId: supplierBId,
          invoiceNumber: 'PI-004',
          invoiceDate: new Date().toISOString(),
          totalAmount: 7000,
          products: [
            {
              name: 'Product W',
              quantity: 7,
              purchasePrice: 1000,
              total: 7000
            }
          ]
        });

      expect(response.status).toBe(201);

      // Verify accounting impact
      await verifyAccountBalance('1300', testTenant.id, 32000); // Inventory (25k + 7k)
      await verifyAccountBalance('2000', testTenant.id, 27000); // Accounts Payable (20k + 7k)

      // Verify no payment record
      const payments = await prisma.payment.findMany({
        where: {
          purchaseInvoiceId: response.body.data.id,
          tenantId: testTenant.id
        }
      });
      expect(payments.length).toBe(0);
    });
  });

  describe('Test Case 8: Make Payment from Purchase Card', () => {
    test('should make payment for unpaid invoice', async () => {
      // Get the unpaid invoice
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: {
          invoiceNumber: 'PI-004',
          tenantId: testTenant.id
        }
      });

      const response = await request(app)
        .post('/accounting/payments')
        .send({
          type: 'SUPPLIER_PAYMENT',
          supplierId: supplierBId,
          purchaseInvoiceId: invoice.id,
          date: new Date().toISOString(),
          amount: 7000,
          paymentMethod: 'Bank Transfer'
        });

      expect(response.status).toBe(201);

      // Verify accounting impact
      await verifyAccountBalance('2000', testTenant.id, 20000); // Accounts Payable (27k - 7k)
      await verifyAccountBalance('1100', testTenant.id, -7000); // Bank Account (decreased)
    });
  });

  describe('Test Case 9: Edit Purchase Invoice - Increase Amount', () => {
    test('should edit purchase invoice to increase amount', async () => {
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: {
          invoiceNumber: 'PI-001',
          tenantId: testTenant.id
        }
      });

      const response = await request(app)
        .put(`/purchase-invoice/${invoice.id}/with-products`)
        .send({
          invoiceNumber: 'PI-001',
          invoiceDate: new Date().toISOString(),
          totalAmount: 10000,
          products: [
            {
              name: 'Product X',
              quantity: 12.5,
              purchasePrice: 800,
              total: 10000
            }
          ]
        });

      expect(response.status).toBe(200);

      // Verify accounting adjustment
      await verifyAccountBalance('1300', testTenant.id, 34000); // Inventory (32k + 2k)
      await verifyAccountBalance('2000', testTenant.id, 22000); // Accounts Payable (20k + 2k)
    });
  });

  describe('Test Case 10: Edit Purchase Invoice - Decrease Amount', () => {
    test('should edit purchase invoice to decrease amount', async () => {
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: {
          invoiceNumber: 'PI-002',
          tenantId: testTenant.id
        }
      });

      const response = await request(app)
        .put(`/purchase-invoice/${invoice.id}/with-products`)
        .send({
          invoiceNumber: 'PI-002',
          invoiceDate: new Date().toISOString(),
          totalAmount: 4000,
          products: [
            {
              name: 'Product Y',
              quantity: 4,
              purchasePrice: 1000,
              total: 4000
            }
          ]
        });

      expect(response.status).toBe(200);

      // Verify accounting adjustment
      await verifyAccountBalance('1300', testTenant.id, 33000); // Inventory (34k - 1k)
      await verifyAccountBalance('2000', testTenant.id, 21000); // Accounts Payable (22k - 1k)
    });
  });

  describe('Test Case 11: Edit Payment - Increase Amount', () => {
    test('should edit payment to increase amount', async () => {
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: {
          invoiceNumber: 'PI-002',
          tenantId: testTenant.id
        },
        include: {
          payments: true
        }
      });

      const cashPayment = invoice.payments.find(p => p.paymentMethod === 'Cash');
      
      const response = await request(app)
        .put(`/accounting/payments/${cashPayment.id}`)
        .send({
          date: new Date().toISOString(),
          amount: 4000,
          paymentMethod: 'Cash'
        });

      expect(response.status).toBe(200);

      // Verify accounting adjustment
      await verifyAccountBalance('2000', testTenant.id, 20000); // Accounts Payable (21k - 1k)
      await verifyAccountBalance('1000', testTenant.id, -16000); // Cash (decreased by additional 1k)
    });
  });

  describe('Test Case 12: Edit Payment - Decrease Amount', () => {
    test('should edit payment to decrease amount', async () => {
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: {
          invoiceNumber: 'PI-003',
          tenantId: testTenant.id
        },
        include: {
          payments: true
        }
      });

      const payment = invoice.payments[0];
      
      const response = await request(app)
        .put(`/accounting/payments/${payment.id}`)
        .send({
          date: new Date().toISOString(),
          amount: 10000,
          paymentMethod: 'Cash'
        });

      expect(response.status).toBe(200);

      // Verify accounting adjustment
      await verifyAccountBalance('2000', testTenant.id, 22000); // Accounts Payable (20k + 2k)
      await verifyAccountBalance('1000', testTenant.id, -14000); // Cash (increased by 2k)
    });
  });

  describe('Test Case 13: Edit Payment - Change Payment Method Only', () => {
    test('should edit payment to change method from Cash to Bank', async () => {
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: {
          invoiceNumber: 'PI-003',
          tenantId: testTenant.id
        },
        include: {
          payments: true
        }
      });

      const payment = invoice.payments[0];
      
      const response = await request(app)
        .put(`/accounting/payments/${payment.id}`)
        .send({
          date: new Date().toISOString(),
          amount: 10000,
          paymentMethod: 'Bank Transfer'
        });

      expect(response.status).toBe(200);

      // Verify accounting adjustment (method change)
      await verifyAccountBalance('1000', testTenant.id, -4000); // Cash (increased by 10k)
      await verifyAccountBalance('1100', testTenant.id, -17000); // Bank (decreased by 10k)
      await verifyAccountBalance('2000', testTenant.id, 22000); // Accounts Payable (unchanged)
    });
  });

  describe('Test Case 14: Complex Scenario - Multiple Operations', () => {
    test('should handle complex scenario with multiple purchases and payments', async () => {
      // Create supplier C with advance
      const supplierResponse = await request(app)
        .post('/accounting/suppliers')
        .send({
          name: 'Supplier C - Complex',
          balanceType: 'they_owe',
          balance: 20000
        });
      
      supplierCId = supplierResponse.body.data.id;

      // Purchase 1: Rs. 15,000 (full advance)
      const purchase1 = await request(app)
        .post('/purchase-invoice/with-products')
        .send({
          supplierId: supplierCId,
          invoiceNumber: 'PI-005',
          invoiceDate: new Date().toISOString(),
          totalAmount: 15000,
          useAdvanceBalance: true,
          products: [{ name: 'Product C1', quantity: 15, purchasePrice: 1000, total: 15000 }]
        });

      expect(purchase1.status).toBe(201);

      // Purchase 2: Rs. 8,000 (Rs. 5,000 advance + Rs. 3,000 cash)
      const purchase2 = await request(app)
        .post('/purchase-invoice/with-products')
        .send({
          supplierId: supplierCId,
          invoiceNumber: 'PI-006',
          invoiceDate: new Date().toISOString(),
          totalAmount: 8000,
          useAdvanceBalance: true,
          paymentAmount: 3000,
          paymentMethod: 'Cash',
          products: [{ name: 'Product C2', quantity: 8, purchasePrice: 1000, total: 8000 }]
        });

      expect(purchase2.status).toBe(201);

      // Verify supplier advance is fully utilized
      const balance = await getSupplierBalance(supplierCId, testTenant.id);
      expect(Math.abs(balance.pending)).toBeLessThan(0.01); // Should be near zero

      // Verify final accounting state
      await verifyAccountBalance('1220', testTenant.id, 0); // Supplier Advance Balance
      await verifyAccountBalance('1300', testTenant.id, 56000); // Inventory (33k + 15k + 8k)
    });
  });

  describe('Test Case 15: Product Balance Verification', () => {
    test('should verify product balances are correctly updated', async () => {
      const initialQty = await getProductQuantity('Product X', testTenant.id);
      expect(initialQty).toBeGreaterThanOrEqual(12); // Should be at least 12 from previous tests

      // Create new purchase with existing product
      const response = await request(app)
        .post('/purchase-invoice/with-products')
        .send({
          supplierId: supplierBId,
          invoiceNumber: 'PI-007',
          invoiceDate: new Date().toISOString(),
          totalAmount: 5000,
          products: [
            {
              name: 'Product X',
              quantity: 5,
              purchasePrice: 1000,
              total: 5000
            }
          ]
        });

      expect(response.status).toBe(201);

      // Verify product balance increased
      const newQty = await getProductQuantity('Product X', testTenant.id);
      expect(newQty).toBe(initialQty + 5);
    });
  });

  describe('Test Case 21: Purchase Invoice with Returns - Reduce AP Method', () => {
    test('should create purchase invoice with returns using Reduce AP method', async () => {
      // First create a product to return
      await request(app)
        .post('/purchase-invoice/with-products')
        .send({
          supplierId: supplierBId,
          invoiceNumber: 'PI-PREP-001',
          invoiceDate: new Date().toISOString(),
          totalAmount: 10000,
          products: [
            {
              name: 'Product Return A',
              quantity: 10,
              purchasePrice: 1000,
              total: 10000
            }
          ]
        });

      // Now create purchase with returns
      const response = await request(app)
        .post('/purchase-invoice/with-products')
        .send({
          supplierId: supplierBId,
          invoiceNumber: 'PI-008',
          invoiceDate: new Date().toISOString(),
          totalAmount: 10500, // Net amount (12500 - 2000)
          products: [
            {
              name: 'Product A',
              quantity: 10,
              purchasePrice: 1000,
              total: 10000
            },
            {
              name: 'Product B',
              quantity: 5,
              purchasePrice: 500,
              total: 2500
            }
          ],
          returnItems: [
            {
              name: 'Product Return A',
              productName: 'Product Return A',
              quantity: 2,
              purchasePrice: 1000,
              reason: 'Purchase invoice return'
            }
          ],
          returnHandlingMethod: 'REDUCE_AP'
        });

      expect(response.status).toBe(201);
      expect(response.body.returnItems).toBeDefined();
      expect(response.body.returnItems.length).toBe(1);

      // Verify return record created
      const returnRecord = await prisma.return.findFirst({
        where: {
          purchaseInvoiceId: response.body.invoice.id,
          returnType: 'SUPPLIER',
          tenantId: testTenant.id
        },
        include: {
          returnItems: true
        }
      });

      expect(returnRecord).toBeDefined();
      expect(returnRecord.returnItems.length).toBe(1);
      expect(returnRecord.totalAmount).toBe(2000);

      // Verify accounting impact
      // Purchase: +12,500, Return: -2,000, Net: +10,500
      await verifyAccountBalance('1300', testTenant.id, 66000); // Inventory (56k + 10.5k)
      await verifyAccountBalance('2000', testTenant.id, 37500); // Accounts Payable (27k + 10.5k)

      // Verify product quantities
      const productAQty = await getProductQuantity('Product A', testTenant.id);
      expect(productAQty).toBe(10);

      const productBQty = await getProductQuantity('Product B', testTenant.id);
      expect(productBQty).toBe(5);

      const returnProductQty = await getProductQuantity('Product Return A', testTenant.id);
      expect(returnProductQty).toBe(8); // 10 - 2

      // Verify product logs
      const returnProduct = await prisma.product.findFirst({
        where: {
          name: 'Product Return A',
          tenantId: testTenant.id
        },
        include: {
          productLogs: {
            where: {
              reason: { contains: 'Purchase return' }
            },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      expect(returnProduct).toBeDefined();
      expect(returnProduct.productLogs.length).toBeGreaterThan(0);
      expect(returnProduct.productLogs[0].action).toBe('DECREASE');
    });
  });

  describe('Test Case 22: Purchase Invoice with Returns - Refund Method', () => {
    test('should create purchase invoice with returns using Refund method', async () => {
      // Get a cash account for refund
      let cashAccount = await getPaymentAccount('CASH', testTenant.id);
      
      // Set initial balance if needed
      if (cashAccount.balance === 0) {
        await prisma.account.update({
          where: { id: cashAccount.id },
          data: { balance: 10000 }
        });
        cashAccount = await prisma.account.findUnique({ where: { id: cashAccount.id } });
      }

      const initialCashBalance = cashAccount.balance;

      // Create purchase with returns using refund method
      const response = await request(app)
        .post('/purchase-invoice/with-products')
        .send({
          supplierId: supplierBId,
          invoiceNumber: 'PI-009',
          invoiceDate: new Date().toISOString(),
          totalAmount: 5600, // Net amount (6400 - 800)
          products: [
            {
              name: 'Product C',
              quantity: 8,
              purchasePrice: 800,
              total: 6400
            }
          ],
          returnItems: [
            {
              name: 'Product C',
              productName: 'Product C',
              quantity: 1,
              purchasePrice: 800,
              reason: 'Purchase invoice return'
            }
          ],
          returnHandlingMethod: 'REFUND',
          returnRefundAccountId: cashAccount.id
        });

      expect(response.status).toBe(201);

      // Verify return record created
      const returnRecord = await prisma.return.findFirst({
        where: {
          purchaseInvoiceId: response.body.invoice.id,
          returnType: 'SUPPLIER',
          tenantId: testTenant.id
        }
      });

      expect(returnRecord).toBeDefined();
      expect(returnRecord.totalAmount).toBe(800);

      // Verify accounting impact
      // Purchase: +6,400, Return: -800, Net: +5,600
      await verifyAccountBalance('1300', testTenant.id, 71600); // Inventory (66k + 5.6k)
      await verifyAccountBalance('2000', testTenant.id, 43100); // Accounts Payable (37.5k + 5.6k)

      // Verify cash account decreased (refund)
      const updatedCashAccount = await prisma.account.findUnique({
        where: { id: cashAccount.id }
      });
      expect(updatedCashAccount.balance).toBe(initialCashBalance - 800);

      // Verify product quantity
      const productCQty = await getProductQuantity('Product C', testTenant.id);
      expect(productCQty).toBe(7); // 8 - 1
    });
  });

  describe('Test Case 25: Edit Purchase Invoice - Add Returns', () => {
    test('should edit purchase invoice to add return items', async () => {
      // Get existing invoice from Test Case 21
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: {
          invoiceNumber: 'PI-008',
          tenantId: testTenant.id
        },
        include: {
          purchaseItems: true,
          returns: {
            include: {
              returnItems: true
            }
          }
        }
      });

      expect(invoice).toBeDefined();

      // Get initial balances for reference
      await verifyAccountBalance('1300', testTenant.id, 66000);
      await verifyAccountBalance('2000', testTenant.id, 37500);

      // Edit invoice to add return item
      const response = await request(app)
        .put(`/purchase-invoice/${invoice.id}/with-products`)
        .send({
          invoiceNumber: 'PI-008',
          products: invoice.purchaseItems.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            purchasePrice: item.purchasePrice,
            sku: item.sku || null,
            category: item.category || null,
            description: item.description || null
          })),
          returnItems: [
            ...invoice.returns[0].returnItems.map(ri => ({
              id: ri.id,
              name: ri.productName,
              productName: ri.productName,
              quantity: ri.quantity,
              purchasePrice: ri.purchasePrice,
              reason: ri.reason || 'Purchase invoice return'
            })),
            {
              name: 'Product B',
              productName: 'Product B',
              quantity: 1,
              purchasePrice: 500,
              reason: 'Additional return'
            }
          ],
          returnHandlingMethod: 'REDUCE_AP'
        });

      expect(response.status).toBe(200);

      // Verify accounting adjustment
      // Additional return: -500
      await verifyAccountBalance('1300', testTenant.id, 65500); // Inventory (66k - 500)
      await verifyAccountBalance('2000', testTenant.id, 37000); // Accounts Payable (37.5k - 500)

      // Verify product quantity
      const productBQty = await getProductQuantity('Product B', testTenant.id);
      expect(productBQty).toBe(4); // 5 - 1
    });
  });

  describe('Test Case 27: Edit Purchase Invoice - Change Return Handling Method', () => {
    test('should edit purchase invoice to change return handling method', async () => {
      // Get a cash account for refund
      let cashAccount = await getPaymentAccount('CASH', testTenant.id);
      
      // Set initial balance if needed
      if (cashAccount.balance === 0) {
        await prisma.account.update({
          where: { id: cashAccount.id },
          data: { balance: 10000 }
        });
        cashAccount = await prisma.account.findUnique({ where: { id: cashAccount.id } });
      }

      const initialCashBalance = cashAccount.balance;

      // Get invoice with returns
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: {
          invoiceNumber: 'PI-008',
          tenantId: testTenant.id
        },
        include: {
          purchaseItems: true,
          returns: {
            include: {
              returnItems: true
            }
          }
        }
      });

      expect(invoice).toBeDefined();
      expect(invoice.returns.length).toBeGreaterThan(0);

      const returnTotal = invoice.returns[0].returnItems.reduce((sum, ri) => 
        sum + (ri.quantity * ri.purchasePrice), 0
      );

      // Change return handling method from REDUCE_AP to REFUND
      const response = await request(app)
        .put(`/purchase-invoice/${invoice.id}/with-products`)
        .send({
          invoiceNumber: 'PI-008',
          products: invoice.purchaseItems.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            purchasePrice: item.purchasePrice,
            sku: item.sku || null,
            category: item.category || null,
            description: item.description || null
          })),
          returnItems: invoice.returns[0].returnItems.map(ri => ({
            id: ri.id,
            name: ri.productName,
            productName: ri.productName,
            quantity: ri.quantity,
            purchasePrice: ri.purchasePrice,
            reason: ri.reason || 'Purchase invoice return'
          })),
          returnHandlingMethod: 'REFUND',
          returnRefundAccountId: cashAccount ? cashAccount.id : null
        });

      expect(response.status).toBe(200);

      // Verify accounting adjustment
      // Old method reversed: AP increased by return total
      // New method applied: Cash decreased by return total
      if (cashAccount) {
        const updatedCashAccount = await prisma.account.findUnique({
          where: { id: cashAccount.id }
        });
        // Cash should decrease by return total (refund)
        expect(updatedCashAccount.balance).toBeLessThan(initialCashBalance);
      }

      // AP should increase (no longer reduced by returns)
      await verifyAccountBalance('2000', testTenant.id, 37500); // AP should be back to original + return total
    });
  });
});

