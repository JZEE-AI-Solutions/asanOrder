const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const profitService = require('../../services/profitService');

// Calculate profit
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { fromDate, toDate } = req.query;

    const profit = await profitService.calculateProfit({
      tenantId,
      fromDate,
      toDate
    });

    res.json({
      success: true,
      data: profit
    });
  } catch (error) {
    console.error('Error calculating profit:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to calculate profit'
      }
    });
  }
});

// Get profit distributions
router.get('/distributions', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'desc',
      status
    } = req.query;

    const result = await profitService.getProfitDistributions({
      tenantId,
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order,
      status
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching profit distributions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch profit distributions'
      }
    });
  }
});

// Create profit distribution
router.post('/distributions', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      date,
      fromDate,
      toDate,
      totalProfitAmount,
      distributionMethod,
      investorShares
    } = req.body;

    if (!date || !fromDate || !toDate || !totalProfitAmount || !distributionMethod) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Date, fromDate, toDate, totalProfitAmount, and distributionMethod are required'
        }
      });
    }

    const distribution = await profitService.createProfitDistribution({
      tenantId,
      date,
      fromDate,
      toDate,
      totalProfitAmount: parseFloat(totalProfitAmount),
      distributionMethod,
      investorShares
    });

    res.status(201).json({
      success: true,
      data: distribution
    });
  } catch (error) {
    console.error('Error creating profit distribution:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create profit distribution'
      }
    });
  }
});

// Approve profit distribution
router.put('/distributions/:id/approve', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;

    const distribution = await profitService.approveProfitDistribution(id, tenantId);

    res.json({
      success: true,
      data: distribution
    });
  } catch (error) {
    console.error('Error approving profit distribution:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to approve profit distribution'
      }
    });
  }
});

// Distribute profit
router.post('/distributions/:id/distribute', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;

    const distribution = await profitService.distributeProfit(id, tenantId);

    res.json({
      success: true,
      data: distribution
    });
  } catch (error) {
    console.error('Error distributing profit:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to distribute profit'
      }
    });
  }
});

module.exports = router;

