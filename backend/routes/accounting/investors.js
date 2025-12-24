const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const investorService = require('../../services/investorService');

// Get investors
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    
    const investors = await investorService.getInvestors(tenantId);

    res.json({
      success: true,
      data: investors
    });
  } catch (error) {
    console.error('Error fetching investors:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch investors'
      }
    });
  }
});

// Create investor
router.post('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { name, contact, address, email, phone, investmentPercentage } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name is required'
        }
      });
    }

    const investor = await investorService.createInvestor({
      tenantId,
      name,
      contact,
      address,
      email,
      phone,
      investmentPercentage: investmentPercentage ? parseFloat(investmentPercentage) : null
    });

    res.status(201).json({
      success: true,
      data: investor
    });
  } catch (error) {
    console.error('Error creating investor:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create investor'
      }
    });
  }
});

// Get investments
router.get('/investments', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'desc',
      investorId,
      fromDate,
      toDate
    } = req.query;

    const result = await investorService.getInvestments({
      tenantId,
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order,
      investorId,
      fromDate,
      toDate
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching investments:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch investments'
      }
    });
  }
});

// Record investment
router.post('/investments', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { investorId, date, amount, description } = req.body;

    if (!investorId || !date || !amount) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Investor ID, date, and amount are required'
        }
      });
    }

    const investment = await investorService.recordInvestment({
      tenantId,
      investorId,
      date,
      amount: parseFloat(amount),
      description
    });

    res.status(201).json({
      success: true,
      data: investment
    });
  } catch (error) {
    console.error('Error recording investment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to record investment'
      }
    });
  }
});

module.exports = router;

