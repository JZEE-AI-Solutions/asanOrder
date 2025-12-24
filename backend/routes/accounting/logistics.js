const express = require('express');
const router = express.Router();
const prisma = require('../../lib/db');
const { authenticateToken } = require('../../middleware/auth');
const codFeeService = require('../../services/codFeeService');

// Get logistics companies
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    
    const companies = await prisma.logisticsCompany.findMany({
      where: {
        tenantId
      },
      orderBy: {
        name: 'asc'
      }
    });

    res.json({
      success: true,
      data: companies
    });
  } catch (error) {
    console.error('Error fetching logistics companies:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch logistics companies'
      }
    });
  }
});

// Create logistics company
router.post('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      name,
      contact,
      address,
      email,
      phone,
      codFeeCalculationType,
      codFeePercentage,
      codFeeRules,
      fixedCodFee
    } = req.body;

    if (!name || !codFeeCalculationType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name and COD fee calculation type are required'
        }
      });
    }

    // Validate based on calculation type
    if (codFeeCalculationType === 'PERCENTAGE' && !codFeePercentage) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'COD fee percentage is required for percentage-based calculation'
        }
      });
    }

    if (codFeeCalculationType === 'RANGE_BASED' && !codFeeRules) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'COD fee rules are required for range-based calculation'
        }
      });
    }

    if (codFeeCalculationType === 'FIXED' && !fixedCodFee) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Fixed COD fee is required for fixed calculation'
        }
      });
    }

    const company = await prisma.logisticsCompany.create({
      data: {
        name,
        contact,
        address,
        email,
        phone,
        codFeeCalculationType,
        codFeePercentage: codFeePercentage ? parseFloat(codFeePercentage) : null,
        codFeeRules: codFeeRules ? JSON.stringify(codFeeRules) : null,
        fixedCodFee: fixedCodFee ? parseFloat(fixedCodFee) : null,
        status: 'ACTIVE',
        tenantId
      }
    });

    res.status(201).json({
      success: true,
      data: company
    });
  } catch (error) {
    console.error('Error creating logistics company:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create logistics company'
      }
    });
  }
});

// Update logistics company
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;
    const updateData = req.body;

    // Convert codFeeRules to JSON if provided
    if (updateData.codFeeRules && typeof updateData.codFeeRules === 'object') {
      updateData.codFeeRules = JSON.stringify(updateData.codFeeRules);
    }

    const company = await prisma.logisticsCompany.update({
      where: {
        id,
        tenantId
      },
      data: updateData
    });

    res.json({
      success: true,
      data: company
    });
  } catch (error) {
    console.error('Error updating logistics company:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to update logistics company'
      }
    });
  }
});

// Calculate COD fee for order
router.post('/orders/:orderId/calculate-cod-fee', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { orderId } = req.params;
    const { logisticsCompanyId } = req.body;

    if (!logisticsCompanyId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Logistics company ID is required'
        }
      });
    }

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        tenantId
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Order not found'
        }
      });
    }

    // Calculate order total
    let orderTotal = 0;
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

      selectedProducts.forEach(product => {
        const quantity = productQuantities[product.id] || product.quantity || 1;
        const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
        orderTotal += price * quantity;
      });
    } catch (e) {
      // Ignore parsing errors
    }

    orderTotal += (order.shippingCharges || 0);
    const paymentAmount = order.paymentAmount || 0;
    const codAmount = orderTotal - paymentAmount;

    if (codAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Order is fully paid, no COD amount'
        }
      });
    }

    const codFeeResult = await codFeeService.calculateCODFee(logisticsCompanyId, codAmount);

    res.json({
      success: true,
      data: codFeeResult
    });
  } catch (error) {
    console.error('Error calculating COD fee:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to calculate COD fee'
      }
    });
  }
});

// Get COD fees by period
router.get('/cod-fees', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { fromDate, toDate, logisticsCompanyId } = req.query;

    const result = await codFeeService.getCODFeesByPeriod({
      tenantId,
      fromDate,
      toDate,
      logisticsCompanyId
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching COD fees:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch COD fees'
      }
    });
  }
});

module.exports = router;

