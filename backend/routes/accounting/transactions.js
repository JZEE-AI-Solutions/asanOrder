const express = require('express');
const router = express.Router();
const prisma = require('../../lib/db');
const { authenticateToken } = require('../../middleware/auth');
const accountingService = require('../../services/accountingService');

// Get transactions
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'desc',
      fromDate,
      toDate,
      orderId,
      accountId
    } = req.query;

    const result = await accountingService.getTransactions({
      tenantId,
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order,
      fromDate,
      toDate,
      orderId,
      accountId
    });

    // When ledger is for a specific account and fromDate is set, compute opening balance (balance before fromDate)
    let openingBalance = undefined;
    if (accountId && fromDate) {
      const account = await prisma.account.findFirst({
        where: { id: accountId, tenantId }
      });
      if (account) {
        // ASSET, EXPENSE, EQUITY: debit increases balance (same as in accountingService.createTransaction)
        const isDebitIncrease = ['ASSET', 'EXPENSE', 'EQUITY'].includes(account.type);
        const lines = await prisma.transactionLine.findMany({
          where: {
            accountId,
            transaction: {
              tenantId,
              date: { lt: new Date(fromDate) }
            }
          },
          select: { debitAmount: true, creditAmount: true }
        });
        openingBalance = lines.reduce((sum, line) => {
          const change = isDebitIncrease
            ? (line.debitAmount || 0) - (line.creditAmount || 0)
            : (line.creditAmount || 0) - (line.debitAmount || 0);
          return sum + change;
        }, 0);
      }
    }

    res.json({
      success: true,
      ...result,
      ...(openingBalance !== undefined && { openingBalance })
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch transactions'
      }
    });
  }
});

// Create journal entry
router.post('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { date, description, transactionLines } = req.body;

    if (!transactionLines || !Array.isArray(transactionLines) || transactionLines.length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least 2 transaction lines are required'
        }
      });
    }

    const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
    
    const transaction = await accountingService.createTransaction(
      {
        transactionNumber,
        date: new Date(date || new Date()),
        description,
        tenantId
      },
      transactionLines
    );

    res.status(201).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create transaction'
      }
    });
  }
});

module.exports = router;

