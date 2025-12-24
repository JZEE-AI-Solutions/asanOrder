const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const returnService = require('../../services/returnService');

// Get order returns
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      page = 1,
      limit = 20,
      sort = 'returnDate',
      order = 'desc',
      returnType,
      status,
      orderId
    } = req.query;

    const result = await returnService.getReturns({
      tenantId,
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      order,
      returnType,
      status,
      orderId
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch returns'
      }
    });
  }
});

// Create order return
router.post('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      orderId,
      returnType,
      reason,
      returnDate,
      shippingChargeHandling,
      shippingChargeAmount,
      selectedProducts
    } = req.body;

    if (!orderId || !returnType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Order ID and return type are required'
        }
      });
    }

    const returnRecord = await returnService.createOrderReturn({
      tenantId,
      orderId,
      returnType,
      reason,
      returnDate,
      shippingChargeHandling,
      shippingChargeAmount,
      selectedProducts
    });

    res.status(201).json({
      success: true,
      data: returnRecord
    });
  } catch (error) {
    console.error('Error creating return:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create return'
      }
    });
  }
});

// Approve return
router.put('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;

    const returnRecord = await returnService.approveReturn(id, tenantId);

    res.json({
      success: true,
      data: returnRecord
    });
  } catch (error) {
    console.error('Error approving return:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to approve return'
      }
    });
  }
});

// Process refund
router.post('/:id/refund', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;
    const { refundMethod, refundAmount } = req.body;

    if (!refundMethod) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Refund method is required'
        }
      });
    }

    const returnRecord = await returnService.processRefund(id, {
      tenantId,
      refundMethod,
      refundAmount
    });

    res.json({
      success: true,
      data: returnRecord
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to process refund'
      }
    });
  }
});

module.exports = router;

