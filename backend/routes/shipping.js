const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const ShippingChargesService = require('../services/shippingChargesService');

const router = express.Router();

// Calculate shipping charges (public endpoint - used by order forms)
router.post('/calculate', [
  body('city').optional().trim(),
  body('products').isArray().withMessage('Products must be an array'),
  body('productQuantities').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { city, products, productQuantities, tenantId } = req.body;

    console.log('📥 Shipping calculation request:', {
      tenantId,
      city,
      productsCount: products?.length || 0,
      products: products?.map(p => ({ id: p.id, name: p.name, quantity: p.quantity || productQuantities?.[p.id] })),
      productQuantities
    });

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    if (!products || products.length === 0) {
      return res.json({ shippingCharges: 0 });
    }

    const shippingCharges = await ShippingChargesService.calculateShippingCharges(
      tenantId,
      city || '',
      products,
      productQuantities || {}
    );

    console.log('📤 Shipping calculation response:', { shippingCharges });

    res.json({ shippingCharges });
  } catch (error) {
    console.error('Calculate shipping error:', error);
    res.status(500).json({ error: 'Failed to calculate shipping charges' });
  }
});

// Get shipping configuration (Business Owner only)
router.get('/config', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id },
      select: {
        shippingCityCharges: true,
        shippingQuantityRules: true
      }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Parse and return configuration
    let config = ShippingChargesService.getDefaultShippingConfig();

    if (tenant.shippingCityCharges) {
      try {
        const parsed = JSON.parse(tenant.shippingCityCharges);
        if (parsed.cityCharges) {
          config.cityCharges = parsed.cityCharges;
          config.defaultCityCharge = parsed.defaultCityCharge || config.defaultCityCharge;
        } else {
          config.cityCharges = parsed;
          config.defaultCityCharge = parsed.default || config.defaultCityCharge;
        }
      } catch (e) {
        console.error('Error parsing city charges:', e);
      }
    }

    if (tenant.shippingQuantityRules) {
      try {
        const parsed = JSON.parse(tenant.shippingQuantityRules);
        if (Array.isArray(parsed)) {
          config.quantityRules = parsed;
        } else if (parsed.quantityRules) {
          config.quantityRules = parsed.quantityRules;
          config.defaultQuantityCharge = parsed.defaultQuantityCharge || config.defaultQuantityCharge;
        }
      } catch (e) {
        console.error('Error parsing quantity rules:', e);
      }
    }

    res.json({ config });
  } catch (error) {
    console.error('Get shipping config error:', error);
    res.status(500).json({ error: 'Failed to get shipping configuration' });
  }
});

// Update shipping configuration (Business Owner only)
router.put('/config', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('cityCharges').optional().isObject(),
  body('defaultCityCharge').optional().isFloat({ min: 0 }),
  body('quantityRules').optional().isArray(),
  body('defaultQuantityCharge').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cityCharges, defaultCityCharge, quantityRules, defaultQuantityCharge } = req.body;

    // Find tenant
    const existingTenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!existingTenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Prepare update data
    const updateData = {};

    if (cityCharges !== undefined || defaultCityCharge !== undefined) {
      const currentCityCharges = existingTenant.shippingCityCharges
        ? JSON.parse(existingTenant.shippingCityCharges)
        : {};

      const newCityCharges = {
        cityCharges: cityCharges !== undefined ? cityCharges : (currentCityCharges.cityCharges || currentCityCharges),
        defaultCityCharge: defaultCityCharge !== undefined ? defaultCityCharge : (currentCityCharges.defaultCityCharge || ShippingChargesService.getDefaultShippingConfig().defaultCityCharge)
      };

      updateData.shippingCityCharges = JSON.stringify(newCityCharges);
    }

    if (quantityRules !== undefined || defaultQuantityCharge !== undefined) {
      const currentQuantityRules = existingTenant.shippingQuantityRules
        ? JSON.parse(existingTenant.shippingQuantityRules)
        : {};

      // Sort quantity rules by min value to ensure proper matching order
      let rulesToSave = quantityRules !== undefined ? quantityRules : (currentQuantityRules.quantityRules || currentQuantityRules);
      if (Array.isArray(rulesToSave)) {
        rulesToSave = [...rulesToSave].sort((a, b) => {
          const minA = a.min || 1;
          const minB = b.min || 1;
          return minA - minB;
        });
      }

      const newQuantityRules = {
        quantityRules: rulesToSave,
        defaultQuantityCharge: defaultQuantityCharge !== undefined ? defaultQuantityCharge : (currentQuantityRules.defaultQuantityCharge || ShippingChargesService.getDefaultShippingConfig().defaultQuantityCharge)
      };

      updateData.shippingQuantityRules = JSON.stringify(newQuantityRules);
    }

    // Update tenant
    const tenant = await prisma.tenant.update({
      where: { id: existingTenant.id },
      data: updateData
    });

    res.json({
      message: 'Shipping configuration updated successfully',
      tenant: {
        id: tenant.id,
        shippingCityCharges: tenant.shippingCityCharges,
        shippingQuantityRules: tenant.shippingQuantityRules
      }
    });
  } catch (error) {
    console.error('Update shipping config error:', error);
    res.status(500).json({ error: 'Failed to update shipping configuration' });
  }
});

module.exports = router;

