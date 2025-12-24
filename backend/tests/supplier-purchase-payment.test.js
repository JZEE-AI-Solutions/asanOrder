const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const request = require('supertest');
const prisma = require('../lib/db');
const {
  createTestTenant,
  generateTestToken,
  cleanupTestData,
  verifyAccountBalance,
  getSupplierBalance,
  getProductQuantity,
  createTestApp
} = require('./helpers/testHelpers');

// Create test app with mock auth
const app = createTestApp();

// Middleware to inject test user/tenant into requests
const injectTestAuth = (user, tenant) => {
  return (req, res, next) => {
    req.testUser = user;
    req.testTenant = tenant;
    next();
  };
};

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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
        .send({
          name: 'Supplier A - Advance',
          balanceType: 'they_owe',
          balance: 10000
        });

      const response = await request(app)
        .post('/purchase-invoice/with-products')
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
        .send({
          name: 'Supplier C - Complex',
          balanceType: 'they_owe',
          balance: 20000
        });
      
      supplierCId = supplierResponse.body.data.id;

      // Purchase 1: Rs. 15,000 (full advance)
      const purchase1 = await request(app)
        .post('/purchase-invoice/with-products')
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
        .use(injectTestAuth(testUser, testTenant))
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
});

