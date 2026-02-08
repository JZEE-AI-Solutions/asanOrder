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

    // Try to fetch with variant fields, fallback if migration not run
    let products, total;
    let hasVariantSupport = false;
    
    try {
      [products, total] = await Promise.all([
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
            isStitched: true,
            hasVariants: true,
            createdAt: true,
            updatedAt: true,
            productImages: {
              where: { isPrimary: true },
              orderBy: { createdAt: 'asc' },
              select: { id: true, mediaType: true },
              take: 1
            },
            variants: {
              select: {
                id: true,
                color: true,
                size: true,
                sku: true,
                currentQuantity: true,
                isActive: true,
                images: {
                  where: { isPrimary: true },
                  select: {
                    id: true,
                    imageType: true
                  },
                  take: 1
                }
              },
              orderBy: [
                { color: 'asc' },
                { size: 'asc' }
              ]
            },
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
      hasVariantSupport = true;
    } catch (error) {
      const isColumnError = error.code === 'P2021' || error.code === 'P2022' || error.code === 'P2010' ||
                           error.message?.includes('column') || error.message?.includes('does not exist') ||
                           error.message?.includes('Unknown column') || error.message?.includes('product_images') ||
                           error.meta?.target?.includes('isStitched') || error.meta?.target?.includes('hasVariants') ||
                           error.meta?.target?.includes('variants') || error.meta?.target?.includes('productImages');

      if (isColumnError) {
        console.log('Variant columns not found, using fallback query. Error:', error.code, error.message);
        [products, total] = await Promise.all([
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
        hasVariantSupport = false;
      } else {
        throw error;
      }
    }

    // Add variant summary to each product
    const productsWithVariants = products.map(product => {
      let totalVariantStock = 0;
      let variantCount = 0;
      let isStitched = false;
      let hasVariants = false;
      let variants = [];
      
      if (hasVariantSupport) {
        if (product.variants && product.variants.length > 0) {
          totalVariantStock = product.variants.reduce((sum, v) => sum + (v.currentQuantity || 0), 0);
          variantCount = product.variants.length;
          variants = product.variants;
          hasVariants = true;
        } else {
          hasVariants = product.hasVariants || false;
        }
        isStitched = product.isStitched || false;
      }
      
      return {
        ...product,
        isStitched: isStitched,
        hasVariants: hasVariants,
        variantCount: variantCount,
        totalVariantStock: hasVariants ? totalVariantStock : null,
        variants: hasVariants ? variants : []
      };
    });

    res.json({ 
      products: productsWithVariants,
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
      include: {
        productImages: {
          orderBy: [
            { isPrimary: 'desc' },
            { sortOrder: 'asc' },
            { createdAt: 'asc' }
          ]
        },
        variants: {
          include: {
            images: {
              orderBy: [
                { isPrimary: 'desc' },
                { sortOrder: 'asc' }
              ]
            }
          },
          orderBy: [
            { color: 'asc' },
            { size: 'asc' }
          ]
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Calculate total variant stock if product has variants
    let totalVariantStock = 0;
    if (product.hasVariants && product.variants) {
      totalVariantStock = product.variants.reduce((sum, variant) => sum + variant.currentQuantity, 0);
    }

    res.json({ 
      product: {
        ...product,
        totalVariantStock: product.hasVariants ? totalVariantStock : null
      }
    });
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
  body('description').optional().trim(),
  body('isStitched').optional().isBoolean(),
  body('hasVariants').optional().isBoolean()
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
      sku,
      isStitched,
      hasVariants
    } = req.body;

    // Use transaction to create product and logs
    const result = await prisma.$transaction(async (tx) => {
      // Create the product
      const purchasePriceVal = lastPurchasePrice ?? purchasePrice ?? null;
      const defaultMarkup = purchasePriceVal != null && purchasePriceVal > 0 ? purchasePriceVal * 1.5 : null; // 50% increase when only purchase price provided
      const product = await tx.product.create({
        data: {
          name,
          description,
          category,
          sku,
          // Use new field names; default retail/sale to 50% markup on purchase price when not provided
          currentRetailPrice: currentRetailPrice ?? sellingPrice ?? defaultMarkup,
          lastPurchasePrice: purchasePriceVal,
          lastSalePrice: lastSalePrice ?? defaultMarkup,
          currentQuantity: currentQuantity || quantity || 0,
          minStockLevel: 0,
          isStitched: isStitched || false,
          hasVariants: hasVariants || false,
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
  body('isStitched').optional().isBoolean(),
  body('hasVariants').optional().isBoolean(),
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
      include: {
        productVariant: {
          select: {
            id: true,
            color: true,
            size: true,
            sku: true
          }
        },
        purchaseItem: {
          select: {
            id: true,
            name: true,
            purchaseInvoice: {
              select: {
                invoiceNumber: true
              }
            }
          }
        }
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

// ==================== PRODUCT VARIANT ENDPOINTS ====================

// Get all variants for a product
router.get('/:id/variants', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user.tenant?.id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if product exists and belongs to tenant
    const product = await prisma.product.findFirst({
      where: {
        id: id,
        tenantId: req.user.tenant.id
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const variants = await prisma.productVariant.findMany({
      where: {
        productId: id
      },
      include: {
        images: {
          orderBy: [
            { isPrimary: 'desc' },
            { sortOrder: 'asc' }
          ]
        }
      },
      orderBy: [
        { color: 'asc' },
        { size: 'asc' }
      ]
    });

    res.json({ variants });
  } catch (error) {
    console.error('Get variants error:', error);
    res.status(500).json({ error: 'Failed to get variants' });
  }
});

// Create variant for a product
router.post('/:id/variants', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('color').trim().isLength({ min: 1 }).withMessage('Color is required'),
  body('size').optional().trim(),
  body('sku').optional().trim(),
  body('currentQuantity').optional().isInt({ min: 0 }),
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
    const { color, size, sku, currentQuantity, minStockLevel, maxStockLevel, isActive } = req.body;

    if (!req.user.tenant?.id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if product exists and belongs to tenant
    const product = await prisma.product.findFirst({
      where: {
        id: id,
        tenantId: req.user.tenant.id
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Validate: If product is stitched, size is required
    if (product.isStitched && !size) {
      return res.status(400).json({ error: 'Size is required for stitched products' });
    }

    // Auto-generate SKU if not provided
    let variantSku = sku;
    if (!variantSku && product.sku) {
      variantSku = size 
        ? `${product.sku}-${color}-${size}`.toUpperCase()
        : `${product.sku}-${color}`.toUpperCase();
    }

    // Check for duplicate color+size combination
    const existingVariant = await prisma.productVariant.findFirst({
      where: {
        productId: id,
        color: color,
        size: size || null
      }
    });

    if (existingVariant) {
      return res.status(400).json({ 
        error: `Variant with color "${color}" and size "${size || 'N/A'}" already exists` 
      });
    }

    // Check for duplicate SKU if provided
    if (variantSku) {
      const existingSku = await prisma.productVariant.findFirst({
        where: { sku: variantSku }
      });

      if (existingSku) {
        return res.status(400).json({ error: `SKU "${variantSku}" already exists` });
      }
    }

    const variant = await prisma.productVariant.create({
      data: {
        productId: id,
        color: color.trim(),
        size: size ? size.trim() : null,
        sku: variantSku || null,
        currentQuantity: currentQuantity || 0,
        minStockLevel: minStockLevel || 0,
        maxStockLevel: maxStockLevel || null,
        isActive: isActive !== undefined ? isActive : true
      },
      include: {
        images: true
      }
    });

    // Ensure product hasVariants is true when it has variants
    await prisma.product.update({
      where: { id },
      data: { hasVariants: true }
    });

    // Create product log for variant creation
    await prisma.productLog.create({
      data: {
        action: 'VARIANT_CREATED',
        reason: 'Variant created',
        reference: `Product: ${product.name}`,
        notes: `Variant created: Color: ${color}, Size: ${size || 'N/A'}, SKU: ${variantSku || 'N/A'}`,
        tenantId: req.user.tenant.id,
        productId: id,
        productVariantId: variant.id
      }
    });

    res.status(201).json({
      message: 'Variant created successfully',
      variant
    });
  } catch (error) {
    console.error('Create variant error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Variant with this color and size combination already exists' });
    }
    res.status(500).json({ error: 'Failed to create variant' });
  }
});

// Update variant
router.put('/:id/variants/:variantId', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('color').optional().trim().isLength({ min: 1 }),
  body('size').optional().trim(),
  body('sku').optional().trim(),
  body('currentQuantity').optional().isInt({ min: 0 }),
  body('minStockLevel').optional().isInt({ min: 0 }),
  body('maxStockLevel').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id, variantId } = req.params;
    const updateData = req.body;

    if (!req.user.tenant?.id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if product exists and belongs to tenant
    const product = await prisma.product.findFirst({
      where: {
        id: id,
        tenantId: req.user.tenant.id
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if variant exists and belongs to product
    const existingVariant = await prisma.productVariant.findFirst({
      where: {
        id: variantId,
        productId: id
      }
    });

    if (!existingVariant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    // Validate: If product is stitched and size is being removed, reject
    if (product.isStitched && updateData.size === null) {
      return res.status(400).json({ error: 'Size cannot be removed for stitched products' });
    }

    // Check for duplicate color+size combination if color or size is being updated
    if (updateData.color || updateData.size !== undefined) {
      const newColor = updateData.color || existingVariant.color;
      const newSize = updateData.size !== undefined ? updateData.size : existingVariant.size;

      const duplicateVariant = await prisma.productVariant.findFirst({
        where: {
          productId: id,
          color: newColor,
          size: newSize || null,
          id: { not: variantId }
        }
      });

      if (duplicateVariant) {
        return res.status(400).json({ 
          error: `Variant with color "${newColor}" and size "${newSize || 'N/A'}" already exists` 
        });
      }
    }

    // Check for duplicate SKU if SKU is being updated
    if (updateData.sku && updateData.sku !== existingVariant.sku) {
      const existingSku = await prisma.productVariant.findFirst({
        where: {
          sku: updateData.sku,
          id: { not: variantId }
        }
      });

      if (existingSku) {
        return res.status(400).json({ error: `SKU "${updateData.sku}" already exists` });
      }
    }

    // Update variant
    const updatedVariant = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...updateData,
        updatedAt: new Date()
      },
      include: {
        images: {
          orderBy: [
            { isPrimary: 'desc' },
            { sortOrder: 'asc' }
          ]
        }
      }
    });

    // Create product log for variant update
    const changes = [];
    if (updateData.color && updateData.color !== existingVariant.color) {
      changes.push(`Color: ${existingVariant.color} → ${updateData.color}`);
    }
    if (updateData.size !== undefined && updateData.size !== existingVariant.size) {
      changes.push(`Size: ${existingVariant.size || 'N/A'} → ${updateData.size || 'N/A'}`);
    }
    if (updateData.currentQuantity !== undefined && updateData.currentQuantity !== existingVariant.currentQuantity) {
      changes.push(`Quantity: ${existingVariant.currentQuantity} → ${updateData.currentQuantity}`);
    }

    if (changes.length > 0) {
      await prisma.productLog.create({
        data: {
          action: 'VARIANT_UPDATED',
          oldQuantity: existingVariant.currentQuantity,
          newQuantity: updateData.currentQuantity !== undefined ? updateData.currentQuantity : existingVariant.currentQuantity,
          reason: 'Variant updated',
          reference: `Product: ${product.name}`,
          notes: `Variant updated: ${changes.join(', ')}`,
          tenantId: req.user.tenant.id,
          productId: id,
          productVariantId: variantId
        }
      });
    }

    res.json({
      message: 'Variant updated successfully',
      variant: updatedVariant
    });
  } catch (error) {
    console.error('Update variant error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Variant with this color and size combination already exists' });
    }
    res.status(500).json({ error: 'Failed to update variant' });
  }
});

// Delete variant
router.delete('/:id/variants/:variantId', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id, variantId } = req.params;

    if (!req.user.tenant?.id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if product exists and belongs to tenant
    const product = await prisma.product.findFirst({
      where: {
        id: id,
        tenantId: req.user.tenant.id
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if variant exists and belongs to product
    const existingVariant = await prisma.productVariant.findFirst({
      where: {
        id: variantId,
        productId: id
      }
    });

    if (!existingVariant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    // Delete variant (cascade will handle images)
    await prisma.productVariant.delete({
      where: { id: variantId }
    });

    // Create product log for variant deletion
    await prisma.productLog.create({
      data: {
        action: 'VARIANT_DELETED',
        reason: 'Variant deleted',
        reference: `Product: ${product.name}`,
        notes: `Variant deleted: Color: ${existingVariant.color}, Size: ${existingVariant.size || 'N/A'}`,
        tenantId: req.user.tenant.id,
        productId: id
      }
    });

    res.json({ message: 'Variant deleted successfully' });
  } catch (error) {
    console.error('Delete variant error:', error);
    res.status(500).json({ error: 'Failed to delete variant' });
  }
});

// Upload variant image
router.post('/:id/variants/:variantId/images', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('imageData').notEmpty().withMessage('Image data is required'),
  body('mimeType').notEmpty().withMessage('MIME type is required'),
  body('isPrimary').optional().isBoolean(),
  body('sortOrder').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id, variantId } = req.params;
    const { imageData, mimeType, isPrimary, sortOrder } = req.body;

    if (!req.user.tenant?.id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if product exists and belongs to tenant
    const product = await prisma.product.findFirst({
      where: {
        id: id,
        tenantId: req.user.tenant.id
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if variant exists and belongs to product
    const variant = await prisma.productVariant.findFirst({
      where: {
        id: variantId,
        productId: id
      }
    });

    if (!variant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageData, 'base64');

    // If this is set as primary, unset other primary images
    if (isPrimary) {
      await prisma.productVariantImage.updateMany({
        where: {
          productVariantId: variantId,
          isPrimary: true
        },
        data: {
          isPrimary: false
        }
      });
    }

    // Create variant image
    const variantImage = await prisma.productVariantImage.create({
      data: {
        productVariantId: variantId,
        imageData: imageBuffer,
        imageType: mimeType,
        isPrimary: isPrimary || false,
        sortOrder: sortOrder || 0
      }
    });

    res.status(201).json({
      message: 'Variant image uploaded successfully',
      image: {
        id: variantImage.id,
        isPrimary: variantImage.isPrimary,
        sortOrder: variantImage.sortOrder,
        createdAt: variantImage.createdAt
      }
    });
  } catch (error) {
    console.error('Upload variant image error:', error);
    res.status(500).json({ error: 'Failed to upload variant image' });
  }
});

// Update variant image (set primary, update sort order)
router.put('/:id/variants/:variantId/images/:imageId', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('isPrimary').optional().isBoolean(),
  body('sortOrder').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id, variantId, imageId } = req.params;
    const { isPrimary, sortOrder } = req.body;

    if (!req.user.tenant?.id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if product exists and belongs to tenant
    const product = await prisma.product.findFirst({
      where: {
        id: id,
        tenantId: req.user.tenant.id
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if variant exists and belongs to product
    const variant = await prisma.productVariant.findFirst({
      where: {
        id: variantId,
        productId: id
      }
    });

    if (!variant) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    // Check if image exists and belongs to variant
    const variantImage = await prisma.productVariantImage.findFirst({
      where: {
        id: imageId,
        productVariantId: variantId
      }
    });

    if (!variantImage) {
      return res.status(404).json({ error: 'Variant image not found' });
    }

    // If setting as primary, unset other primary images
    if (isPrimary === true) {
      await prisma.productVariantImage.updateMany({
        where: {
          productVariantId: variantId,
          isPrimary: true,
          id: { not: imageId }
        },
        data: {
          isPrimary: false
        }
      });
    }

    // Update the image
    const updateData = {};
    if (isPrimary !== undefined) {
      updateData.isPrimary = isPrimary;
    }
    if (sortOrder !== undefined) {
      updateData.sortOrder = sortOrder;
    }

    const updatedImage = await prisma.productVariantImage.update({
      where: { id: imageId },
      data: updateData
    });

    res.json({
      message: 'Variant image updated successfully',
      image: {
        id: updatedImage.id,
        isPrimary: updatedImage.isPrimary,
        sortOrder: updatedImage.sortOrder
      }
    });
  } catch (error) {
    console.error('Update variant image error:', error);
    res.status(500).json({ error: 'Failed to update variant image' });
  }
});

// List product media (photos/videos)
router.get('/:id/media', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.user.tenant?.id) return res.status(404).json({ error: 'Tenant not found' });
    const product = await prisma.product.findFirst({
      where: { id, tenantId: req.user.tenant.id },
      select: { id: true }
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const media = await prisma.productImage.findMany({
      where: { productId: id },
      orderBy: [ { isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' } ],
      select: { id: true, mediaType: true, isPrimary: true, sortOrder: true, createdAt: true }
    });
    res.json({ media });
  } catch (error) {
    console.error('List product media error:', error);
    res.status(500).json({ error: 'Failed to list product media' });
  }
});

// Set product media as primary
router.put('/:id/media/:imageId/primary', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id, imageId } = req.params;
    if (!req.user.tenant?.id) return res.status(404).json({ error: 'Tenant not found' });
    const product = await prisma.product.findFirst({
      where: { id, tenantId: req.user.tenant.id },
      select: { id: true }
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const media = await prisma.productImage.findFirst({
      where: { id: imageId, productId: id }
    });
    if (!media) return res.status(404).json({ error: 'Product media not found' });
    await prisma.$transaction([
      prisma.productImage.updateMany({
        where: { productId: id },
        data: { isPrimary: false }
      }),
      prisma.productImage.update({
        where: { id: imageId },
        data: { isPrimary: true }
      })
    ]);
    res.json({ message: 'Primary media updated', imageId });
  } catch (error) {
    console.error('Set product primary media error:', error);
    res.status(500).json({ error: 'Failed to set primary media' });
  }
});

module.exports = router;
