const express = require('express');
const router = express.Router();
const prisma = require('../../lib/db');
const { authenticateToken } = require('../../middleware/auth');
const accountingService = require('../../services/accountingService');

// Get chart of accounts
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    
    let accounts = await prisma.account.findMany({
      where: { tenantId },
      orderBy: [
        { type: 'asc' },
        { code: 'asc' }
      ]
    });

    // If no accounts exist, initialize default chart
    if (accounts.length === 0) {
      console.log(`No accounts found for tenant ${tenantId}, initializing default chart...`);
      accounts = await accountingService.initializeChartOfAccounts(tenantId);
    }

    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch accounts'
      }
    });
  }
});

// Re-initialize chart of accounts (useful if accounts were accidentally deleted)
router.post('/reinitialize', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    
    // Initialize chart of accounts (getOrCreateAccount will skip existing accounts)
    const accounts = await accountingService.initializeChartOfAccounts(tenantId);
    
    res.json({
      success: true,
      message: 'Chart of accounts re-initialized successfully',
      data: accounts
    });
  } catch (error) {
    console.error('Error re-initializing accounts:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to re-initialize accounts'
      }
    });
  }
});

// Create account
router.post('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { code, name, type, parentId, balance } = req.body;

    if (!code || !name || !type) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Code, name, and type are required'
        }
      });
    }

    // Check if account code already exists
    const existing = await accountingService.getAccountByCode(code, tenantId);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'Account code already exists'
        }
      });
    }

    const account = await accountingService.getOrCreateAccount({
      code,
      name,
      type,
      parentId,
      balance: balance || 0,
      tenantId
    });

    res.status(201).json({
      success: true,
      data: account
    });
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create account'
      }
    });
  }
});

// Get account by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;

    const account = await prisma.account.findFirst({
      where: {
        id,
        tenantId
      },
      include: {
        parent: true,
        children: true
      }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Account not found'
        }
      });
    }

    res.json({
      success: true,
      data: account
    });
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch account'
      }
    });
  }
});

// Set opening balance for an account
router.post('/:id/opening-balance', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;
    const { amount, date } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Opening balance amount must be greater than 0'
        }
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Date is required'
        }
      });
    }

    // Get the account
    const account = await prisma.account.findFirst({
      where: {
        id,
        tenantId
      }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Account not found'
        }
      });
    }

    // Get or create Opening Balance equity account (code 3001)
    const openingBalanceAccount = await accountingService.getAccountByCode('3001', tenantId) ||
      await accountingService.getOrCreateAccount({
        code: '3001',
        name: 'Opening Balance',
        type: 'EQUITY',
        tenantId,
        balance: 0
      });

    // Generate transaction number
    const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}-OB`;

    // Create opening balance transaction
    const transactionLines = [];
    
    if (account.type === 'ASSET') {
      // For assets: Debit the account, Credit Opening Balance
      transactionLines.push(
        { accountId: account.id, debitAmount: parseFloat(amount), creditAmount: 0 },
        { accountId: openingBalanceAccount.id, debitAmount: 0, creditAmount: parseFloat(amount) }
      );
    } else if (account.type === 'LIABILITY') {
      // For liabilities: Credit the account, Debit Opening Balance
      transactionLines.push(
        { accountId: account.id, debitAmount: 0, creditAmount: parseFloat(amount) },
        { accountId: openingBalanceAccount.id, debitAmount: parseFloat(amount), creditAmount: 0 }
      );
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ACCOUNT_TYPE',
          message: 'Opening balance can only be set for Asset or Liability accounts'
        }
      });
    }

    const transaction = await accountingService.createTransaction({
      transactionNumber,
      date: new Date(date),
      description: `Opening Balance - ${account.name}`,
      tenantId
    }, transactionLines);

    res.json({
      success: true,
      message: 'Opening balance set successfully',
      data: transaction
    });
  } catch (error) {
    console.error('Error setting opening balance:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to set opening balance'
      }
    });
  }
});

module.exports = router;

