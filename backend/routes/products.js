const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const InventoryService = require('../services/inventoryService');

const router = express.Router();

// Get all products (inventory) for a tenant (Business Owner only)
router.get('/', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { search, category, lowStock } = req.query;
    
    const whereClause = {
      tenantId: tenant.id,
      isActive: true
    };

    // Add search filter
    if (search) {
      whereClause.name = {
        contains: search,
        mode: 'insensitive'
      };
    }

    // Add category filter
    if (category) {
      whereClause.category = category;
    }

    // Add low stock filter
    if (lowStock === 'true') {
      whereClause.currentQuantity = {
        lte: prisma.product.fields.minStockLevel
      };
    }

    const products = await prisma.product.findMany({
      where: whereClause,
      include: {
        productLogs: {
          orderBy: { createdAt: 'desc' },
          take: 3 // Last 3 logs
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json({ products });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to get products' });
  }
});

// Get single product with full history (Business Owner only)
router.get('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: id,
        tenantId: tenant.id
      },
      include: {
        productLogs: {
          orderBy: { createdAt: 'desc' },
          include: {
            purchaseItem: {
              select: {
                id: true,
                name: true,
                purchaseInvoice: {
                  select: {
                    invoiceNumber: true,
                    invoiceDate: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to get product' });
  }
});

// Update product (Business Owner only)
router.put('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('name').optional().trim().isLength({ min: 1 }),
  body('description').optional().trim(),
  body('category').optional().trim(),
  body('sku').optional().trim(),
  body('currentRetailPrice').optional().isFloat({ min: 0 }),
  body('minStockLevel').optional().isInt({ min: 0 }),
  body('maxStockLevel').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if product exists and belongs to tenant
    const existingProduct = await prisma.product.findFirst({
      where: {
        id: id,
        tenantId: tenant.id
      }
    });

    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updateData = { ...req.body };
    updateData.lastUpdated = new Date();

    const product = await prisma.product.update({
      where: { id },
      data: updateData
    });

    // Create product log for the update
    await prisma.productLog.create({
      data: {
        action: 'UPDATE_PRICE',
        oldPrice: existingProduct.currentRetailPrice,
        newPrice: updateData.currentRetailPrice,
        reason: 'Product details updated',
        reference: 'Manual update',
        notes: 'Product information updated by user',
        tenantId: tenant.id,
        productId: product.id
      }
    });

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Get inventory summary (Business Owner only)
router.get('/summary/inventory', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const summary = await InventoryService.getInventorySummary(tenant.id);

    res.json({ summary });
  } catch (error) {
    console.error('Get inventory summary error:', error);
    res.status(500).json({ error: 'Failed to get inventory summary' });
  }
});

// Get product history/logs (Business Owner only)
router.get('/:id/history', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { action, limit = 50 } = req.query;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const filters = {};
    if (action) {
      filters.action = action;
    }

    const logs = await InventoryService.getProductHistory(tenant.id, id, filters);

    res.json({ 
      logs: logs.slice(0, parseInt(limit)),
      total: logs.length
    });
  } catch (error) {
    console.error('Get product history error:', error);
    res.status(500).json({ error: 'Failed to get product history' });
  }
});

// Manual inventory adjustment (Business Owner only)
router.post('/:id/adjust', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('quantity').isInt(),
  body('reason').trim().isLength({ min: 1 }),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { quantity, reason, notes } = req.body;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if product exists and belongs to tenant
    const existingProduct = await prisma.product.findFirst({
      where: {
        id: id,
        tenantId: tenant.id
      }
    });

    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const oldQuantity = existingProduct.currentQuantity;
    const newQuantity = Math.max(0, oldQuantity + quantity);

    const product = await prisma.product.update({
      where: { id },
      data: {
        currentQuantity: newQuantity,
        lastUpdated: new Date()
      }
    });

    // Create product log for the adjustment
    await prisma.productLog.create({
      data: {
        action: quantity > 0 ? 'INCREASE' : 'DECREASE',
        quantity: quantity,
        oldQuantity: oldQuantity,
        newQuantity: newQuantity,
        reason: reason,
        reference: 'Manual adjustment',
        notes: notes || `Manual inventory adjustment by ${quantity}`,
        tenantId: tenant.id,
        productId: product.id
      }
    });

    res.json({
      message: 'Inventory adjusted successfully',
      product,
      adjustment: {
        oldQuantity,
        newQuantity,
        change: quantity
      }
    });
  } catch (error) {
    console.error('Adjust inventory error:', error);
    res.status(500).json({ error: 'Failed to adjust inventory' });
  }
});

module.exports = router;
