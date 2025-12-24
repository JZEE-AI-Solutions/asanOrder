const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const expenseService = require('../../services/expenseService');

// Get expenses
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'desc',
      category,
      fromDate,
      toDate
    } = req.query;

    const result = await expenseService.getExpenses({
      tenantId,
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order,
      category,
      fromDate,
      toDate
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch expenses'
      }
    });
  }
});

// Create expense
router.post('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { date, category, amount, description, accountId, receipt, receiptData, receiptType } = req.body;

    if (!date || !category || !amount) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Date, category, and amount are required'
        }
      });
    }

    const expense = await expenseService.createExpense({
      tenantId,
      date,
      category,
      amount: parseFloat(amount),
      description,
      accountId,
      receipt,
      receiptData,
      receiptType
    });

    res.status(201).json({
      success: true,
      data: expense
    });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create expense'
      }
    });
  }
});

// Get expense by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;

    const expense = await expenseService.getExpenseById(id, tenantId);

    if (!expense) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Expense not found'
        }
      });
    }

    res.json({
      success: true,
      data: expense
    });
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch expense'
      }
    });
  }
});

module.exports = router;

