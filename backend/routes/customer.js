const express = require('express');
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const customerService = require('../services/customerService');
const accountingService = require('../services/accountingService');
const balanceService = require('../services/balanceService');

const router = express.Router();

// Get all customers for a tenant (Business Owner only)
router.get('/', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      sortBy = 'lastOrderDate', 
      sortOrder = 'desc',
      hasPendingPayment = false
    } = req.query;

    const result = await customerService.getCustomersByTenant(tenant.id, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      sortBy,
      sortOrder,
      hasPendingPayment: hasPendingPayment === 'true' || hasPendingPayment === true
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Failed to get customers' });
  }
});

// Create new customer (Business Owner only)
router.post('/', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('phoneNumber').trim().isLength({ min: 10 }).withMessage('Phone number must be at least 10 characters'),
  body('email').optional().custom((value) => {
    if (value && value.trim() !== '') {
      return validator.isEmail(value);
    }
    return true;
  }),
  body('address').optional().trim(),
  body('shippingAddress').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('country').optional().trim(),
  body('postalCode').optional().trim(),
  body('notes').optional().trim(),
  body('balance').optional().isFloat().withMessage('Balance must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const customerData = req.body;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if phone number already exists
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        phoneNumber: customerData.phoneNumber,
        tenantId: tenant.id
      }
    });

    if (existingCustomer) {
      return res.status(400).json({ 
        error: 'Phone number already exists for another customer' 
      });
    }

    // Extract balance if provided
    const balanceAmount = customerData.balance ? parseFloat(customerData.balance) : 0;
    const { balance, ...customerDataWithoutBalance } = customerData;

    // Create customer
    const customer = await prisma.customer.create({
      data: {
        ...customerDataWithoutBalance,
        tenantId: tenant.id,
        totalOrders: 0,
        totalSpent: 0,
        isActive: true,
        advanceBalance: balanceAmount < 0 ? Math.abs(balanceAmount) : 0
      }
    });

    // Create accounting entry if balance is provided
    if (balanceAmount !== 0) {
      try {
        // Get or create Opening Balance equity account
        const openingBalanceAccount = await accountingService.getAccountByCode('3001', tenant.id) ||
          await accountingService.getOrCreateAccount({
            code: '3001',
            name: 'Opening Balance',
            type: 'EQUITY',
            tenantId: tenant.id,
            balance: 0
          });

        const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}-CUST-OB`;
        const transactionLines = [];

        if (balanceAmount < 0) {
          // Negative balance = Customer advance (they paid us)
          // Debit Customer Advance Balance (ASSET - money we received)
          // Credit Opening Balance
          const customerAdvanceAccount = await accountingService.getAccountByCode('1210', tenant.id) ||
            await accountingService.getOrCreateAccount({
              code: '1210',
              name: 'Customer Advance Balance',
              type: 'ASSET',
              tenantId: tenant.id,
              balance: 0
            });

          transactionLines.push(
            {
              accountId: customerAdvanceAccount.id,
              debitAmount: Math.abs(balanceAmount), // Debit increases asset
              creditAmount: 0
            },
            {
              accountId: openingBalanceAccount.id,
              debitAmount: 0,
              creditAmount: Math.abs(balanceAmount)
            }
          );
        } else {
          // Positive balance = Customer owes us (Accounts Receivable)
          // Debit Accounts Receivable (ASSET - money owed to us)
          // Credit Opening Balance
          const arAccount = await accountingService.getAccountByCode('1200', tenant.id) ||
            await accountingService.getOrCreateAccount({
              code: '1200',
              name: 'Accounts Receivable',
              type: 'ASSET',
              tenantId: tenant.id,
              balance: 0
            });

          transactionLines.push(
            {
              accountId: arAccount.id,
              debitAmount: balanceAmount, // Debit increases asset
              creditAmount: 0
            },
            {
              accountId: openingBalanceAccount.id,
              debitAmount: 0,
              creditAmount: balanceAmount
            }
          );
        }

        await accountingService.createTransaction({
          transactionNumber,
          date: new Date(),
          description: `Customer Opening Balance - ${customerData.name || customerData.phoneNumber}`,
          tenantId: tenant.id
        }, transactionLines);
      } catch (accountingError) {
        console.error('Error creating accounting entry for customer opening balance:', accountingError);
        // Don't fail customer creation if accounting entry fails
        // The balance is still stored in customer.advanceBalance and will be used in calculations
      }
    }

    // Log the creation
    await customerService.logCustomerAction(
      customer.id,
      'CREATED',
      null,
      null,
      null,
      'Customer created manually'
    );

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      customer
    });

  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Get customer by ID (Business Owner only)
router.get('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const customer = await customerService.getCustomerById(id, tenant.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({
      success: true,
      customer
    });

  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Failed to get customer' });
  }
});

// Update customer (Business Owner only)
router.put('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('name').optional().trim(),
  body('email').optional().custom((value) => {
    if (value && value.trim() !== '') {
      return validator.isEmail(value);
    }
    return true;
  }),
  body('phoneNumber').optional().trim(),
  body('address').optional().trim(),
  body('shippingAddress').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('country').optional().trim(),
  body('postalCode').optional().trim(),
  body('notes').optional().trim(),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if phone number is being updated and if it's unique
    if (updateData.phoneNumber) {
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          phoneNumber: updateData.phoneNumber,
          tenantId: tenant.id,
          id: { not: id }
        }
      });

      if (existingCustomer) {
        return res.status(400).json({ 
          error: 'Phone number already exists for another customer' 
        });
      }
    }

    const customer = await customerService.updateCustomer(id, tenant.id, updateData);

    res.json({
      success: true,
      message: 'Customer updated successfully',
      customer
    });

  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Delete customer (soft delete) (Business Owner only)
router.delete('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: tenant.id }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Soft delete customer
    const deletedCustomer = await prisma.customer.update({
      where: { id },
      data: { isActive: false }
    });

    // Log the deletion
    await customerService.logCustomerAction(
      id,
      'DELETED',
      null,
      null,
      null,
      'Customer soft deleted'
    );

    res.json({
      success: true,
      message: 'Customer deleted successfully',
      customer: deletedCustomer
    });

  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Restore customer (Business Owner only)
router.patch('/:id/restore', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: tenant.id }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Restore customer
    const restoredCustomer = await prisma.customer.update({
      where: { id },
      data: { isActive: true }
    });

    // Log the restoration
    await customerService.logCustomerAction(
      id,
      'RESTORED',
      null,
      null,
      null,
      'Customer restored'
    );

    res.json({
      success: true,
      message: 'Customer restored successfully',
      customer: restoredCustomer
    });

  } catch (error) {
    console.error('Restore customer error:', error);
    res.status(500).json({ error: 'Failed to restore customer' });
  }
});

// Bulk update customers (Business Owner only)
router.patch('/bulk/update', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('customerIds').isArray({ min: 1 }).withMessage('Customer IDs must be an array with at least one item'),
  body('updateData').isObject().withMessage('Update data must be an object'),
  body('updateData.isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { customerIds, updateData } = req.body;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify all customers belong to tenant
    const customers = await prisma.customer.findMany({
      where: {
        id: { in: customerIds },
        tenantId: tenant.id
      }
    });

    if (customers.length !== customerIds.length) {
      return res.status(400).json({ 
        error: 'Some customers not found or do not belong to your tenant' 
      });
    }

    // Update customers
    const updateResult = await prisma.customer.updateMany({
      where: {
        id: { in: customerIds },
        tenantId: tenant.id
      },
      data: updateData
    });

    // Log bulk update for each customer
    for (const customerId of customerIds) {
      await customerService.logCustomerAction(
        customerId,
        'BULK_UPDATED',
        null,
        null,
        null,
        `Customer updated in bulk operation: ${JSON.stringify(updateData)}`
      );
    }

    res.json({
      success: true,
      message: `${updateResult.count} customers updated successfully`,
      updatedCount: updateResult.count
    });

  } catch (error) {
    console.error('Bulk update customers error:', error);
    res.status(500).json({ error: 'Failed to bulk update customers' });
  }
});

// Bulk delete customers (Business Owner only)
router.delete('/bulk/delete', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('customerIds').isArray({ min: 1 }).withMessage('Customer IDs must be an array with at least one item')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { customerIds } = req.body;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify all customers belong to tenant
    const customers = await prisma.customer.findMany({
      where: {
        id: { in: customerIds },
        tenantId: tenant.id
      }
    });

    if (customers.length !== customerIds.length) {
      return res.status(400).json({ 
        error: 'Some customers not found or do not belong to your tenant' 
      });
    }

    // Soft delete customers
    const deleteResult = await prisma.customer.updateMany({
      where: {
        id: { in: customerIds },
        tenantId: tenant.id
      },
      data: { isActive: false }
    });

    // Log bulk deletion for each customer
    for (const customerId of customerIds) {
      await customerService.logCustomerAction(
        customerId,
        'BULK_DELETED',
        null,
        null,
        null,
        'Customer deleted in bulk operation'
      );
    }

    res.json({
      success: true,
      message: `${deleteResult.count} customers deleted successfully`,
      deletedCount: deleteResult.count
    });

  } catch (error) {
    console.error('Bulk delete customers error:', error);
    res.status(500).json({ error: 'Failed to bulk delete customers' });
  }
});

// Get customer statistics (Business Owner only)
router.get('/stats/overview', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const stats = await customerService.getCustomerStats(tenant.id);

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Get customer stats error:', error);
    res.status(500).json({ error: 'Failed to get customer statistics' });
  }
});

// Get customer logs (Business Owner only)
router.get('/:id/logs', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: tenant.id }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const logs = await prisma.customerLog.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });

    const total = await prisma.customerLog.count({
      where: { customerId: id }
    });

    res.json({
      success: true,
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get customer logs error:', error);
    res.status(500).json({ error: 'Failed to get customer logs' });
  }
});

// Search customers (Business Owner only)
router.get('/search/:query', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { query } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const customers = await prisma.customer.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { phoneNumber: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } }
        ]
      },
      orderBy: { lastOrderDate: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        totalOrders: true,
        totalSpent: true,
        lastOrderDate: true
      }
    });

    res.json({
      success: true,
      customers
    });

  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({ error: 'Failed to search customers' });
  }
});

// Update customer balance (Business Owner only)
router.put('/:id/balance', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('balance').isFloat().withMessage('Balance must be a number'),
  body('openingBalanceDate').optional({ nullable: true }).isISO8601().withMessage('Opening balance date must be a valid date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const tenantId = req.user.tenant.id;
    const { id } = req.params;
    const { balance, openingBalanceDate } = req.body;

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId }
    });

    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found'
      });
    }

    const oldAdvanceBalance = customer.advanceBalance || 0;
    // For customers: positive balance = customer owes us (AR), negative = advance (they paid us)
    // We store advanceBalance as positive when customer has advance
    const newBalance = parseFloat(balance);
    const newAdvanceBalance = newBalance < 0 ? Math.abs(newBalance) : 0;
    const balanceChanged = oldAdvanceBalance !== newAdvanceBalance || (newBalance > 0 && oldAdvanceBalance === 0);

    // Update customer
    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: {
        advanceBalance: newAdvanceBalance
      }
    });

    // Create accounting adjustment entry if balance changed
    if (balanceChanged) {
      try {
        // Get or create Opening Balance equity account
        const openingBalanceAccount = await accountingService.getAccountByCode('3001', tenantId) ||
          await accountingService.getOrCreateAccount({
            code: '3001',
            name: 'Opening Balance',
            type: 'EQUITY',
            tenantId,
            balance: 0
          });

        const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}-CUST-ADJ`;
        const transactionLines = [];
        
        // Use provided opening balance date or current date for adjustment
        const transactionDate = openingBalanceDate ? new Date(openingBalanceDate) : new Date();

        const customerAdvanceAccount = await accountingService.getAccountByCode('1210', tenantId) ||
          await accountingService.getOrCreateAccount({
            code: '1210',
            name: 'Customer Advance Balance',
            type: 'ASSET',
            tenantId,
            balance: 0
          });

        const arAccount = await accountingService.getAccountByCode('1200', tenantId) ||
          await accountingService.getOrCreateAccount({
            code: '1200',
            name: 'Accounts Receivable',
            type: 'ASSET',
            tenantId,
            balance: 0
          });

        // Determine balance types
        const oldIsAdvance = oldAdvanceBalance > 0; // Customer had advance (they paid us)
        const newIsAdvance = newBalance < 0; // New balance is advance (they paid us)
        const newIsPayable = newBalance > 0; // New balance is payable (they owe us)

        if (oldIsAdvance && newIsAdvance) {
          // Both are advance - adjust Customer Advance Balance
          const adjustmentAmount = Math.abs(newBalance) - oldAdvanceBalance;
          if (adjustmentAmount > 0) {
            // Increase in advance
            transactionLines.push(
              {
                accountId: customerAdvanceAccount.id,
                debitAmount: adjustmentAmount,
                creditAmount: 0
              },
              {
                accountId: openingBalanceAccount.id,
                debitAmount: 0,
                creditAmount: adjustmentAmount
              }
            );
          } else if (adjustmentAmount < 0) {
            // Decrease in advance
            transactionLines.push(
              {
                accountId: customerAdvanceAccount.id,
                debitAmount: 0,
                creditAmount: Math.abs(adjustmentAmount)
              },
              {
                accountId: openingBalanceAccount.id,
                debitAmount: Math.abs(adjustmentAmount),
                creditAmount: 0
              }
            );
          }
        } else if (!oldIsAdvance && newIsPayable) {
          // Changed from no advance to payable (Customer owes us)
          transactionLines.push(
            {
              accountId: arAccount.id,
              debitAmount: newBalance,
              creditAmount: 0
            },
            {
              accountId: openingBalanceAccount.id,
              debitAmount: 0,
              creditAmount: newBalance
            }
          );
        } else if (oldIsAdvance && newIsPayable) {
          // Changed from advance to payable
          // Reverse advance: Credit Advance, Debit Opening Balance
          // Create AR: Debit AR, Credit Opening Balance
          // Net: Credit Advance (oldAdvanceBalance), Debit AR (newBalance), Net Opening Balance
          const netOpeningBalanceChange = oldAdvanceBalance - newBalance;
          transactionLines.push(
            {
              accountId: customerAdvanceAccount.id,
              debitAmount: 0,
              creditAmount: oldAdvanceBalance
            },
            {
              accountId: arAccount.id,
              debitAmount: newBalance,
              creditAmount: 0
            },
            {
              accountId: openingBalanceAccount.id,
              debitAmount: netOpeningBalanceChange > 0 ? netOpeningBalanceChange : 0,
              creditAmount: netOpeningBalanceChange < 0 ? Math.abs(netOpeningBalanceChange) : 0
            }
          );
        } else if (!oldIsAdvance && newIsAdvance) {
          // Changed from no advance to advance
          transactionLines.push(
            {
              accountId: customerAdvanceAccount.id,
              debitAmount: Math.abs(newBalance),
              creditAmount: 0
            },
            {
              accountId: openingBalanceAccount.id,
              debitAmount: 0,
              creditAmount: Math.abs(newBalance)
            }
          );
        }

        if (transactionLines.length > 0) {
          await accountingService.createTransaction({
            transactionNumber,
            date: transactionDate,
            description: `Customer Balance Adjustment - ${customer.name || customer.phoneNumber}`,
            tenantId
          }, transactionLines);
        }
      } catch (accountingError) {
        console.error('Error creating accounting entry for customer balance adjustment:', accountingError);
        // Don't fail customer update if accounting entry fails
      }
    }

    res.json({
      success: true,
      message: 'Customer balance updated successfully',
      customer: updatedCustomer
    });
  } catch (error) {
    console.error('Error updating customer balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update customer balance'
    });
  }
});

// Get customer ledger (Business Owner only)
router.get('/:id/ledger', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { fromDate, toDate } = req.query;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: tenant.id }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Build date filter
    const dateFilter = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) dateFilter.lte = new Date(toDate);

    // Get all orders (CONFIRMED, DISPATCHED, COMPLETED - orders with potential outstanding balance)
    const orders = await prisma.order.findMany({
      where: {
        customerId: id,
        status: { in: ['CONFIRMED', 'DISPATCHED', 'COMPLETED'] },
        ...(Object.keys(dateFilter).length > 0 && {
          createdAt: dateFilter
        })
      },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        selectedProducts: true,
        productQuantities: true,
        productPrices: true,
        shippingCharges: true,
        codFee: true,
        codFeePaidBy: true,
        verifiedPaymentAmount: true,
        paymentVerified: true,
        orderItems: { select: { quantity: true, price: true } }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Fetch all payments (including those not linked to orders)
    const allPayments = await prisma.payment.findMany({
      where: {
        customerId: id,
        type: 'CUSTOMER_PAYMENT',
        ...(Object.keys(dateFilter).length > 0 && {
          date: dateFilter
        })
      },
      select: {
        id: true,
        paymentNumber: true,
        date: true,
        amount: true,
        orderId: true,
        account: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    // Fetch all returns
    const allReturns = await prisma.return.findMany({
      where: {
        order: {
          customerId: id
        },
        returnType: {
          in: ['CUSTOMER_FULL', 'CUSTOMER_PARTIAL']
        },
        ...(Object.keys(dateFilter).length > 0 && {
          returnDate: dateFilter
        })
      },
      select: {
        id: true,
        returnNumber: true,
        returnDate: true,
        totalAmount: true,
        refundAmount: true,
        status: true,
        orderId: true,
        order: {
          select: {
            orderNumber: true
          }
        }
      },
      orderBy: {
        returnDate: 'asc'
      }
    });

    // Find opening balance transaction - only show Opening Balance row when we have an explicit transaction.
    // When advance comes from customer.advanceBalance (no transaction), it's from direct payments we show as separate rows - don't double-count.
    const openingBalanceTransaction = await prisma.transaction.findFirst({
      where: {
        tenantId: tenant.id,
        description: {
          contains: `Customer Opening Balance - ${customer.name || customer.phoneNumber}`,
          mode: 'insensitive'
        }
      },
      orderBy: { date: 'asc' },
      select: { date: true }
    });

    let openingBalanceDate = customer.createdAt;
    if (openingBalanceTransaction) {
      openingBalanceDate = openingBalanceTransaction.date;
    }

    // Build ledger entries
    const ledgerEntries = [];
    const customerBalance = await balanceService.calculateCustomerBalance(id);

    // Only show Opening Balance row when we have an explicit "Customer Opening Balance" transaction.
    // Otherwise openingAdvanceBalance from customer.advanceBalance = sum of direct payments, which we show as separate rows.
    if (openingBalanceTransaction && (customerBalance.openingARBalance !== 0 || customerBalance.openingAdvanceBalance !== 0)) {
      ledgerEntries.push({
        date: openingBalanceDate,
        type: 'OPENING_BALANCE',
        description: 'Opening Balance',
        reference: null,
        debit: customerBalance.openingARBalance > 0 ? customerBalance.openingARBalance : 0,
        credit: customerBalance.openingAdvanceBalance > 0 ? customerBalance.openingAdvanceBalance : 0,
        isOpeningBalance: true
      });
    }

    // Add order entries (AR created)
    for (const order of orders) {
      // Calculate order total: prefer orderItems (variant flow), else legacy selectedProducts
      let orderTotal = 0;
      if (order.orderItems && order.orderItems.length > 0) {
        orderTotal = order.orderItems.reduce((sum, item) =>
          sum + (item.quantity || 0) * (item.price || 0), 0);
      } else {
        try {
          const selectedProducts = typeof order.selectedProducts === 'string'
            ? JSON.parse(order.selectedProducts)
            : (order.selectedProducts || []);
          const productQuantities = typeof order.productQuantities === 'string'
            ? JSON.parse(order.productQuantities)
            : (order.productQuantities || {});
          const productPrices = typeof order.productPrices === 'string'
            ? JSON.parse(order.productPrices)
            : (order.productPrices || {});

          if (Array.isArray(selectedProducts)) {
            selectedProducts.forEach(product => {
              const quantity = productQuantities[product.id] || product.quantity || 1;
              const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
              orderTotal += price * quantity;
            });
          }
        } catch (e) {
          console.error('Error parsing order data for ledger:', e);
        }
      }

      orderTotal += (order.shippingCharges || 0);
      if (order.codFeePaidBy === 'CUSTOMER' && order.codFee && order.codFee > 0) {
        orderTotal += order.codFee;
      }

      if (orderTotal > 0) {
        ledgerEntries.push({
          date: order.createdAt,
          type: 'ORDER',
          description: `Order: ${order.orderNumber}`,
          reference: order.orderNumber,
          debit: orderTotal,
          credit: 0,
          orderId: order.id
        });
      }
    }

    // Add payment entries (distinguish direct payments vs order-linked)
    for (const payment of allPayments) {
      const isDirectPayment = !payment.orderId;
      const paymentLabel = isDirectPayment ? 'Payment (without order)' : 'Payment';
      const accountSuffix = payment.account ? ` (${payment.account.name})` : '';
      ledgerEntries.push({
        date: payment.date,
        type: 'PAYMENT',
        description: `${paymentLabel}: ${payment.paymentNumber}${accountSuffix}`,
        reference: payment.paymentNumber,
        debit: 0,
        credit: payment.amount,
        paymentId: payment.id,
        orderId: payment.orderId,
        isDirectPayment
      });
    }

    // Add return entries
    for (const returnRecord of allReturns) {
      if (returnRecord.totalAmount > 0) {
        ledgerEntries.push({
          date: returnRecord.returnDate,
          type: 'RETURN',
          description: `Return: ${returnRecord.returnNumber}${returnRecord.order ? ` (Order: ${returnRecord.order.orderNumber})` : ''}`,
          reference: returnRecord.returnNumber,
          debit: 0,
          credit: returnRecord.totalAmount,
          returnId: returnRecord.id,
          orderId: returnRecord.orderId
        });
      }

      // Add refund entry if refunded
      if (returnRecord.status === 'REFUNDED' && returnRecord.refundAmount > 0) {
        ledgerEntries.push({
          date: returnRecord.returnDate,
          type: 'REFUND',
          description: `Refund: ${returnRecord.returnNumber}`,
          reference: returnRecord.returnNumber,
          debit: returnRecord.refundAmount,
          credit: 0,
          returnId: returnRecord.id
        });
      }
    }

    // Sort by date
    ledgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance.
    // When no explicit opening transaction, openingAdvanceBalance = customer.advanceBalance (= sum of direct payments).
    // Those direct payments are shown as separate rows, so we must NOT include them in the starting balance or we double-count.
    const hasExplicitOpening = !!openingBalanceTransaction;
    let runningBalance = hasExplicitOpening
      ? customerBalance.openingARBalance - customerBalance.openingAdvanceBalance
      : 0;
    const ledgerWithBalance = ledgerEntries.map(entry => {
      runningBalance = runningBalance + entry.debit - entry.credit;
      return {
        ...entry,
        balance: runningBalance
      };
    });

    res.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phoneNumber: customer.phoneNumber
      },
      ledger: ledgerWithBalance,
      summary: {
        openingARBalance: hasExplicitOpening ? customerBalance.openingARBalance : 0,
        openingAdvanceBalance: hasExplicitOpening ? customerBalance.openingAdvanceBalance : 0,
        totalOrders: orders.length,
        totalPayments: allPayments.length,
        totalReturns: allReturns.length,
        currentBalance: runningBalance
      }
    });

  } catch (error) {
    console.error('Get customer ledger error:', error);
    res.status(500).json({ error: 'Failed to get customer ledger' });
  }
});

// Get customer orders (Business Owner only)
router.get('/:id/orders', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: tenant.id }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const orders = await prisma.order.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      include: {
        form: {
          select: {
            name: true,
            formLink: true
          }
        },
        orderItems: { select: { quantity: true, price: true, productName: true } }
      }
    });

    const total = await prisma.order.count({
      where: { customerId: id }
    });

    const orderIds = orders.map((o) => o.id);
    let totalPaidByOrderId = {};
    if (orderIds.length > 0) {
      const payments = await prisma.payment.findMany({
        where: { orderId: { in: orderIds }, type: 'CUSTOMER_PAYMENT' },
        select: { orderId: true, amount: true }
      });
      for (const p of payments) {
        if (p.orderId) {
          totalPaidByOrderId[p.orderId] = (totalPaidByOrderId[p.orderId] || 0) + (p.amount || 0);
        }
      }
    }
    const ordersWithPaid = orders.map((o) => ({
      ...o,
      totalPaid: totalPaidByOrderId[o.id] ?? 0
    }));

    res.json({
      success: true,
      orders: ordersWithPaid,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get customer orders error:', error);
    res.status(500).json({ error: 'Failed to get customer orders' });
  }
});

// Export customers to CSV (Business Owner only)
router.get('/export/csv', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { search = '', includeInactive = false } = req.query;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Build where clause
    const where = {
      tenantId: tenant.id,
      ...(includeInactive === 'false' && { isActive: true }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phoneNumber: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    // Get all customers
    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        address: true,
        shippingAddress: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
        totalOrders: true,
        totalSpent: true,
        lastOrderDate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Generate CSV content
    const headers = [
      'ID', 'Name', 'Phone Number', 'Email', 'Address', 'Shipping Address',
      'City', 'State', 'Country', 'Postal Code', 'Total Orders', 'Total Spent',
      'Last Order Date', 'Status', 'Created At', 'Updated At'
    ];

    const csvRows = customers.map(customer => [
      customer.id,
      customer.name || '',
      customer.phoneNumber || '',
      customer.email || '',
      customer.address || '',
      customer.shippingAddress || '',
      customer.city || '',
      customer.state || '',
      customer.country || '',
      customer.postalCode || '',
      customer.totalOrders || 0,
      customer.totalSpent || 0,
      customer.lastOrderDate ? customer.lastOrderDate.toISOString() : '',
      customer.isActive ? 'Active' : 'Inactive',
      customer.createdAt.toISOString(),
      customer.updatedAt.toISOString()
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Set response headers
    const filename = `customers_export_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(csvContent);

  } catch (error) {
    console.error('Export customers CSV error:', error);
    res.status(500).json({ error: 'Failed to export customers' });
  }
});

// Get customer analytics (Business Owner only)
router.get('/analytics/overview', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const days = parseInt(period);

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get customer analytics
    const [
      totalCustomers,
      activeCustomers,
      newCustomers,
      topCustomers,
      customerGrowth
    ] = await Promise.all([
      // Total customers
      prisma.customer.count({
        where: { tenantId: tenant.id }
      }),
      // Active customers
      prisma.customer.count({
        where: { tenantId: tenant.id, isActive: true }
      }),
      // New customers in period
      prisma.customer.count({
        where: {
          tenantId: tenant.id,
          createdAt: { gte: startDate }
        }
      }),
      // Top customers by total spent
      prisma.customer.findMany({
        where: { tenantId: tenant.id, isActive: true },
        orderBy: { totalSpent: 'desc' },
        take: 10,
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          totalOrders: true,
          totalSpent: true
        }
      }),
      // Customer growth over time
      prisma.customer.groupBy({
        by: ['createdAt'],
        where: {
          tenantId: tenant.id,
          createdAt: { gte: startDate }
        },
        _count: { id: true },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    res.json({
      success: true,
      analytics: {
        totalCustomers,
        activeCustomers,
        inactiveCustomers: totalCustomers - activeCustomers,
        newCustomers,
        topCustomers,
        customerGrowth: customerGrowth.map(item => ({
          date: item.createdAt.toISOString().split('T')[0],
          count: item._count.id
        }))
      }
    });

  } catch (error) {
    console.error('Get customer analytics error:', error);
    res.status(500).json({ error: 'Failed to get customer analytics' });
  }
});

// Recalculate customer statistics (Business Owner only)
router.post('/:id/recalculate-stats', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: tenant.id }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Recalculate stats
    const updatedCustomer = await customerService.recalculateCustomerStats(id);

    res.json({
      success: true,
      message: 'Customer statistics recalculated successfully',
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        phoneNumber: updatedCustomer.phoneNumber,
        totalOrders: updatedCustomer.totalOrders,
        totalSpent: updatedCustomer.totalSpent,
        lastOrderDate: updatedCustomer.lastOrderDate
      }
    });
  } catch (error) {
    console.error('Recalculate customer stats error:', error);
    res.status(500).json({ error: 'Failed to recalculate customer statistics' });
  }
});

module.exports = router;
