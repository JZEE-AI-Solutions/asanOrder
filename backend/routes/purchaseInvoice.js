const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const InventoryService = require('../services/inventoryService');
const profitService = require('../services/profitService');
const { generateInvoiceNumber } = require('../utils/invoiceNumberGenerator');

const router = express.Router();

// Test endpoint to check authentication
router.get('/test-auth', authenticateToken, requireRole(['BUSINESS_OWNER']), (req, res) => {
  res.json({ 
    message: 'Authentication working', 
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

// Create purchase invoice with products (Business Owner only)
router.post('/with-products', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('invoiceNumber').optional().trim(),
  body('invoiceDate').isISO8601(),
  body('totalAmount').isFloat({ min: 0 }),
  body('products').isArray({ min: 1 }),
  body('products.*.name').trim().notEmpty(),
  body('products.*.purchasePrice').isFloat({ min: 0 }),
  body('products.*.quantity').isInt({ min: 1 }),
  body('supplierName').optional().trim(),
  body('notes').optional().trim()
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

    let { invoiceNumber, invoiceDate, totalAmount, products, supplierName, notes } = req.body;

    // Auto-generate invoice number if not provided
    if (!invoiceNumber || invoiceNumber.trim() === '') {
      invoiceNumber = await generateInvoiceNumber(tenant.id);
    }

    // Check if invoice number already exists
    const existingInvoice = await prisma.purchaseInvoice.findFirst({
      where: {
        invoiceNumber: invoiceNumber,
        tenantId: tenant.id,
        isDeleted: false
      }
    });

    if (existingInvoice) {
      return res.status(400).json({ error: 'Invoice number already exists' });
    }

    // Create purchase invoice with products in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the purchase invoice
      const purchaseInvoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber: invoiceNumber,
          supplierName: supplierName || null,
          invoiceDate: new Date(invoiceDate),
          totalAmount: totalAmount,
          notes: notes || null,
          tenantId: tenant.id
        }
      });

      // Create purchase items using createMany for better performance
      const purchaseItemsData = products.map((product) => ({
        name: product.name,
        description: product.description || null,
        purchasePrice: product.purchasePrice,
        quantity: product.quantity,
        category: product.category || null,
        sku: product.sku || null,
        image: product.image || null,
        imageData: product.imageData || null,
        imageType: product.imageType || null,
        tenantId: tenant.id,
        purchaseInvoiceId: purchaseInvoice.id
      }));

      // Use createMany instead of individual creates
      await tx.purchaseItem.createMany({
        data: purchaseItemsData
      });

      // Get the created purchase items
      const purchaseItems = await tx.purchaseItem.findMany({
        where: { purchaseInvoiceId: purchaseInvoice.id }
      });

      return { purchaseInvoice, purchaseItems };
    }, {
      timeout: 30000, // 30 seconds timeout
      maxWait: 10000  // 10 seconds max wait
    });

    // Update inventory using the inventory service (outside transaction)
    await InventoryService.updateInventoryFromPurchase(
      tenant.id,
      result.purchaseItems,
      result.purchaseInvoice.id,
      invoiceNumber
    );

    res.status(201).json({
      message: 'Purchase invoice created successfully',
      invoice: result.purchaseInvoice,
      items: result.purchaseItems
    });

  } catch (error) {
    console.error('Create purchase invoice with products error:', error);
    res.status(500).json({ error: 'Failed to create purchase invoice' });
  }
});

// Get all purchase invoices for a tenant (Business Owner only)
router.get('/', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    // Optimize: Use tenant from authenticated user
    if (!req.user.tenant?.id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { includeDeleted, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));
    const skipNum = (pageNum - 1) * limitNum;

    const whereClause = { tenantId: req.user.tenant.id };
    
    // Only include non-deleted invoices by default
    if (includeDeleted !== 'true') {
      whereClause.isDeleted = false;
    }

    // Optimize: Add pagination, use select instead of include, limit purchaseItems
    const [purchaseInvoices, total] = await Promise.all([
      prisma.purchaseInvoice.findMany({
        where: whereClause,
        select: {
          id: true,
          invoiceNumber: true,
          supplierName: true,
          invoiceDate: true,
          totalAmount: true,
          image: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          isDeleted: true,
          deletedAt: true,
          // Only get count of items, not all items (unless needed)
          _count: {
            select: {
              purchaseItems: true
            }
          }
        },
        orderBy: {
          invoiceDate: 'desc'
        },
        skip: skipNum,
        take: limitNum
      }),
      prisma.purchaseInvoice.count({ where: whereClause })
    ]);

    res.json({ 
      success: true, 
      purchaseInvoices,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Get purchase invoices error:', error);
    res.status(500).json({ error: 'Failed to get purchase invoices' });
  }
});

// Get single purchase invoice by ID (Business Owner only)
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

    const purchaseInvoice = await prisma.purchaseInvoice.findFirst({
      where: {
        id: id,
        tenantId: tenant.id
      },
      include: {
        purchaseItems: {
          select: {
            id: true,
            name: true,
            description: true,
            purchasePrice: true,
            quantity: true,
            category: true,
            sku: true,
            image: true,
            // Exclude imageData and imageType - frontend uses getImageUrl() to fetch images
            isDeleted: true,
            deletedAt: true,
            createdAt: true,
            updatedAt: true,
            tenantId: true,
            purchaseInvoiceId: true,
            productId: true
          }
        },
        _count: {
          select: {
            purchaseItems: true
          }
        }
      }
    });

    if (!purchaseInvoice) {
      return res.status(404).json({ error: 'Purchase invoice not found' });
    }

    // Calculate profit for this invoice
    let profitData = null;
    try {
      profitData = await profitService.calculatePurchaseInvoiceProfit(id, tenant.id);
    } catch (error) {
      console.error('Error calculating profit:', error);
      // Don't fail the request if profit calculation fails
    }

    res.json({ 
      purchaseInvoice,
      profit: profitData
    });
  } catch (error) {
    console.error('Get purchase invoice error:', error);
    res.status(500).json({ error: 'Failed to get purchase invoice' });
  }
});

// Get profit statistics for purchase invoices
router.get('/profit/stats', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { startDate, endDate } = req.query;

    const profitStats = await profitService.getPurchaseInvoicesProfit(tenant.id, {
      startDate,
      endDate
    });

    res.json({
      success: true,
      ...profitStats
    });
  } catch (error) {
    console.error('Get purchase invoices profit stats error:', error);
    res.status(500).json({ error: 'Failed to get purchase invoices profit statistics' });
  }
});

// Create new purchase invoice (Business Owner only)
router.post('/', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('invoiceNumber').trim().isLength({ min: 1 }),
  body('invoiceDate').isISO8601(),
  body('totalAmount').isFloat({ min: 0 }),
  body('supplierName').optional().trim(),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { 
      invoiceNumber, 
      invoiceDate, 
      totalAmount, 
      supplierName, 
      notes,
      items = []
    } = req.body;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Create the purchase invoice
      const purchaseInvoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber,
          invoiceDate: new Date(invoiceDate),
          totalAmount: parseFloat(totalAmount),
          supplierName: supplierName || null,
          notes: notes || null,
          tenantId: tenant.id
        }
      });

      // Create purchase items and products if items are provided
      if (items && items.length > 0) {
        // Prepare purchase items data
        const purchaseItemsData = items.map(item => ({
          name: item.name,
          description: item.description || null,
          purchasePrice: parseFloat(item.purchasePrice),
          quantity: parseInt(item.quantity),
          category: item.category || null,
          sku: item.sku || null,
          image: item.image || null,
          tenantId: tenant.id,
          purchaseInvoiceId: purchaseInvoice.id
        }));

        // Use createMany for better performance with large batches
        const createdPurchaseItems = await tx.purchaseItem.createMany({
          data: purchaseItemsData
        });

        // Fetch the created items to return them
        const createdItems = await tx.purchaseItem.findMany({
          where: { purchaseInvoiceId: purchaseInvoice.id },
          select: {
            id: true,
            name: true,
            description: true,
            purchasePrice: true,
            quantity: true,
            category: true,
            sku: true,
            image: true,
            // Exclude imageData and imageType - frontend uses getImageUrl() to fetch images
            tenantId: true,
            purchaseInvoiceId: true
          }
        });

        // Create products for each purchase item using createMany
        const productsData = items.map(item => ({
          name: item.name,
          description: item.description || null,
          category: item.category || null,
          sku: item.sku || null,
          currentQuantity: parseInt(item.quantity),
          lastPurchasePrice: parseFloat(item.purchasePrice),
          tenantId: tenant.id
        }));

        await tx.product.createMany({
          data: productsData
        });

        // Get the created products
        const products = await tx.product.findMany({
          where: { 
            tenantId: tenant.id,
            name: { in: items.map(item => item.name) }
          },
          orderBy: { createdAt: 'desc' },
          take: items.length
        });

        // Link purchase items to products
        await Promise.all(createdItems.map(async (item, index) => {
          if (products[index]) {
            await tx.purchaseItem.update({
              where: { id: item.id },
              data: { productId: products[index].id }
            });
          }
        }));

        return { purchaseInvoice, items: createdItems };
      }

      return { purchaseInvoice, items: [] };
    }, {
      timeout: 30000, // 30 seconds timeout
      maxWait: 10000  // 10 seconds max wait
    });

    res.status(201).json({
      success: true,
      message: 'Purchase invoice created successfully',
      purchaseInvoice: result.purchaseInvoice,
      items: result.items
    });

  } catch (error) {
    console.error('Create purchase invoice error:', error);
    res.status(500).json({ error: 'Failed to create purchase invoice' });
  }
});

// Update purchase invoice (Business Owner only)
router.put('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('invoiceNumber').optional().trim().isLength({ min: 1 }),
  body('invoiceDate').optional().isISO8601(),
  body('totalAmount').optional().isFloat({ min: 0 }),
  body('supplierName').optional().trim(),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { id } = req.params;
    const { invoiceNumber, invoiceDate, totalAmount, supplierName, notes } = req.body;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if invoice exists and belongs to tenant
    const existingInvoice = await prisma.purchaseInvoice.findFirst({
      where: {
        id: id,
        tenantId: tenant.id
      }
    });

    if (!existingInvoice) {
      return res.status(404).json({ error: 'Purchase invoice not found' });
    }

    // Update the invoice
    const updatedInvoice = await prisma.purchaseInvoice.update({
      where: { id: id },
      data: {
        ...(invoiceNumber && { invoiceNumber }),
        ...(invoiceDate && { invoiceDate: new Date(invoiceDate) }),
        ...(totalAmount && { totalAmount: parseFloat(totalAmount) }),
        ...(supplierName !== undefined && { supplierName: supplierName || null }),
        ...(notes !== undefined && { notes: notes || null })
      }
    });

    res.json({
      success: true,
      message: 'Purchase invoice updated successfully',
      purchaseInvoice: updatedInvoice
    });

  } catch (error) {
    console.error('Update purchase invoice error:', error);
    res.status(500).json({ error: 'Failed to update purchase invoice' });
  }
});

// Soft delete purchase invoice (Business Owner only)
router.delete('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if invoice exists and belongs to tenant
    const existingInvoice = await prisma.purchaseInvoice.findFirst({
      where: {
        id: id,
        tenantId: tenant.id
      }
    });

    if (!existingInvoice) {
      return res.status(404).json({ error: 'Purchase invoice not found' });
    }

    // Use transaction to ensure data consistency
    await prisma.$transaction(async (tx) => {
      // Soft delete the invoice
      await tx.purchaseInvoice.update({
        where: { id: id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: req.user.id,
          deleteReason: reason || 'Deleted by business owner'
        }
      });

      // Soft delete all associated purchase items
      await tx.purchaseItem.updateMany({
        where: { purchaseInvoiceId: id },
        data: {
          isDeleted: true,
          deletedAt: new Date()
        }
      });
    }, {
      timeout: 10000, // 10 seconds timeout
      maxWait: 5000   // 5 seconds max wait
    });

    res.json({
      success: true,
      message: 'Purchase invoice deleted successfully'
    });

  } catch (error) {
    console.error('Delete purchase invoice error:', error);
    res.status(500).json({ error: 'Failed to delete purchase invoice' });
  }
});

// Restore soft deleted purchase invoice (Business Owner only)
router.post('/:id/restore', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if invoice exists and belongs to tenant
    const existingInvoice = await prisma.purchaseInvoice.findFirst({
      where: {
        id: id,
        tenantId: tenant.id
      }
    });

    if (!existingInvoice) {
      return res.status(404).json({ error: 'Purchase invoice not found' });
    }

    // Use transaction to ensure data consistency
    await prisma.$transaction(async (tx) => {
      // Restore the invoice
      await tx.purchaseInvoice.update({
        where: { id: id },
        data: {
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          deleteReason: null
        }
      });

      // Restore all associated purchase items
      await tx.purchaseItem.updateMany({
        where: { purchaseInvoiceId: id },
        data: {
          isDeleted: false,
          deletedAt: null
        }
      });
    }, {
      timeout: 10000, // 10 seconds timeout
      maxWait: 5000   // 5 seconds max wait
    });

    res.json({
      success: true,
      message: 'Purchase invoice restored successfully'
    });

  } catch (error) {
    console.error('Restore purchase invoice error:', error);
    res.status(500).json({ error: 'Failed to restore purchase invoice' });
  }
});

module.exports = router;