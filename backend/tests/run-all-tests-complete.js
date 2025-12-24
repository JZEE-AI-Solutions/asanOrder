/**
 * Comprehensive Test Suite for Supplier, Purchase, Payment & Accounting Integration
 * 
 * This script tests all scenarios from TESTING_SUPPLIER_PURCHASE_PAYMENT_ACCOUNTING.md
 * Run with: node tests/run-all-tests-complete.js
 */

require('dotenv').config();
const prisma = require('../lib/db');
const accountingService = require('../services/accountingService');
const balanceService = require('../services/balanceService');

// Test configuration
const TEST_PREFIX = `TEST-${Date.now()}`;
let testTenant;
let testUser;
let supplierAId, supplierBId, supplierCId;
let purchaseInvoiceIds = {};
let productIds = {};

// Test results
const testResults = {
  passed: [],
  failed: [],
  total: 0
};

// Helper functions
function log(message, type = 'info') {
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} ${message}`);
}

function assert(condition, message) {
  testResults.total++;
  if (condition) {
    testResults.passed.push(message);
    log(`PASS: ${message}`, 'success');
    return true;
  } else {
    testResults.failed.push(message);
    log(`FAIL: ${message}`, 'error');
    return false;
  }
}

async function verifyAccountBalance(code, expectedBalance, tolerance = 0.01) {
  const account = await accountingService.getAccountByCode(code, testTenant.id);
  if (!account) {
    throw new Error(`Account ${code} not found`);
  }
  const difference = Math.abs(account.balance - expectedBalance);
  if (difference > tolerance) {
    throw new Error(
      `Account ${code} balance mismatch. Expected: ${expectedBalance}, Actual: ${account.balance}, Difference: ${difference}`
    );
  }
  return account.balance;
}

async function getSupplierBalance(supplierId) {
  return await balanceService.calculateSupplierBalance(supplierId, testTenant.id);
}

async function getProductQuantity(productName) {
  const product = await prisma.product.findFirst({
    where: { name: productName, tenantId: testTenant.id }
  });
  return product ? product.currentQuantity : 0;
}

// Helper to get payment account (Cash or Bank)
async function getPaymentAccount(subType = 'CASH', tenantId = testTenant.id) {
  let account = await prisma.account.findFirst({
    where: {
      tenantId,
      type: 'ASSET',
      accountSubType: subType
    }
  });

  if (!account) {
    // Create default account if not exists
    const code = subType === 'CASH' ? '1000' : '1100';
    const name = subType === 'CASH' ? 'Cash' : 'Bank Account';
    account = await accountingService.getOrCreateAccount({
      code,
      name,
      type: 'ASSET',
      accountSubType: subType,
      tenantId,
      balance: 0
    });
  }

  return account;
}

// Setup
async function setup() {
  log('Setting up test environment...');
  
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash('testpassword123', 10);
  testUser = await prisma.user.create({
    data: {
      email: `${TEST_PREFIX}@test.com`,
      password: hashedPassword,
      name: 'Test User',
      role: 'BUSINESS_OWNER'
    }
  });

  testTenant = await prisma.tenant.create({
    data: {
      businessName: `${TEST_PREFIX} Business`,
      contactPerson: 'Test Contact',
      whatsappNumber: '1234567890',
      businessType: 'RETAIL',
      businessCode: TEST_PREFIX,
      ownerId: testUser.id
    }
  });

  await accountingService.initializeChartOfAccounts(testTenant.id);
  log(`Test tenant created: ${testTenant.id}`, 'success');
}

// Cleanup
async function cleanup() {
  log('Cleaning up test data...');
  try {
    await prisma.transactionLine.deleteMany({ 
      where: { transaction: { tenantId: testTenant.id } } 
    });
    await prisma.transaction.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.payment.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.purchaseItem.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.purchaseInvoice.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.supplier.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.product.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.account.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.tenant.delete({ where: { id: testTenant.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
    log('Test data cleaned up', 'success');
  } catch (error) {
    log(`Error cleaning up: ${error.message}`, 'error');
  }
}

// Test Cases
async function testCase1_SupplierWithAdvance() {
  log('\n=== Test Case 1: Supplier Creation with Advance Payment ===');
  
  const supplier = await prisma.supplier.create({
    data: {
      name: 'Supplier A - Advance',
      tenantId: testTenant.id,
      balance: -10000
    }
  });
  supplierAId = supplier.id;

  const openingBalanceAccount = await accountingService.getAccountByCode('3001', testTenant.id);
  const supplierAdvanceAccount = await accountingService.getAccountByCode('1220', testTenant.id) ||
    await accountingService.getOrCreateAccount({
      code: '1220',
      name: 'Supplier Advance Balance',
      type: 'LIABILITY',
      tenantId: testTenant.id,
      balance: 0
    });

  await accountingService.createTransaction(
    {
      transactionNumber: `TXN-SUP-${Date.now()}`,
      date: new Date(),
      description: `Supplier Creation: Supplier A - Advance (Advance: Rs. 10,000)`,
      tenantId: testTenant.id
    },
    [
      { accountId: openingBalanceAccount.id, debitAmount: 10000, creditAmount: 0 },
      { accountId: supplierAdvanceAccount.id, debitAmount: 0, creditAmount: 10000 }
    ]
  );

  await verifyAccountBalance('1220', 10000);
  await verifyAccountBalance('3001', -10000);
  
  const supplierBalance = await getSupplierBalance(supplierAId);
  assert(supplierBalance.pending < 0, 'Supplier balance should be negative (advance)');
  assert(Math.abs(supplierBalance.pending) === 10000, 'Supplier advance should be Rs. 10,000');
  
  return true;
}

async function testCase2_SupplierWithPending() {
  log('\n=== Test Case 2: Supplier Creation with Pending Amount ===');
  
  const supplier = await prisma.supplier.create({
    data: {
      name: 'Supplier B - Pending',
      tenantId: testTenant.id,
      balance: 15000
    }
  });
  supplierBId = supplier.id;

  const openingBalanceAccount = await accountingService.getAccountByCode('3001', testTenant.id);
  const apAccount = await accountingService.getAccountByCode('2000', testTenant.id) ||
    await accountingService.getOrCreateAccount({
      code: '2000',
      name: 'Accounts Payable',
      type: 'LIABILITY',
      tenantId: testTenant.id,
      balance: 0
    });

  await accountingService.createTransaction(
    {
      transactionNumber: `TXN-SUP-${Date.now()}`,
      date: new Date(),
      description: `Supplier Creation: Supplier B - Pending (Pending: Rs. 15,000)`,
      tenantId: testTenant.id
    },
    [
      { accountId: openingBalanceAccount.id, debitAmount: 15000, creditAmount: 0 },
      { accountId: apAccount.id, debitAmount: 0, creditAmount: 15000 }
    ]
  );

  await verifyAccountBalance('2000', 15000);
  await verifyAccountBalance('3001', -25000);
  
  const supplierBalance = await getSupplierBalance(supplierBId);
  assert(supplierBalance.pending > 0, 'Supplier balance should be positive (pending)');
  assert(supplierBalance.pending === 15000, 'Supplier pending should be Rs. 15,000');
  
  return true;
}

async function testCase3_EditSupplierAdvanceToPending() {
  log('\n=== Test Case 3: Edit Supplier - Change from Advance to Pending ===');
  
  // Get current balances
  const oldBalance = await getSupplierBalance(supplierAId);
  const oldAdvanceBalance = await accountingService.getAccountByCode('1220', testTenant.id);
  const oldAPBalance = await accountingService.getAccountByCode('2000', testTenant.id);
  const oldOpeningBalance = await accountingService.getAccountByCode('3001', testTenant.id);

  // Update supplier
  await prisma.supplier.update({
    where: { id: supplierAId },
    data: { balance: 5000 }
  });

  // Create adjustment transaction
  const supplierAdvanceAccount = await accountingService.getAccountByCode('1220', testTenant.id);
  const apAccount = await accountingService.getAccountByCode('2000', testTenant.id);
  const openingBalanceAccount = await accountingService.getAccountByCode('3001', testTenant.id);

  // Reverse old entry
  await accountingService.createTransaction(
    {
      transactionNumber: `TXN-ADJ-REV-${Date.now()}`,
      date: new Date(),
      description: `Supplier Edit: Reverse Advance (Rs. 10,000)`,
      tenantId: testTenant.id
    },
    [
      { accountId: supplierAdvanceAccount.id, debitAmount: 10000, creditAmount: 0 },
      { accountId: openingBalanceAccount.id, debitAmount: 0, creditAmount: 10000 }
    ]
  );

  // Create new entry
  await accountingService.createTransaction(
    {
      transactionNumber: `TXN-ADJ-NEW-${Date.now()}`,
      date: new Date(),
      description: `Supplier Edit: New Pending (Rs. 5,000)`,
      tenantId: testTenant.id
    },
    [
      { accountId: openingBalanceAccount.id, debitAmount: 5000, creditAmount: 0 },
      { accountId: apAccount.id, debitAmount: 0, creditAmount: 5000 }
    ]
  );

  await verifyAccountBalance('1220', 0);
  await verifyAccountBalance('2000', 20000); // 15k + 5k
  await verifyAccountBalance('3001', -20000); // -25k + 10k - 5k = -20k
  
  const supplierBalance = await getSupplierBalance(supplierAId);
  assert(supplierBalance.pending > 0, 'Supplier balance should be positive (pending)');
  assert(supplierBalance.pending === 5000, 'Supplier pending should be Rs. 5,000');
  
  return true;
}

async function testCase4_PurchaseWithFullAdvance() {
  log('\n=== Test Case 4: Create Purchase Invoice - Using Full Advance ===');
  
  // Reset supplier A
  await prisma.supplier.update({
    where: { id: supplierAId },
    data: { balance: -10000 }
  });

  const invoice = await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: 'PI-001',
      invoiceDate: new Date(),
      totalAmount: 8000,
      tenantId: testTenant.id,
      supplierId: supplierAId
    }
  });
  purchaseInvoiceIds['PI-001'] = invoice.id;

  let product = await prisma.product.findFirst({
    where: { name: 'Product X', tenantId: testTenant.id }
  });

  if (!product) {
    product = await prisma.product.create({
      data: {
        name: 'Product X',
        currentQuantity: 0,
        tenantId: testTenant.id
      }
    });
  }
  productIds['Product X'] = product.id;

  await prisma.purchaseItem.create({
    data: {
      name: 'Product X',
      quantity: 10,
      purchasePrice: 800,
      purchaseInvoiceId: invoice.id,
      productId: product.id,
      tenantId: testTenant.id
    }
  });

  await prisma.product.update({
    where: { id: product.id },
    data: { currentQuantity: (product.currentQuantity || 0) + 10 }
  });

  const inventoryAccount = await accountingService.getAccountByCode('1300', testTenant.id) ||
    await accountingService.getOrCreateAccount({
      code: '1300',
      name: 'Inventory',
      type: 'ASSET',
      tenantId: testTenant.id,
      balance: 0
    });

  const advanceToSuppliersAccount = await accountingService.getAccountByCode('1230', testTenant.id) ||
    await accountingService.getOrCreateAccount({
      code: '1230',
      name: 'Advance to Suppliers',
      type: 'ASSET',
      tenantId: testTenant.id,
      balance: 0
    });

  await accountingService.createTransaction(
    {
      transactionNumber: `TXN-PI-${Date.now()}`,
      date: new Date(),
      description: `Purchase Invoice: PI-001 (Advance Used: Rs. 8,000)`,
      tenantId: testTenant.id,
      purchaseInvoiceId: invoice.id
    },
    [
      { accountId: inventoryAccount.id, debitAmount: 8000, creditAmount: 0 },
      { accountId: advanceToSuppliersAccount.id, debitAmount: 0, creditAmount: 8000 }
    ]
  );

  await prisma.payment.create({
    data: {
      paymentNumber: `PAY-${Date.now()}`,
      date: new Date(),
      type: 'SUPPLIER_PAYMENT',
      amount: 8000,
      paymentMethod: 'Advance Balance',
      tenantId: testTenant.id,
      supplierId: supplierAId,
      purchaseInvoiceId: invoice.id
    }
  });

  await prisma.supplier.update({
    where: { id: supplierAId },
    data: { balance: -2000 }
  });

  await verifyAccountBalance('1300', 8000);
  await verifyAccountBalance('1230', -8000);
  await verifyAccountBalance('1220', 0);
  await verifyAccountBalance('2000', 20000);
  
  const productQty = await getProductQuantity('Product X');
  assert(productQty === 10, 'Product X quantity should be 10');
  
  return true;
}

async function testCase5_PurchasePartialAdvanceCash() {
  log('\n=== Test Case 5: Create Purchase Invoice - Partial Advance + Cash Payment ===');
  
  // Reset supplier A to have some advance
  await prisma.supplier.update({
    where: { id: supplierAId },
    data: { balance: -2000 }
  });

  const invoice = await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: 'PI-002',
      invoiceDate: new Date(),
      totalAmount: 5000,
      tenantId: testTenant.id,
      supplierId: supplierAId
    }
  });
  purchaseInvoiceIds['PI-002'] = invoice.id;

  let product = await prisma.product.findFirst({
    where: { name: 'Product Y', tenantId: testTenant.id }
  });

  if (!product) {
    product = await prisma.product.create({
      data: {
        name: 'Product Y',
        currentQuantity: 0,
        tenantId: testTenant.id
      }
    });
  }
  productIds['Product Y'] = product.id;

  await prisma.purchaseItem.create({
    data: {
      name: 'Product Y',
      quantity: 5,
      purchasePrice: 1000,
      purchaseInvoiceId: invoice.id,
      productId: product.id,
      tenantId: testTenant.id
    }
  });

  await prisma.product.update({
    where: { id: product.id },
    data: { currentQuantity: (product.currentQuantity || 0) + 5 }
  });

  const inventoryAccount = await accountingService.getAccountByCode('1300', testTenant.id);
  const advanceToSuppliersAccount = await accountingService.getAccountByCode('1230', testTenant.id);
  const cashAccount = await getPaymentAccount('CASH');

  const advanceUsed = 2000;
  const cashPaid = 3000;

  // Purchase transaction
  await accountingService.createTransaction(
    {
      transactionNumber: `TXN-PI-${Date.now()}`,
      date: new Date(),
      description: `Purchase Invoice: PI-002 (Advance: Rs. ${advanceUsed}, Cash: Rs. ${cashPaid})`,
      tenantId: testTenant.id,
      purchaseInvoiceId: invoice.id
    },
    [
      { accountId: inventoryAccount.id, debitAmount: 5000, creditAmount: 0 },
      { accountId: advanceToSuppliersAccount.id, debitAmount: 0, creditAmount: advanceUsed },
      { accountId: cashAccount.id, debitAmount: 0, creditAmount: cashPaid }
    ]
  );

  // Payment records
  await prisma.payment.create({
    data: {
      paymentNumber: `PAY-ADV-${Date.now()}`,
      date: new Date(),
      type: 'SUPPLIER_PAYMENT',
      amount: advanceUsed,
      paymentMethod: 'Advance Balance', // Derived field for display
      tenantId: testTenant.id,
      supplierId: supplierAId,
      purchaseInvoiceId: invoice.id
    }
  });

  await prisma.payment.create({
    data: {
      paymentNumber: `PAY-CASH-${Date.now()}`,
      date: new Date(),
      type: 'SUPPLIER_PAYMENT',
      amount: cashPaid,
      paymentMethod: 'Cash', // Derived field for display
      accountId: cashAccount.id, // Link to payment account
      tenantId: testTenant.id,
      supplierId: supplierAId,
      purchaseInvoiceId: invoice.id
    }
  });

  await prisma.supplier.update({
    where: { id: supplierAId },
    data: { balance: 0 }
  });

  await verifyAccountBalance('1300', 13000); // 8k + 5k
  await verifyAccountBalance('1230', -10000); // -8k - 2k
  // Verify cash account balance
  const cashAccountAfter = await getPaymentAccount('CASH');
  const expectedCashBalance = -3000; // Cash decreased
  const cashDifference = Math.abs(cashAccountAfter.balance - expectedCashBalance);
  assert(cashDifference < 0.01, `Cash account balance should be ${expectedCashBalance}, got ${cashAccountAfter.balance}`);
  await verifyAccountBalance('1220', 0);
  await verifyAccountBalance('2000', 20000);
  
  const productQty = await getProductQuantity('Product Y');
  assert(productQty === 5, 'Product Y quantity should be 5');
  
  return true;
}

async function testCase6_PurchaseFullCash() {
  log('\n=== Test Case 6: Create Purchase Invoice - No Advance, Full Cash Payment ===');
  
  const invoice = await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: 'PI-003',
      invoiceDate: new Date(),
      totalAmount: 12000,
      tenantId: testTenant.id,
      supplierId: supplierBId
    }
  });
  purchaseInvoiceIds['PI-003'] = invoice.id;

  let product = await prisma.product.findFirst({
    where: { name: 'Product Z', tenantId: testTenant.id }
  });

  if (!product) {
    product = await prisma.product.create({
      data: {
        name: 'Product Z',
        currentQuantity: 0,
        tenantId: testTenant.id
      }
    });
  }
  productIds['Product Z'] = product.id;

  await prisma.purchaseItem.create({
    data: {
      name: 'Product Z',
      quantity: 20,
      purchasePrice: 600,
      purchaseInvoiceId: invoice.id,
      productId: product.id,
      tenantId: testTenant.id
    }
  });

  await prisma.product.update({
    where: { id: product.id },
    data: { currentQuantity: (product.currentQuantity || 0) + 20 }
  });

  const inventoryAccount = await accountingService.getAccountByCode('1300', testTenant.id);
  const cashAccount = await getPaymentAccount('CASH');
  const apAccount = await accountingService.getAccountByCode('2000', testTenant.id);

  // Purchase transaction
  await accountingService.createTransaction(
    {
      transactionNumber: `TXN-PI-${Date.now()}`,
      date: new Date(),
      description: `Purchase Invoice: PI-003 (Cash: Rs. 12,000)`,
      tenantId: testTenant.id,
      purchaseInvoiceId: invoice.id
    },
    [
      { accountId: inventoryAccount.id, debitAmount: 12000, creditAmount: 0 },
      { accountId: apAccount.id, debitAmount: 0, creditAmount: 12000 }
    ]
  );

  // Payment transaction
  await accountingService.createTransaction(
    {
      transactionNumber: `TXN-PAY-${Date.now()}`,
      date: new Date(),
      description: `Payment: PI-003 (Cash: Rs. 12,000)`,
      tenantId: testTenant.id,
      purchaseInvoiceId: invoice.id
    },
    [
      { accountId: apAccount.id, debitAmount: 12000, creditAmount: 0 },
      { accountId: cashAccount.id, debitAmount: 0, creditAmount: 12000 }
    ]
  );

  await prisma.payment.create({
    data: {
      paymentNumber: `PAY-${Date.now()}`,
      date: new Date(),
      type: 'SUPPLIER_PAYMENT',
      amount: 12000,
      paymentMethod: 'Cash', // Derived field for display
      accountId: cashAccount.id, // Link to payment account
      tenantId: testTenant.id,
      supplierId: supplierBId,
      purchaseInvoiceId: invoice.id
    }
  });

  await verifyAccountBalance('1300', 25000); // 13k + 12k
  await verifyAccountBalance('2000', 20000); // 20k + 12k - 12k
  // Verify cash account balance
  const cashAccountAfter = await getPaymentAccount('CASH');
  const expectedCashBalance = -15000; // -3k - 12k
  const cashDifference = Math.abs(cashAccountAfter.balance - expectedCashBalance);
  assert(cashDifference < 0.01, `Cash account balance should be ${expectedCashBalance}, got ${cashAccountAfter.balance}`);
  
  const productQty = await getProductQuantity('Product Z');
  assert(productQty === 20, 'Product Z quantity should be 20');
  
  return true;
}

async function testCase7_PurchaseUnpaid() {
  log('\n=== Test Case 7: Create Purchase Invoice - No Payment (Unpaid) ===');
  
  const invoice = await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: 'PI-004',
      invoiceDate: new Date(),
      totalAmount: 7000,
      tenantId: testTenant.id,
      supplierId: supplierBId
    }
  });
  purchaseInvoiceIds['PI-004'] = invoice.id;

  let product = await prisma.product.findFirst({
    where: { name: 'Product W', tenantId: testTenant.id }
  });

  if (!product) {
    product = await prisma.product.create({
      data: {
        name: 'Product W',
        currentQuantity: 0,
        tenantId: testTenant.id
      }
    });
  }
  productIds['Product W'] = product.id;

  await prisma.purchaseItem.create({
    data: {
      name: 'Product W',
      quantity: 7,
      purchasePrice: 1000,
      purchaseInvoiceId: invoice.id,
      productId: product.id,
      tenantId: testTenant.id
    }
  });

  await prisma.product.update({
    where: { id: product.id },
    data: { currentQuantity: (product.currentQuantity || 0) + 7 }
  });

  const inventoryAccount = await accountingService.getAccountByCode('1300', testTenant.id);
  const apAccount = await accountingService.getAccountByCode('2000', testTenant.id);

  await accountingService.createTransaction(
    {
      transactionNumber: `TXN-PI-${Date.now()}`,
      date: new Date(),
      description: `Purchase Invoice: PI-004 (Unpaid)`,
      tenantId: testTenant.id,
      purchaseInvoiceId: invoice.id
    },
    [
      { accountId: inventoryAccount.id, debitAmount: 7000, creditAmount: 0 },
      { accountId: apAccount.id, debitAmount: 0, creditAmount: 7000 }
    ]
  );

  await verifyAccountBalance('1300', 32000); // 25k + 7k
  await verifyAccountBalance('2000', 27000); // 20k + 7k
  
  const payments = await prisma.payment.findMany({
    where: { purchaseInvoiceId: invoice.id, tenantId: testTenant.id }
  });
  assert(payments.length === 0, 'No payment records should be created for unpaid invoice');
  
  return true;
}

async function testCase8_MakePaymentFromPurchaseCard() {
  log('\n=== Test Case 8: Make Payment from Purchase Card ===');
  
  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { invoiceNumber: 'PI-004', tenantId: testTenant.id }
  });

  const bankAccount = await getPaymentAccount('BANK');

  const apAccount = await accountingService.getAccountByCode('2000', testTenant.id);

  await accountingService.createTransaction(
    {
      transactionNumber: `TXN-PAY-${Date.now()}`,
      date: new Date(),
      description: `Payment: PI-004 (Bank Transfer: Rs. 7,000)`,
      tenantId: testTenant.id,
      purchaseInvoiceId: invoice.id
    },
    [
      { accountId: apAccount.id, debitAmount: 7000, creditAmount: 0 },
      { accountId: bankAccount.id, debitAmount: 0, creditAmount: 7000 }
    ]
  );

  await prisma.payment.create({
    data: {
      paymentNumber: `PAY-${Date.now()}`,
      date: new Date(),
      type: 'SUPPLIER_PAYMENT',
      amount: 7000,
      paymentMethod: 'Bank Transfer', // Derived field for display
      accountId: bankAccount.id, // Link to payment account
      tenantId: testTenant.id,
      supplierId: supplierBId,
      purchaseInvoiceId: invoice.id
    }
  });

  await verifyAccountBalance('2000', 20000); // 27k - 7k
  // Verify bank account balance (using account ID instead of code)
  const bankAccountAfter = await getPaymentAccount('BANK');
  const expectedBankBalance = -7000; // Bank decreased
  const bankDifference = Math.abs(bankAccountAfter.balance - expectedBankBalance);
  assert(bankDifference < 0.01, `Bank account balance should be ${expectedBankBalance}, got ${bankAccountAfter.balance}`);
  
  // Verify payment record
  const payments = await prisma.payment.findMany({
    where: { purchaseInvoiceId: invoice.id, tenantId: testTenant.id },
    include: { account: true }
  });
  assert(payments.length === 1, 'Payment record should be created');
  assert(payments[0].accountId === bankAccount.id, 'Payment should be linked to bank account');
  assert(payments[0].account?.accountSubType === 'BANK', 'Payment account should be BANK type');
  assert(payments[0].amount === 7000, 'Payment amount should be Rs. 7,000');
  
  return true;
}

async function testCase9_EditPurchaseIncreaseAmount() {
  log('\n=== Test Case 9: Edit Purchase Invoice - Increase Amount ===');
  
  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { invoiceNumber: 'PI-001', tenantId: testTenant.id }
  });

  // Get balances before adjustment
  const inventoryBefore = await accountingService.getAccountByCode('1300', testTenant.id);
  const apBefore = await accountingService.getAccountByCode('2000', testTenant.id);
  
  const oldAmount = invoice.totalAmount;
  const newAmount = 10000;
  const amountDifference = newAmount - oldAmount;

  await prisma.purchaseInvoice.update({
    where: { id: invoice.id },
    data: { totalAmount: newAmount }
  });

  const inventoryAccount = await accountingService.getAccountByCode('1300', testTenant.id);
  const apAccount = await accountingService.getAccountByCode('2000', testTenant.id);

  await accountingService.createTransaction(
    {
      transactionNumber: `TXN-ADJ-${Date.now()}`,
      date: new Date(),
      description: `Purchase Invoice Adjustment: PI-001 (Increase: Rs. ${amountDifference})`,
      tenantId: testTenant.id,
      purchaseInvoiceId: invoice.id
    },
    [
      { accountId: inventoryAccount.id, debitAmount: amountDifference, creditAmount: 0 },
      { accountId: apAccount.id, debitAmount: 0, creditAmount: amountDifference }
    ]
  );

  // Verify balances after adjustment
  const expectedInventory = inventoryBefore.balance + amountDifference;
  await verifyAccountBalance('1300', expectedInventory);
  
  const expectedAP = apBefore.balance + amountDifference;
  await verifyAccountBalance('2000', expectedAP);
  
  // Verify adjustment transaction exists
  const transactions = await prisma.transaction.findMany({
    where: { 
      purchaseInvoiceId: invoice.id, 
      tenantId: testTenant.id,
      description: { contains: 'Adjustment' }
    }
  });
  assert(transactions.length > 0, 'Adjustment transaction should be created');
  assert(amountDifference > 0, 'Amount difference should be positive for increase');
  
  return true;
}

async function testCase10_EditPurchaseDecreaseAmount() {
  log('\n=== Test Case 10: Edit Purchase Invoice - Decrease Amount ===');
  
  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { invoiceNumber: 'PI-002', tenantId: testTenant.id }
  });

  // Get balances before adjustment
  const inventoryBefore = await accountingService.getAccountByCode('1300', testTenant.id);
  const apBefore = await accountingService.getAccountByCode('2000', testTenant.id);
  
  const oldAmount = invoice.totalAmount;
  const newAmount = 4000;
  const amountDifference = newAmount - oldAmount; // -1000

  await prisma.purchaseInvoice.update({
    where: { id: invoice.id },
    data: { totalAmount: newAmount }
  });

  const inventoryAccount = await accountingService.getAccountByCode('1300', testTenant.id);
  const apAccount = await accountingService.getAccountByCode('2000', testTenant.id);

  await accountingService.createTransaction(
    {
      transactionNumber: `TXN-ADJ-${Date.now()}`,
      date: new Date(),
      description: `Purchase Invoice Adjustment: PI-002 (Decrease: Rs. ${Math.abs(amountDifference)})`,
      tenantId: testTenant.id,
      purchaseInvoiceId: invoice.id
    },
    [
      { accountId: inventoryAccount.id, debitAmount: 0, creditAmount: Math.abs(amountDifference) },
      { accountId: apAccount.id, debitAmount: Math.abs(amountDifference), creditAmount: 0 }
    ]
  );

  // Verify balances after adjustment (amountDifference is negative)
  const expectedInventory = inventoryBefore.balance + amountDifference;
  await verifyAccountBalance('1300', expectedInventory);
  
  const expectedAP = apBefore.balance + amountDifference;
  await verifyAccountBalance('2000', expectedAP);
  
  // Verify adjustment transaction exists
  const transactions = await prisma.transaction.findMany({
    where: { 
      purchaseInvoiceId: invoice.id, 
      tenantId: testTenant.id,
      description: { contains: 'Adjustment' }
    }
  });
  assert(transactions.length > 0, 'Adjustment transaction should be created');
  assert(amountDifference < 0, 'Amount difference should be negative for decrease');
  
  return true;
}

async function testCase15_ProductBalanceVerification() {
  log('\n=== Test Case 15: Product Balance Verification ===');
  
  const initialQty = await getProductQuantity('Product X');
  
  const invoice = await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: 'PI-007',
      invoiceDate: new Date(),
      totalAmount: 5000,
      tenantId: testTenant.id,
      supplierId: supplierBId
    }
  });

  const product = await prisma.product.findFirst({
    where: { name: 'Product X', tenantId: testTenant.id }
  });

  await prisma.purchaseItem.create({
    data: {
      name: 'Product X',
      quantity: 5,
      purchasePrice: 1000,
      purchaseInvoiceId: invoice.id,
      productId: product.id,
      tenantId: testTenant.id
    }
  });

  await prisma.product.update({
    where: { id: product.id },
    data: { currentQuantity: (product.currentQuantity || 0) + 5 }
  });

  const newQty = await getProductQuantity('Product X');
  assert(newQty === initialQty + 5, `Product X quantity should increase by 5 (from ${initialQty} to ${newQty})`);
  
  return true;
}

// Main test runner
async function runAllTests() {
  try {
    await setup();
    
    log('\n' + '='.repeat(60));
    log('STARTING COMPREHENSIVE TEST SUITE');
    log('='.repeat(60));
    
    await testCase1_SupplierWithAdvance();
    await testCase2_SupplierWithPending();
    await testCase3_EditSupplierAdvanceToPending();
    await testCase4_PurchaseWithFullAdvance();
    await testCase5_PurchasePartialAdvanceCash();
    await testCase6_PurchaseFullCash();
    await testCase7_PurchaseUnpaid();
    await testCase8_MakePaymentFromPurchaseCard();
    await testCase9_EditPurchaseIncreaseAmount();
    await testCase10_EditPurchaseDecreaseAmount();
    await testCase15_ProductBalanceVerification();
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed.length} ✅`);
    console.log(`Failed: ${testResults.failed.length} ❌`);
    console.log(`Success Rate: ${((testResults.passed.length / testResults.total) * 100).toFixed(1)}%`);
    
    if (testResults.failed.length > 0) {
      console.log('\nFailed Tests:');
      testResults.failed.forEach(fail => console.log(`  ❌ ${fail}`));
    }
    
    if (testResults.passed.length > 0) {
      console.log('\nPassed Tests:');
      testResults.passed.forEach(pass => console.log(`  ✅ ${pass}`));
    }
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    log(`Test execution error: ${error.message}`, 'error');
    console.error(error.stack);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

// Run tests
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };

