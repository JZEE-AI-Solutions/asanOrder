const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const InventoryService = require('../services/inventoryService');
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

// Get all purchase invoices for a tenant (Business Owner only)
router.get('/', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { includeDeleted } = req.query;
    const whereClause = { tenantId: tenant.id };
    
    // Only include non-deleted invoices by default
    if (includeDeleted !== 'true') {
      whereClause.isDeleted = false;
    }

    const purchaseInvoices = await prisma.purchaseInvoice.findMany({
      where: whereClause,
      include: {
        purchaseItems: {
          where: {
            isDeleted: false
          },
          select: {
            id: true,
            name: true,
            purchasePrice: true,
            quantity: true,
            category: true
          }
        },
        _count: {
          select: {
            purchaseItems: {
              where: {
                isDeleted: false
              }
            }
          }
        }
      },
      orderBy: { invoiceDate: 'desc' }
    });

    res.json({ purchaseInvoices });
  } catch (error) {
    console.error('Get purchase invoices error:', error);
    res.status(500).json({ error: 'Failed to get purchase invoices' });
  }
});

// Get single purchase invoice with products (Business Owner only)
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
        purchaseItems: true,
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

    res.json({ purchaseInvoice });
  } catch (error) {
    console.error('Get purchase invoice error:', error);
    res.status(500).json({ error: 'Failed to get purchase invoice' });
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
      invoiceNumber,
      supplierName,
      invoiceDate,
      totalAmount,
      image,
      notes
    } = req.body;

    const purchaseInvoice = await prisma.purchaseInvoice.create({
      data: {
        invoiceNumber,
        supplierName,
        invoiceDate: new Date(invoiceDate),
        totalAmount,
        image,
        notes,
        tenantId: tenant.id
      }
    });

    res.status(201).json({
      message: 'Purchase invoice created successfully',
      purchaseInvoice
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

    // Check if purchase invoice exists and belongs to tenant
    const existingInvoice = await prisma.purchaseInvoice.findFirst({
      where: {
        id: id,
        tenantId: tenant.id
      }
    });

    if (!existingInvoice) {
      return res.status(404).json({ error: 'Purchase invoice not found' });
    }

    const updateData = { ...req.body };
    if (updateData.invoiceDate) {
      updateData.invoiceDate = new Date(updateData.invoiceDate);
    }

    const purchaseInvoice = await prisma.purchaseInvoice.update({
      where: { id },
      data: updateData,
      include: {
        products: true,
        _count: {
          select: {
            products: true
          }
        }
      }
    });

    res.json({
      message: 'Purchase invoice updated successfully',
      purchaseInvoice
    });
  } catch (error) {
    console.error('Update purchase invoice error:', error);
    res.status(500).json({ error: 'Failed to update purchase invoice' });
  }
});

// Delete purchase invoice (Business Owner only)
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

    // Check if purchase invoice exists and belongs to tenant
    const existingInvoice = await prisma.purchaseInvoice.findFirst({
      where: {
        id: id,
        tenantId: tenant.id
      }
    });

    if (!existingInvoice) {
      return res.status(404).json({ error: 'Purchase invoice not found' });
    }

    // Use inventory service to properly delete the invoice
    const results = await InventoryService.deletePurchaseInvoice(
      tenant.id,
      id,
      existingInvoice.invoiceNumber
    );

    res.json({ 
      message: 'Purchase invoice deleted successfully',
      results: results
    });
  } catch (error) {
    console.error('Delete purchase invoice error:', error);
    res.status(500).json({ error: 'Failed to delete purchase invoice' });
  }
});

// Restore soft-deleted purchase invoice (Business Owner only)
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

    // Check if soft-deleted purchase invoice exists and belongs to tenant
    const existingInvoice = await prisma.purchaseInvoice.findFirst({
      where: {
        id: id,
        tenantId: tenant.id,
        isDeleted: true
      }
    });

    if (!existingInvoice) {
      return res.status(404).json({ error: 'Deleted purchase invoice not found' });
    }

    // Use inventory service to properly restore the invoice
    const results = await InventoryService.restorePurchaseInvoice(
      tenant.id,
      id,
      existingInvoice.invoiceNumber
    );

    res.json({ 
      message: 'Purchase invoice restored successfully',
      results: results
    });
  } catch (error) {
    console.error('Restore purchase invoice error:', error);
    res.status(500).json({ error: 'Failed to restore purchase invoice' });
  }
});

// Create purchase invoice with products (for bulk import)
router.post('/with-products', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('invoiceNumber').optional().trim().isLength({ min: 1 }),
  body('invoiceDate').isISO8601(),
  body('totalAmount').isFloat({ min: 0 }),
  body('products').isArray({ min: 1 }),
  body('products.*.name').trim().isLength({ min: 1 }),
  body('products.*.purchasePrice').isFloat({ min: 0 }),
  body('products.*.quantity').isInt({ min: 0 })
], async (req, res) => {
  try {
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

    const {
      invoiceNumber,
      supplierName,
      invoiceDate,
      totalAmount,
      image,
      notes,
      products
    } = req.body;

    // Generate invoice number if not provided
    const finalInvoiceNumber = invoiceNumber || await generateInvoiceNumber(tenant.id);

    // Create purchase invoice and purchase items in a transaction with increased timeout
    const result = await prisma.$transaction(async (tx) => {
      // Create purchase invoice
      const purchaseInvoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber: finalInvoiceNumber,
          supplierName,
          invoiceDate: new Date(invoiceDate),
          totalAmount,
          image,
          notes,
          tenantId: tenant.id
        }
      });

      // Create purchase items using createMany for better performance
      const purchaseItemsData = products.map(product => ({
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

      // Use createMany for better performance with large batches
      const createdPurchaseItems = await tx.purchaseItem.createMany({
        data: purchaseItemsData
      });

      // Fetch the created items to return them
      const createdItems = await tx.purchaseItem.findMany({
        where: {
          purchaseInvoiceId: purchaseInvoice.id,
          tenantId: tenant.id
        }
      });

      return { purchaseInvoice, purchaseItems: createdItems };
    }, {
      timeout: 30000, // Increase timeout to 30 seconds
      maxWait: 10000, // Maximum time to wait for a transaction slot
    });

    // Update inventory using the inventory service
    try {
      const inventoryResult = await InventoryService.updateInventoryFromPurchase(
        tenant.id,
        products,
        result.purchaseInvoice.id,
        invoiceNumber
      );
      
      console.log('Inventory update result:', inventoryResult);
    } catch (inventoryError) {
      console.error('Inventory update failed:', inventoryError);
      // Don't fail the entire request if inventory update fails
    }

    res.status(201).json({
      message: 'Purchase invoice and products created successfully',
      purchaseInvoice: result.purchaseInvoice,
      purchaseItems: result.purchaseItems,
      count: result.purchaseItems.length
    });
  } catch (error) {
    console.error('Create purchase invoice with products error:', error);
    res.status(500).json({ error: 'Failed to create purchase invoice with products' });
  }
});

module.exports = router;
