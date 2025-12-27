const prisma = require('../../lib/db');
const accountingService = require('../../services/accountingService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * Create a test tenant and user
 */
async function createTestTenant() {
  // Create test user
  const hashedPassword = await bcrypt.hash('testpassword123', 10);
  const user = await prisma.user.create({
    data: {
      email: `test-${Date.now()}@test.com`,
      password: hashedPassword,
      name: 'Test User',
      role: 'BUSINESS_OWNER'
    }
  });

  // Create test tenant
  const tenant = await prisma.tenant.create({
    data: {
      businessName: `Test Business ${Date.now()}`,
      contactPerson: 'Test Contact',
      whatsappNumber: '1234567890',
      businessType: 'RETAIL',
      businessCode: `TEST-${Date.now()}`,
      ownerId: user.id
    }
  });

  // Update user to link tenant (if needed by schema)
  await prisma.user.update({
    where: { id: user.id },
    data: { tenantId: tenant.id }
  }).catch(() => {
    // If tenantId doesn't exist in User model, that's fine
  });

  // Initialize chart of accounts
  await accountingService.initializeChartOfAccounts(tenant.id);

  // Reload user with tenant
  const userWithTenant = await prisma.user.findUnique({
    where: { id: user.id },
    include: { tenant: true }
  });

  return { user: userWithTenant || user, tenant };
}

/**
 * Generate JWT token for test user
 */
function generateTestToken(user, tenant) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenant: {
        id: tenant.id,
        businessName: tenant.businessName
      }
    },
    process.env.JWT_SECRET || 'test-secret-key',
    { expiresIn: '24h' }
  );
}

// Global test user/tenant for app
let globalTestUser = null;
let globalTestTenant = null;

/**
 * Set global test user/tenant for app
 */
function setTestAuth(user, tenant) {
  globalTestUser = user;
  globalTestTenant = tenant;
}

/**
 * Create a test app with routes and mock auth
 */
function createTestApp() {
  const express = require('express');
  const app = express();
  app.use(express.json());

  // Mock authentication middleware for tests
  // This function checks globals dynamically on each request (not captured in closure)
  const mockAuth = (req, res, next) => {
    // Always check current global values (not captured)
    const currentUser = globalTestUser;
    const currentTenant = globalTestTenant;
    
    if (currentUser && currentTenant) {
      req.user = {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
        role: currentUser.role,
        tenant: currentTenant
      };
      return next();
    }
    console.error('Test auth failed:', {
      hasUser: !!currentUser,
      hasTenant: !!currentTenant,
      userId: currentUser?.id,
      tenantId: currentTenant?.id
    });
    return res.status(401).json({ error: 'Test authentication required' });
  };

  // Import routes
  const supplierRoutes = require('../../routes/accounting/suppliers');
  const purchaseInvoiceRoutes = require('../../routes/purchaseInvoice');
  const paymentRoutes = require('../../routes/accounting/payments');

  // Mount routes with mock auth
  app.use('/accounting/suppliers', mockAuth, supplierRoutes);
  app.use('/purchase-invoice', mockAuth, purchaseInvoiceRoutes);
  app.use('/accounting/payments', mockAuth, paymentRoutes);

  return app;
}

/**
 * Clean up test data
 */
async function cleanupTestData(tenantId) {
  try {
    // Delete in order to respect foreign key constraints
    await prisma.transactionLine.deleteMany({ where: { transaction: { tenantId } } });
    await prisma.transaction.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.returnItem.deleteMany({ where: { return: { tenantId } } });
    await prisma.return.deleteMany({ where: { tenantId } });
    await prisma.purchaseItem.deleteMany({ where: { tenantId } });
    await prisma.purchaseInvoice.deleteMany({ where: { tenantId } });
    await prisma.supplier.deleteMany({ where: { tenantId } });
    await prisma.productLog.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.account.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
}

/**
 * Get account by code
 */
async function getAccountByCode(code, tenantId) {
  return await accountingService.getAccountByCode(code, tenantId);
}

/**
 * Verify account balance
 */
async function verifyAccountBalance(code, tenantId, expectedBalance) {
  const account = await getAccountByCode(code, tenantId);
  if (!account) {
    throw new Error(`Account ${code} not found`);
  }
  const tolerance = 0.01;
  const difference = Math.abs(account.balance - expectedBalance);
  if (difference > tolerance) {
    throw new Error(
      `Account ${code} balance mismatch. Expected: ${expectedBalance}, Actual: ${account.balance}, Difference: ${difference}`
    );
  }
  return true;
}

/**
 * Get supplier balance
 */
async function getSupplierBalance(supplierId, tenantId) {
  const balanceService = require('../../services/balanceService');
  return await balanceService.calculateSupplierBalance(supplierId, tenantId);
}

/**
 * Get product quantity
 */
async function getProductQuantity(productName, tenantId) {
  const product = await prisma.product.findFirst({
    where: {
      name: productName,
      tenantId: tenantId
    }
  });
  return product ? product.currentQuantity : 0;
}

/**
 * Get payment account (Cash or Bank)
 */
async function getPaymentAccount(subType = 'CASH', tenantId) {
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

module.exports = {
  createTestTenant,
  generateTestToken,
  cleanupTestData,
  getAccountByCode,
  verifyAccountBalance,
  getSupplierBalance,
  getProductQuantity,
  getPaymentAccount,
  createTestApp,
  setTestAuth
};

