const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all products for a tenant (Business Owner only)
router.get('/', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    // Optimize: Use tenant from authenticated user
    if (!req.user.tenant?.id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));
    const skipNum = (pageNum - 1) * limitNum;

    // Optimize: Use select, limit productLogs, add pagination
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: { tenantId: req.user.tenant.id },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          sku: true,
          image: true,
          isActive: true,
          currentQuantity: true,
          currentRetailPrice: true,
          lastPurchasePrice: true,
          lastSalePrice: true,
          createdAt: true,
          updatedAt: true,
          // Only fetch recent logs count, not all logs
          _count: {
            select: {
              productLogs: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: skipNum,
        take: limitNum
      }),
      prisma.product.count({
        where: { tenantId: req.user.tenant.id }
      })
    ]);

    res.json({ 
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to get products' });
  }
});

// Get single product (Business Owner only)
router.get('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    // Optimize: Use tenant from authenticated user
    if (!req.user.tenant?.id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const product = await prisma.product.findFirst({
      where: {
        id: id,
        tenantId: req.user.tenant.id
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        sku: true,
        image: true,
        isActive: true,
        currentQuantity: true,
        currentRetailPrice: true,
        lastPurchasePrice: true,
        lastSalePrice: true,
        shippingQuantityRules: true,
        shippingDefaultQuantityCharge: true,
        useDefaultShipping: true,
        createdAt: true,
        updatedAt: true
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

// Create new product (Business Owner only)
router.post('/', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('name').trim().isLength({ min: 1 }),
  body('purchasePrice').optional().isFloat({ min: 0 }),
  body('sellingPrice').optional().isFloat({ min: 0 }),
  body('quantity').optional().isInt({ min: 0 }),
  body('currentRetailPrice').optional().isFloat({ min: 0 }),
  body('lastPurchasePrice').optional().isFloat({ min: 0 }),
  body('lastSalePrice').optional().isFloat({ min: 0 }),
  body('currentQuantity').optional().isInt({ min: 0 }),
  body('category').optional().trim(),
  body('sku').optional().trim(),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const {
      name,
      description,
      purchasePrice,
      sellingPrice,
      quantity,
      currentRetailPrice,
      lastPurchasePrice,
      lastSalePrice,
      currentQuantity,
      category,
      sku
    } = req.body;

    // Use transaction to create product and logs
    const result = await prisma.$transaction(async (tx) => {
      // Create the product
      const product = await tx.product.create({
        data: {
          name,
          description,
          category,
          sku,
          // Use new field names, with fallbacks to old names for backward compatibility
          currentRetailPrice: currentRetailPrice || sellingPrice || null,
          lastPurchasePrice: lastPurchasePrice || purchasePrice || null,
          lastSalePrice: lastSalePrice || null,
          currentQuantity: currentQuantity || quantity || 0,
          minStockLevel: 0,
          tenantId: tenant.id
        }
      });

      // Create logs for initial values
      const logs = [];

      // Log retail price if provided
      if (currentRetailPrice || sellingPrice) {
        logs.push({
          action: 'PRICE_UPDATE',
          oldPrice: null,
          newPrice: currentRetailPrice || sellingPrice,
          reason: 'Initial retail price set',
          reference: `Product: ${name}`,
          notes: `Retail price set to ${currentRetailPrice || sellingPrice} on creation`,
          tenantId: tenant.id,
          productId: product.id
        });
      }

      // Log purchase price if provided
      if (lastPurchasePrice || purchasePrice) {
        logs.push({
          action: 'PURCHASE_PRICE_UPDATE',
          oldPrice: null,
          newPrice: lastPurchasePrice || purchasePrice,
          reason: 'Initial purchase price set',
          reference: `Product: ${name}`,
          notes: `Purchase price set to ${lastPurchasePrice || purchasePrice} on creation`,
          tenantId: tenant.id,
          productId: product.id
        });
      }

      // Log sale price if provided
      if (lastSalePrice) {
        logs.push({
          action: 'SALE_PRICE_UPDATE',
          oldPrice: null,
          newPrice: lastSalePrice,
          reason: 'Initial sale price set',
          reference: `Product: ${name}`,
          notes: `Sale price set to ${lastSalePrice} on creation`,
          tenantId: tenant.id,
          productId: product.id
        });
      }

      // Log quantity if provided
      if (currentQuantity || quantity) {
        logs.push({
          action: 'QUANTITY_ADJUSTMENT',
          oldQuantity: 0,
          newQuantity: currentQuantity || quantity,
          quantity: currentQuantity || quantity,
          reason: 'Initial quantity set',
          reference: `Product: ${name}`,
          notes: `Initial quantity set to ${currentQuantity || quantity}`,
          tenantId: tenant.id,
          productId: product.id
        });
      }

      // Create all logs
      if (logs.length > 0) {
        await tx.productLog.createMany({
          data: logs
        });
      }

      return product;
    });

    res.status(201).json({
      message: 'Product created successfully',
      product: result
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product (Business Owner only) - Enhanced with logging
router.put('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('name').optional().trim().isLength({ min: 1 }),
  body('description').optional().trim(),
  body('category').optional().trim(),
  body('sku').optional().trim(),
  body('currentRetailPrice').optional().isFloat({ min: 0 }),
  body('lastPurchasePrice').optional().isFloat({ min: 0 }),
  body('lastSalePrice').optional().isFloat({ min: 0 }),
  body('currentQuantity').optional().isInt({ min: 0 }),
  body('minStockLevel').optional().isInt({ min: 0 }),
  body('maxStockLevel').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean(),
  body('shippingQuantityRules').optional(),
  body('shippingDefaultQuantityCharge').optional().custom((value) => {
    if (value === null || value === undefined) return true;
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
  }).withMessage('shippingDefaultQuantityCharge must be a number >= 0 or null'),
  body('useDefaultShipping').optional().isBoolean(),
  body('reason').optional().trim() // Reason for the change
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { reason, shippingQuantityRules, shippingDefaultQuantityCharge, useDefaultShipping, ...updateData } = req.body;

    // Handle shipping fields separately
    if (useDefaultShipping !== undefined) {
      updateData.useDefaultShipping = useDefaultShipping;
      
      // If using default shipping, clear product-specific rules and charge
      if (useDefaultShipping) {
        updateData.shippingQuantityRules = null;
        updateData.shippingDefaultQuantityCharge = null;
      } else {
        // If custom shipping, save the rules and default charge
        if (shippingQuantityRules !== undefined) {
          updateData.shippingQuantityRules = typeof shippingQuantityRules === 'string' 
            ? shippingQuantityRules 
            : JSON.stringify(shippingQuantityRules);
        }
        if (shippingDefaultQuantityCharge !== undefined) {
          updateData.shippingDefaultQuantityCharge = shippingDefaultQuantityCharge;
        }
      }
    } else {
      // If useDefaultShipping is not provided, handle individual fields
      if (shippingQuantityRules !== undefined) {
        updateData.shippingQuantityRules = typeof shippingQuantityRules === 'string' 
          ? shippingQuantityRules 
          : JSON.stringify(shippingQuantityRules);
      }
      if (shippingDefaultQuantityCharge !== undefined) {
        updateData.shippingDefaultQuantityCharge = shippingDefaultQuantityCharge;
      }
    }

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

    // Use transaction to update product and create logs
    const result = await prisma.$transaction(async (tx) => {
      // Update the product
      const updatedProduct = await tx.product.update({
        where: { id },
        data: {
          ...updateData,
          lastUpdated: new Date()
        }
      });

      // Create logs for each changed field
      const logs = [];
      
      // Track price changes
      if (updateData.currentRetailPrice !== undefined && 
          updateData.currentRetailPrice !== existingProduct.currentRetailPrice) {
        logs.push({
          action: 'PRICE_UPDATE',
          oldPrice: existingProduct.currentRetailPrice,
          newPrice: updateData.currentRetailPrice,
          reason: reason || 'Price updated',
          reference: `Product: ${existingProduct.name}`,
          notes: `Retail price changed from ${existingProduct.currentRetailPrice || 'N/A'} to ${updateData.currentRetailPrice}`,
          tenantId: tenant.id,
          productId: id
        });
      }

      if (updateData.lastPurchasePrice !== undefined && 
          updateData.lastPurchasePrice !== existingProduct.lastPurchasePrice) {
        logs.push({
          action: 'PURCHASE_PRICE_UPDATE',
          oldPrice: existingProduct.lastPurchasePrice,
          newPrice: updateData.lastPurchasePrice,
          reason: reason || 'Purchase price updated',
          reference: `Product: ${existingProduct.name}`,
          notes: `Purchase price changed from ${existingProduct.lastPurchasePrice || 'N/A'} to ${updateData.lastPurchasePrice}`,
          tenantId: tenant.id,
          productId: id
        });
      }

      // Track sale price changes
      if (updateData.lastSalePrice !== undefined && 
          updateData.lastSalePrice !== existingProduct.lastSalePrice) {
        logs.push({
          action: 'SALE_PRICE_UPDATE',
          oldPrice: existingProduct.lastSalePrice,
          newPrice: updateData.lastSalePrice,
          reason: reason || 'Sale price updated',
          reference: `Product: ${existingProduct.name}`,
          notes: `Sale price changed from ${existingProduct.lastSalePrice || 'N/A'} to ${updateData.lastSalePrice}`,
          tenantId: tenant.id,
          productId: id
        });
      }

      // Track quantity changes
      if (updateData.currentQuantity !== undefined && 
          updateData.currentQuantity !== existingProduct.currentQuantity) {
        logs.push({
          action: 'QUANTITY_ADJUSTMENT',
          oldQuantity: existingProduct.currentQuantity,
          newQuantity: updateData.currentQuantity,
          quantity: updateData.currentQuantity - existingProduct.currentQuantity,
          reason: reason || 'Quantity adjusted',
          reference: `Product: ${existingProduct.name}`,
          notes: `Quantity changed from ${existingProduct.currentQuantity} to ${updateData.currentQuantity}`,
          tenantId: tenant.id,
          productId: id
        });
      }

      // Track stock level changes
      if (updateData.minStockLevel !== undefined && 
          updateData.minStockLevel !== existingProduct.minStockLevel) {
        logs.push({
          action: 'MIN_STOCK_UPDATE',
          reason: reason || 'Minimum stock level updated',
          reference: `Product: ${existingProduct.name}`,
          notes: `Min stock level changed from ${existingProduct.minStockLevel} to ${updateData.minStockLevel}`,
          tenantId: tenant.id,
          productId: id
        });
      }

      if (updateData.maxStockLevel !== undefined && 
          updateData.maxStockLevel !== existingProduct.maxStockLevel) {
        logs.push({
          action: 'MAX_STOCK_UPDATE',
          reason: reason || 'Maximum stock level updated',
          reference: `Product: ${existingProduct.name}`,
          notes: `Max stock level changed from ${existingProduct.maxStockLevel || 'N/A'} to ${updateData.maxStockLevel}`,
          tenantId: tenant.id,
          productId: id
        });
      }

      // Track general product info changes
      const infoChanges = [];
      if (updateData.name && updateData.name !== existingProduct.name) {
        infoChanges.push(`Name: "${existingProduct.name}" → "${updateData.name}"`);
      }
      if (updateData.description !== undefined && updateData.description !== existingProduct.description) {
        infoChanges.push(`Description: "${existingProduct.description || 'N/A'}" → "${updateData.description || 'N/A'}"`);
      }
      if (updateData.category !== undefined && updateData.category !== existingProduct.category) {
        infoChanges.push(`Category: "${existingProduct.category || 'N/A'}" → "${updateData.category || 'N/A'}"`);
      }
      if (updateData.sku !== undefined && updateData.sku !== existingProduct.sku) {
        infoChanges.push(`SKU: "${existingProduct.sku || 'N/A'}" → "${updateData.sku || 'N/A'}"`);
      }
      if (updateData.isActive !== undefined && updateData.isActive !== existingProduct.isActive) {
        infoChanges.push(`Status: ${existingProduct.isActive ? 'Active' : 'Inactive'} → ${updateData.isActive ? 'Active' : 'Inactive'}`);
      }

      if (infoChanges.length > 0) {
        logs.push({
          action: 'INFO_UPDATE',
          reason: reason || 'Product information updated',
          reference: `Product: ${existingProduct.name}`,
          notes: infoChanges.join(', '),
          tenantId: tenant.id,
          productId: id
        });
      }

      // Create all logs
      if (logs.length > 0) {
        await tx.productLog.createMany({
          data: logs
        });
      }

      return updatedProduct;
    });

    console.log(`✅ Product updated: ${existingProduct.name} (${id})`);

    res.json({
      message: 'Product updated successfully',
      product: result
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Get product history (Business Owner only)
router.get('/:id/history', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
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

    // Get product logs
    const logs = await prisma.productLog.findMany({
      where: {
        productId: id,
        tenantId: tenant.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ logs });
  } catch (error) {
    console.error('Get product history error:', error);
    res.status(500).json({ error: 'Failed to get product history' });
  }
});

// Delete product (Business Owner only)
router.delete('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
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

    await prisma.product.delete({
      where: { id }
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Bulk create products from invoice data (Business Owner only)
router.post('/bulk', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('products').isArray({ min: 1 }),
  body('products.*.name').trim().isLength({ min: 1 }),
  body('products.*.purchasePrice').isFloat({ min: 0 }),
  body('products.*.quantity').isInt({ min: 0 })
], async (req, res) => {
  try {
    console.log('Bulk products request received:', {
      body: req.body,
      user: req.user
    });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { products } = req.body;

    // Create products in a transaction
    const createdProducts = await prisma.$transaction(
      products.map(product => 
        prisma.product.create({
          data: {
            name: product.name,
            description: product.description || null,
            category: product.category || null,
            sku: product.sku || null,
            // Use new field names with fallbacks for backward compatibility
            currentRetailPrice: product.currentRetailPrice || product.sellingPrice || null,
            lastPurchasePrice: product.lastPurchasePrice || product.purchasePrice || null,
            lastSalePrice: product.lastSalePrice || null,
            currentQuantity: product.currentQuantity || product.quantity || 0,
            minStockLevel: 0,
            tenantId: tenant.id
          }
        })
      )
    );

    res.status(201).json({
      message: `${createdProducts.length} products created successfully`,
      products: createdProducts
    });
  } catch (error) {
    console.error('Bulk create products error:', error);
    res.status(500).json({ error: 'Failed to create products' });
  }
});

module.exports = router;
