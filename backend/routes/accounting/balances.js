const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const balanceService = require('../../services/balanceService');

// Get customer balances
router.get('/customers', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    
    const balances = await balanceService.getAllCustomerBalances(tenantId);

    res.json({
      success: true,
      data: balances
    });
  } catch (error) {
    console.error('Error fetching customer balances:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch customer balances'
      }
    });
  }
});

// Get supplier balances
router.get('/suppliers', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    
    const balances = await balanceService.getAllSupplierBalances(tenantId);

    res.json({
      success: true,
      data: balances
    });
  } catch (error) {
    console.error('Error fetching supplier balances:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch supplier balances'
      }
    });
  }
});

// Get balance summary
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    
    const summary = await balanceService.getBalanceSummary(tenantId);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching balance summary:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to fetch balance summary'
      }
    });
  }
});

// Get customer balance by ID
router.get('/customers/:customerId', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const balance = await balanceService.calculateCustomerBalance(customerId);

    res.json({
      success: true,
      data: balance
    });
  } catch (error) {
    console.error('Error fetching customer balance:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to fetch customer balance'
      }
    });
  }
});

module.exports = router;

