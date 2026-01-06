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

    // Validate range-based rules
    if (codFeeCalculationType === 'RANGE_BASED' && codFeeRules) {
      const rules = Array.isArray(codFeeRules) ? codFeeRules : JSON.parse(codFeeRules);
      
      if (!Array.isArray(rules) || rules.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'At least one range rule is required'
          }
        });
      }

      // Sort rules by min value
      const sortedRules = [...rules].sort((a, b) => a.min - b.min);
      
      // Validate each rule
      for (let i = 0; i < sortedRules.length; i++) {
        const rule = sortedRules[i];
        
        if (rule.min === undefined || rule.max === undefined || rule.fee === undefined) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Range rule ${i + 1}: Min, Max, and Fee are required`
            }
          });
        }
        
        if (rule.min >= rule.max) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Range rule ${i + 1}: Min must be less than Max`
            }
          });
        }
        
        if (rule.fee < 0) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Range rule ${i + 1}: Fee must be >= 0`
            }
          });
        }
        
        // Check for gaps (except for first rule which should start at 0 or positive)
        if (i > 0) {
          const prevRule = sortedRules[i - 1];
          if (rule.min !== prevRule.max) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: `Range rule ${i + 1}: Must start where previous range ends (no gaps allowed). Previous max: ${prevRule.max}, Current min: ${rule.min}`
              }
            });
          }
        }
      }
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

    // Get existing company to check calculation type
    const existingCompany = await prisma.logisticsCompany.findFirst({
      where: { id, tenantId }
    });

    if (!existingCompany) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Logistics company not found'
        }
      });
    }

    const codFeeCalculationType = updateData.codFeeCalculationType || existingCompany.codFeeCalculationType;

    // Validate based on calculation type
    if (codFeeCalculationType === 'PERCENTAGE' && updateData.codFeePercentage === undefined && !existingCompany.codFeePercentage) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'COD fee percentage is required for percentage-based calculation'
        }
      });
    }

    if (codFeeCalculationType === 'FIXED' && updateData.fixedCodFee === undefined && !existingCompany.fixedCodFee) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Fixed COD fee is required for fixed calculation'
        }
      });
    }

    // Validate range-based rules
    if (codFeeCalculationType === 'RANGE_BASED') {
      const codFeeRules = updateData.codFeeRules !== undefined ? updateData.codFeeRules : existingCompany.codFeeRules;
      
      if (!codFeeRules) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'COD fee rules are required for range-based calculation'
          }
        });
      }

      const rules = Array.isArray(codFeeRules) ? codFeeRules : JSON.parse(codFeeRules);
      
      if (!Array.isArray(rules) || rules.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'At least one range rule is required'
          }
        });
      }

      // Sort rules by min value
      const sortedRules = [...rules].sort((a, b) => a.min - b.min);
      
      // Validate each rule
      for (let i = 0; i < sortedRules.length; i++) {
        const rule = sortedRules[i];
        
        if (rule.min === undefined || rule.max === undefined || rule.fee === undefined) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Range rule ${i + 1}: Min, Max, and Fee are required`
            }
          });
        }
        
        if (rule.min >= rule.max) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Range rule ${i + 1}: Min must be less than Max`
            }
          });
        }
        
        if (rule.fee < 0) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: `Range rule ${i + 1}: Fee must be >= 0`
            }
          });
        }
        
        // Check for gaps (except for first rule)
        if (i > 0) {
          const prevRule = sortedRules[i - 1];
          if (rule.min !== prevRule.max) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: `Range rule ${i + 1}: Must start where previous range ends (no gaps allowed). Previous max: ${prevRule.max}, Current min: ${rule.min}`
              }
            });
          }
        }
      }
    }

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

// Delete logistics company
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;

    // Check if company exists and belongs to tenant
    const company = await prisma.logisticsCompany.findFirst({
      where: {
        id,
        tenantId
      },
      include: {
        orders: {
          select: {
            id: true
          },
          take: 1
        }
      }
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Logistics company not found'
        }
      });
    }

    // Check if company is used in any orders
    if (company.orders.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'IN_USE',
          message: 'Cannot delete logistics company that is used in existing orders'
        }
      });
    }

    await prisma.logisticsCompany.delete({
      where: {
        id
      }
    });

    res.json({
      success: true,
      message: 'Logistics company deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting logistics company:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to delete logistics company'
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

