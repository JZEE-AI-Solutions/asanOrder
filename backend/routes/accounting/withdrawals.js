const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const withdrawalService = require('../../services/withdrawalService');

// Get withdrawals
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'desc',
      type,
      investorId,
      fromDate,
      toDate
    } = req.query;

    const result = await withdrawalService.getWithdrawals({
      tenantId,
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order,
      type,
      investorId,
      fromDate,
      toDate
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch withdrawals'
      }
    });
  }
});

// Create withdrawal
router.post('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      date,
      amount,
      type,
      withdrawalMethod,
      description,
      investorId,
      profitDistributionId
    } = req.body;

    if (!date || !amount || !type || !withdrawalMethod) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Date, amount, type, and withdrawal method are required'
        }
      });
    }

    const withdrawal = await withdrawalService.createWithdrawal({
      tenantId,
      date,
      amount: parseFloat(amount),
      type,
      withdrawalMethod,
      description,
      investorId,
      profitDistributionId
    });

    res.status(201).json({
      success: true,
      data: withdrawal
    });
  } catch (error) {
    console.error('Error creating withdrawal:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create withdrawal'
      }
    });
  }
});

module.exports = router;

