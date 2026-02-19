const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const accountingService = require('../services/accountingService');

const router = express.Router();

// Clear all data for a tenant (Admin only) - DESTRUCTIVE OPERATION
router.delete('/:tenantId/clear-all-data', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { tenantId } = req.params;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    console.log(`🗑️ Clearing all data for tenant: ${tenant.businessName} (${tenantId})`);

    // Delete all tenant data in a transaction
    // Order matters due to foreign key constraints
    const result = await prisma.$transaction(async (tx) => {
      const stats = {
        orders: 0,
        products: 0,
        purchaseInvoices: 0,
        purchaseItems: 0,
        forms: 0,
        formFields: 0,
        customers: 0,
        customerLogs: 0,
        returns: 0,
        returnItems: 0,
        productLogs: 0,
        // Accounting module
        transactionLines: 0,
        profitDistributionItems: 0,
        withdrawals: 0,
        investments: 0,
        payments: 0,
        expenses: 0,
        transactions: 0,
        profitDistributions: 0,
        investors: 0,
        suppliers: 0,
        logisticsCompanies: 0,
        accounts: 0,
        userCreatedAccounts: 0
      };

      // Delete in order of dependencies (child entities first, respecting foreign keys)

      // 0. Delete TenantBankDetails (references tenant only)
      await tx.tenantBankDetail.deleteMany({
        where: { tenantId }
      });

      // 1. Delete ProductLogs first (references products and purchase_items)
      stats.productLogs = await tx.productLog.deleteMany({
        where: { tenantId }
      });

      // Accounting Module - Delete transactions first (they reference Orders and Returns)
      // 2. Delete TransactionLines (references Transaction and Account - must be deleted before Transaction)
      // First get all transactions for this tenant, then delete their lines
      const tenantTransactions = await tx.transaction.findMany({
        where: { tenantId },
        select: { id: true }
      });
      const transactionIds = tenantTransactions.map(t => t.id);
      
      if (transactionIds.length > 0) {
        const transactionLines = await tx.transactionLine.deleteMany({
          where: {
            transactionId: {
              in: transactionIds
            }
          }
        });
        stats.transactionLines = transactionLines.count || 0;
      }

      // 3. Delete Payments (references Customer, Supplier, Order, Return, Transaction)
      // Delete before Transactions since Payments have one-to-one relationship with Transactions
      // But we need to handle the circular dependency by deleting Payments first
      stats.payments = await tx.payment.deleteMany({
        where: { tenantId }
      });

      // 4. Delete Transactions (references Order, Return, PurchaseInvoice)
      // Delete before Orders and Returns since Transactions reference them via foreign keys
      stats.transactions = await tx.transaction.deleteMany({
        where: { tenantId }
      });

      // Now we can safely delete Orders and Returns
      // 5. Delete Orders (references forms, customers - must be deleted before forms)
      stats.orders = await tx.order.deleteMany({
        where: { tenantId }
      });

      // 6. Delete ReturnItems (references returns)
      // First get all returns for this tenant, then delete their items
      const tenantReturns = await tx.return.findMany({
        where: { tenantId },
        select: { id: true }
      });
      const returnIds = tenantReturns.map(r => r.id);
      
      if (returnIds.length > 0) {
        const returnItems = await tx.returnItem.deleteMany({
          where: {
            returnId: {
              in: returnIds
            }
          }
        });
        stats.returnItems = returnItems.count || 0;
      }

      // 7. Delete Returns (references purchase_invoices, but Transactions already deleted)
      stats.returns = await tx.return.deleteMany({
        where: { tenantId }
      });

      // 8. Delete PurchaseItems (references purchase_invoices and products)
      stats.purchaseItems = await tx.purchaseItem.deleteMany({
        where: { tenantId }
      });

      // 9. Delete PurchaseInvoices (no dependencies after purchase items and transactions are deleted)
      stats.purchaseInvoices = await tx.purchaseInvoice.deleteMany({
        where: { tenantId }
      });

      // 10. Delete Products (no dependencies after product logs and purchase items are deleted)
      stats.products = await tx.product.deleteMany({
        where: { tenantId }
      });

      // 11. Delete CustomerLogs (references customers)
      // First get all customers for this tenant, then delete their logs
      const tenantCustomers = await tx.customer.findMany({
        where: { tenantId },
        select: { id: true }
      });
      const customerIds = tenantCustomers.map(c => c.id);
      
      if (customerIds.length > 0) {
        const customerLogs = await tx.customerLog.deleteMany({
          where: {
            customerId: {
              in: customerIds
            }
          }
        });
        stats.customerLogs = customerLogs.count || 0;
      }

      // 12. Delete Customers (no dependencies after customer logs, orders, and payments are deleted)
      stats.customers = await tx.customer.deleteMany({
        where: { tenantId }
      });

      // 13. Delete FormFields (references forms - must be deleted before forms)
      stats.formFields = await tx.formField.deleteMany({
        where: {
          form: {
            tenantId
          }
        }
      });

      // 14. Delete Forms (no dependencies after form fields and orders are deleted)
      stats.forms = await tx.form.deleteMany({
        where: { tenantId }
      });

      // Continue with remaining accounting module deletions
      
      // 15. Delete ProfitDistributionItems (references ProfitDistribution, Investor, Transaction)
      // First get all profit distributions for this tenant, then delete their items
      const tenantProfitDistributions = await tx.profitDistribution.findMany({
        where: { tenantId },
        select: { id: true }
      });
      const profitDistributionIds = tenantProfitDistributions.map(pd => pd.id);
      
      if (profitDistributionIds.length > 0) {
        const profitDistributionItems = await tx.profitDistributionItem.deleteMany({
          where: {
            profitDistributionId: {
              in: profitDistributionIds
            }
          }
        });
        stats.profitDistributionItems = profitDistributionItems.count || 0;
      }

      // 16. Delete Withdrawals (references Investor, ProfitDistribution, Transaction)
      stats.withdrawals = await tx.withdrawal.deleteMany({
        where: { tenantId }
      });

      // 17. Delete Investments (references Investor, Transaction)
      stats.investments = await tx.investment.deleteMany({
        where: { tenantId }
      });

      // 18. Delete Expenses (references Account, Transaction)
      stats.expenses = await tx.expense.deleteMany({
        where: { tenantId }
      });

      // 19. Delete Suppliers (has PurchaseInvoice, Payment - but PurchaseInvoices and Payments already deleted)
      stats.suppliers = await tx.supplier.deleteMany({
        where: { tenantId }
      });

      // 20. Delete ProfitDistributions (references Transaction, has ProfitDistributionItem and Withdrawal)
      stats.profitDistributions = await tx.profitDistribution.deleteMany({
        where: { tenantId }
      });

      // 21. Delete Investors (has Investment, ProfitDistributionItem, Withdrawal)
      stats.investors = await tx.investor.deleteMany({
        where: { tenantId }
      });

      // 22. Delete LogisticsCompanies (has Order - but Orders already deleted)
      stats.logisticsCompanies = await tx.logisticsCompany.deleteMany({
        where: { tenantId }
      });

      // 23. Delete user-created cash/bank accounts (keep only default system accounts)
      // Delete accounts with accountSubType that are NOT the default Cash (1000) or Bank (1100)
      const deletedUserAccounts = await tx.account.deleteMany({
        where: {
          tenantId,
          OR: [
            {
              accountSubType: 'CASH',
              code: { not: '1000' } // Keep default Cash account
            },
            {
              accountSubType: 'BANK',
              code: { not: '1100' } // Keep default Bank account
            }
          ]
        }
      });
      stats.userCreatedAccounts = deletedUserAccounts.count;

      // 24. Reset all remaining account balances to 0 (preserve system accounts)
      await tx.account.updateMany({
        where: { tenantId },
        data: { balance: 0 }
      });
      stats.accounts = 0; // System accounts preserved, only balances reset

      // 25. Reset tenant settings to defaults (including COD fee payment preference)
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          defaultCodFeePaidBy: 'BUSINESS_OWNER', // Reset to default
          shippingCityCharges: null,
          shippingQuantityRules: null
        }
      });

      return stats;
    }, {
      timeout: 60000 // 60 seconds timeout for large deletions
    });

    console.log(`✅ Cleared all data for tenant ${tenant.businessName}:`, result);

    // Re-initialize accounts to ensure they exist (this only creates missing accounts, doesn't create transactions)
    await accountingService.initializeChartOfAccounts(tenantId);

    res.json({
      success: true,
      message: `All data cleared successfully for ${tenant.businessName}. All transactions deleted, user-created cash/bank accounts deleted, account balances reset to 0, and default accounts verified.`,
      stats: result
    });

  } catch (error) {
    console.error('Error clearing tenant data:', error);
    res.status(500).json({ 
      error: 'Failed to clear tenant data',
      details: error.message 
    });
  }
});

// Generate a unique 4-digit business code
async function generateBusinessCode() {
  const existingCodes = await prisma.tenant.findMany({
    select: { businessCode: true }
  });
  
  const usedCodes = new Set(existingCodes.map(t => t.businessCode));
  
  // Find the next available code starting from 1001
  let code = 1001;
  while (usedCodes.has(code.toString().padStart(4, '0'))) {
    code++;
  }
  
  return code.toString().padStart(4, '0');
}

// Create new tenant (Admin only)
router.post('/', authenticateToken, requireRole(['ADMIN']), [
  body('businessName').trim().isLength({ min: 2 }),
  body('contactPerson').trim().isLength({ min: 2 }),
  body('whatsappNumber').matches(/^\+92[0-9]{10}$/),
  body('businessType').isIn(['DRESS_SHOP', 'RESTAURANT', 'BAKERY', 'ELECTRONICS', 'GROCERY', 'OTHER']),
  body('ownerEmail').isEmail().normalizeEmail(),
  body('ownerName').trim().isLength({ min: 2 }),
  body('ownerPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      businessName, 
      contactPerson, 
      whatsappNumber, 
      businessType,
      ownerEmail,
      ownerName,
      ownerPassword
    } = req.body;

    // Check if business owner email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: ownerEmail }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password for business owner
    const hashedPassword = await bcrypt.hash(ownerPassword, 12);

    // Generate unique business code
    const businessCode = await generateBusinessCode();

    // Create business owner and tenant in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create business owner
      const owner = await tx.user.create({
        data: {
          email: ownerEmail,
          password: hashedPassword,
          name: ownerName,
          role: 'BUSINESS_OWNER'
        }
      });

      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          businessName,
          contactPerson,
          whatsappNumber,
          businessType,
          businessCode,
          ownerId: owner.id
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true
            }
          }
        }
      });

      return tenant;
    }, {
      timeout: 20000
    });

    // Initialize default chart of accounts for the new tenant
    try {
      await accountingService.initializeChartOfAccounts(result.id);
      console.log(`✅ Initialized chart of accounts for new tenant: ${result.businessName}`);
    } catch (accountError) {
      console.error('Error initializing chart of accounts for new tenant:', accountError);
      // Don't fail tenant creation if account initialization fails
    }

    // Create default shopping cart form for the new tenant
    try {
      const formLink = crypto.randomBytes(16).toString('hex');
      
      // Default form fields for shopping cart
      const defaultFields = [
        {
          label: 'Customer Name',
          fieldType: 'TEXT',
          isRequired: true,
          placeholder: 'Enter your full name',
          order: 0
        },
        {
          label: 'Phone Number',
          fieldType: 'PHONE',
          isRequired: true,
          placeholder: 'Enter your phone number',
          order: 1
        },
        {
          label: 'Email Address',
          fieldType: 'EMAIL',
          isRequired: false,
          placeholder: 'Enter your email',
          order: 2
        },
        {
          label: 'Delivery Address',
          fieldType: 'TEXTAREA',
          isRequired: true,
          placeholder: 'Enter complete delivery address',
          order: 3
        },
        {
          label: 'City',
          fieldType: 'TEXT',
          isRequired: true,
          placeholder: 'Enter your city',
          order: 4
        }
      ];

      // Create form
      const defaultForm = await prisma.form.create({
        data: {
          name: `${businessName} Order Form`,
          description: `Default order form for ${businessName}`,
          formCategory: 'SHOPPING_CART',
          tenantId: result.id,
          formLink: formLink,
          isPublished: true // Automatically publish
        }
      });

      // Create form fields
      for (const field of defaultFields) {
        await prisma.formField.create({
          data: {
            label: field.label,
            fieldType: field.fieldType,
            isRequired: field.isRequired,
            placeholder: field.placeholder,
            order: field.order,
            formId: defaultForm.id
          }
        });
      }

      console.log(`✅ Created and published default shopping cart form for tenant: ${result.businessName}`);
    } catch (formError) {
      console.error('Error creating default form for new tenant:', formError);
      // Don't fail tenant creation if form creation fails
    }

    res.status(201).json({
      message: 'Tenant and business owner created successfully',
      tenant: result
    });
  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

// Get all tenants (Admin only)
router.get('/', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        },
        _count: {
          select: {
            forms: true,
            orders: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ tenants });
  } catch (error) {
    console.error('Get tenants error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to get tenants',
      message: error.message 
    });
  }
});

// Get single tenant (Admin or Business Owner)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        },
        forms: {
          select: {
            id: true,
            name: true,
            isPublished: true,
            formLink: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            orders: true
          }
        }
      }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== tenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ tenant });
  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({ error: 'Failed to get tenant' });
  }
});

// Update tenant (Admin or Business Owner)
router.put('/:id', authenticateToken, [
  body('businessName').optional().trim().isLength({ min: 2 }),
  body('contactPerson').optional().trim().isLength({ min: 2 }),
  body('whatsappNumber').optional().matches(/^\+92[0-9]{10}$/),
  body('businessAddress').optional().trim(),
  body('businessType').optional().isIn(['DRESS_SHOP', 'RESTAURANT', 'BAKERY', 'ELECTRONICS', 'GROCERY', 'OTHER'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Check if tenant exists
    const existingTenant = await prisma.tenant.findUnique({
      where: { id }
    });

    if (!existingTenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== existingTenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: filteredData,
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        }
      }
    });

    res.json({
      message: 'Tenant updated successfully',
      tenant
    });
  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// Get tenant by owner (for business owner dashboard)
router.get('/owner/me', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id },
      include: {
        forms: {
          select: {
            id: true,
            name: true,
            isPublished: true,
            formLink: true,
            createdAt: true,
            _count: {
              select: {
                orders: true
              }
            }
          }
        },
        _count: {
          select: {
            orders: true
          }
        }
      }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'No tenant found for this business owner' });
    }

    res.json({ tenant });
  } catch (error) {
    console.error('Get owner tenant error:', error);
    res.status(500).json({ error: 'Failed to get tenant information' });
  }
});

// Update tenant by owner (for business owner settings)
router.put('/owner/me', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('businessName').optional().trim().isLength({ min: 2 }),
  body('contactPerson').optional().trim().isLength({ min: 2 }),
  body('whatsappNumber').optional().matches(/^\+92[0-9]{10}$/),
  body('businessAddress').optional().trim(),
  body('businessType').optional().isIn(['DRESS_SHOP', 'RESTAURANT', 'BAKERY', 'ELECTRONICS', 'GROCERY', 'OTHER'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Find tenant by owner ID
    const existingTenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!existingTenant) {
      return res.status(404).json({ error: 'No tenant found for this business owner' });
    }

    const updateData = req.body;
    
    // Only include fields that are provided and valid
    const allowedFields = ['businessName', 'contactPerson', 'whatsappNumber', 'businessAddress', 'businessType', 'defaultCodFeePaidBy'];
    const filteredData = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id: existingTenant.id },
      data: filteredData,
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        }
      }
    });

    res.json({
      message: 'Tenant updated successfully',
      tenant
    });
  } catch (error) {
    console.error('Update owner tenant error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta
    });
    res.status(500).json({ 
      error: 'Failed to update tenant',
      details: error.message,
      code: error.code
    });
  }
});

// ----- Prepaid bank / payment provider details (for customer transfer instructions) -----

const getTenantByOwnerId = async (userId) => {
  const tenant = await prisma.tenant.findUnique({
    where: { ownerId: userId }
  });
  return tenant;
};

// List prepaid bank details for current business owner's tenant
router.get('/owner/prepaid-bank-details', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenant = await getTenantByOwnerId(req.user.id);
    if (!tenant) {
      return res.status(404).json({ error: 'No tenant found for this business owner' });
    }
    const list = await prisma.tenantBankDetail.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });
    res.json({ data: list });
  } catch (error) {
    console.error('List prepaid bank details error:', error);
    const msg = error.message || '';
    if (msg.includes('tenantBankDetail') || msg.includes('Unknown arg') || msg.includes('Invalid prisma')) {
      console.error('Hint: Run "npx prisma generate" in the backend folder (with server stopped), then restart the server.');
    }
    res.status(500).json({ error: 'Failed to load bank details' });
  }
});

// Create prepaid bank detail
router.post('/owner/prepaid-bank-details', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('providerName').trim().notEmpty().withMessage('Provider name is required'),
  body('accountTitle').trim().notEmpty().withMessage('Account title is required'),
  body('accountNumber').trim().notEmpty().withMessage('Account number is required'),
  body('iban').optional().trim(),
  body('bankName').optional().trim(),
  body('instructions').optional().trim(),
  body('sortOrder').optional().isInt({ min: 0 }).toInt(),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const tenant = await getTenantByOwnerId(req.user.id);
    if (!tenant) {
      return res.status(404).json({ error: 'No tenant found for this business owner' });
    }
    const { providerName, accountTitle, accountNumber, iban, bankName, instructions, sortOrder, isActive } = req.body;
    const created = await prisma.tenantBankDetail.create({
      data: {
        tenantId: tenant.id,
        providerName,
        accountTitle,
        accountNumber,
        iban: iban || null,
        bankName: bankName || null,
        instructions: instructions || null,
        sortOrder: sortOrder != null ? sortOrder : 0,
        isActive: isActive !== false
      }
    });
    res.status(201).json({ data: created });
  } catch (error) {
    console.error('Create prepaid bank detail error:', error);
    res.status(500).json({ error: 'Failed to create bank detail' });
  }
});

// Update prepaid bank detail
router.put('/owner/prepaid-bank-details/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('providerName').optional().trim().notEmpty(),
  body('accountTitle').optional().trim().notEmpty(),
  body('accountNumber').optional().trim().notEmpty(),
  body('iban').optional().trim(),
  body('bankName').optional().trim(),
  body('instructions').optional().trim(),
  body('sortOrder').optional().isInt({ min: 0 }).toInt(),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const tenant = await getTenantByOwnerId(req.user.id);
    if (!tenant) {
      return res.status(404).json({ error: 'No tenant found for this business owner' });
    }
    const existing = await prisma.tenantBankDetail.findFirst({
      where: { id: req.params.id, tenantId: tenant.id }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Bank detail not found' });
    }
    const updateData = {};
    ['providerName', 'accountTitle', 'accountNumber', 'iban', 'bankName', 'instructions', 'sortOrder', 'isActive'].forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = field === 'iban' || field === 'bankName' || field === 'instructions'
          ? (req.body[field] || null)
          : req.body[field];
      }
    });
    const updated = await prisma.tenantBankDetail.update({
      where: { id: req.params.id },
      data: updateData
    });
    res.json({ data: updated });
  } catch (error) {
    console.error('Update prepaid bank detail error:', error);
    res.status(500).json({ error: 'Failed to update bank detail' });
  }
});

// Delete prepaid bank detail
router.delete('/owner/prepaid-bank-details/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenant = await getTenantByOwnerId(req.user.id);
    if (!tenant) {
      return res.status(404).json({ error: 'No tenant found for this business owner' });
    }
    const existing = await prisma.tenantBankDetail.findFirst({
      where: { id: req.params.id, tenantId: tenant.id }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Bank detail not found' });
    }
    await prisma.tenantBankDetail.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Bank detail deleted successfully' });
  } catch (error) {
    console.error('Delete prepaid bank detail error:', error);
    res.status(500).json({ error: 'Failed to delete bank detail' });
  }
});

module.exports = router;
