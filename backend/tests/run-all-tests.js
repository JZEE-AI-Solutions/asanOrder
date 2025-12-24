/**
 * Comprehensive Test Suite for Supplier, Purchase, Payment & Accounting Integration
 * 
 * This script tests all scenarios from TESTING_SUPPLIER_PURCHASE_PAYMENT_ACCOUNTING.md
 * Run with: node tests/run-all-tests.js
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

// Setup
async function setup() {
  log('Setting up test environment...');
  
  // Create test user
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

  // Create test tenant
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

  // Initialize chart of accounts
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

  // Create accounting entry
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

  const balance1220 = await verifyAccountBalance('1220', 10000);
  const balance3001 = await verifyAccountBalance('3001', -10000);
  
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

  const product = await prisma.product.create({
    data: {
      name: 'Product X',
      currentQuantity: 0,
      tenantId: testTenant.id
    }
  });

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
    data: { currentQuantity: 10 }
  });

  // Create accounting transactions
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

  // Purchase transaction - single balanced transaction
  // Debit Inventory, Credit Advance to Suppliers (using advance we paid them)
  // No AP because fully paid with advance
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
      { accountId: advanceToSuppliersAccount.id, debitAmount: 0, creditAmount: 8000 } // Credit asset (using advance)
    ]
  );

  // Payment record
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
  await verifyAccountBalance('1230', -8000); // Advance to Suppliers (asset, credit decreases it)
  await verifyAccountBalance('1220', 10000); // Supplier Advance Balance unchanged (this is for advance received)
  await verifyAccountBalance('2000', 15000); // AP unchanged (fully paid with advance, no AP entry)
  
  const productQty = await getProductQuantity('Product X');
  assert(productQty === 10, 'Product X quantity should be 10');
  
  return true;
}

// Main test runner
async function runAllTests() {
  try {
    await setup();
    
    await testCase1_SupplierWithAdvance();
    await testCase2_SupplierWithPending();
    await testCase4_PurchaseWithFullAdvance();
    
    // Add more test cases here...
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed.length} ✅`);
    console.log(`Failed: ${testResults.failed.length} ❌`);
    
    if (testResults.failed.length > 0) {
      console.log('\nFailed Tests:');
      testResults.failed.forEach(fail => console.log(`  - ${fail}`));
    }
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    log(`Test execution error: ${error.message}`, 'error');
    console.error(error);
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

