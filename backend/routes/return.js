const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { generateReturnNumber } = require('../utils/invoiceNumberGenerator');

const router = express.Router();

// Note: generateReturnNumber is now imported from utils/invoiceNumberGenerator.js

// Get all returns for a tenant (Business Owner only)
router.get('/', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const returns = await prisma.return.findMany({
      where: { tenantId: tenant.id },
      include: {
        returnItems: true,
        purchaseInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            supplierName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(returns);
  } catch (error) {
    console.error('Get returns error:', error);
    res.status(500).json({ error: 'Failed to fetch returns' });
  }
});

// Get a specific return by ID
router.get('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const returnRecord = await prisma.return.findFirst({
      where: { 
        id: req.params.id,
        tenantId: tenant.id 
      },
      include: {
        returnItems: true,
        purchaseInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            supplierName: true
          }
        }
      }
    });

    if (!returnRecord) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json(returnRecord);
  } catch (error) {
    console.error('Get return error:', error);
    res.status(500).json({ error: 'Failed to fetch return' });
  }
});

// Create a new return
router.post('/', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('reason').optional().trim(),
  body('returnDate').isISO8601(),
  body('totalAmount').isFloat({ min: 0 }),
  body('notes').optional().trim(),
  body('purchaseInvoiceId').optional().isString(),
  body('returnItems').isArray({ min: 1 }),
  body('returnItems.*.productName').trim().isLength({ min: 1 }),
  body('returnItems.*.purchasePrice').isFloat({ min: 0 }),
  body('returnItems.*.quantity').isInt({ min: 1 }),
  body('returnItems.*.reason').optional().trim(),
  body('returnItems.*.sku').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { reason, returnDate, totalAmount, notes, purchaseInvoiceId, returnItems } = req.body;

    // Generate return number
    const returnNumber = await generateReturnNumber(tenant.id);

    const result = await prisma.$transaction(async (tx) => {
      // Create the return
      const returnRecord = await tx.return.create({
        data: {
          returnNumber,
          reason,
          returnDate: new Date(returnDate),
          totalAmount,
          notes,
          tenantId: tenant.id,
          purchaseInvoiceId: purchaseInvoiceId || null
        }
      });

      // Create return items using createMany for better performance
      const returnItemsData = returnItems.map(item => ({
        productName: item.productName,
        description: item.description || null,
        purchasePrice: item.purchasePrice,
        quantity: item.quantity,
        reason: item.reason || null,
        sku: item.sku || null,
        returnId: returnRecord.id
      }));

      await tx.returnItem.createMany({
        data: returnItemsData
      });

      // Fetch the created items to return them
      const createdReturnItems = await tx.returnItem.findMany({
        where: { returnId: returnRecord.id }
      });

      return { returnRecord, returnItems: createdReturnItems };
    }, {
      timeout: 30000, // Increase timeout to 30 seconds
      maxWait: 10000, // Maximum time to wait for a transaction slot
    });

    res.status(201).json({
      message: 'Return created successfully',
      return: result.returnRecord,
      returnItems: result.returnItems
    });
  } catch (error) {
    console.error('Create return error:', error);
    res.status(500).json({ error: 'Failed to create return' });
  }
});

// Create return from invoice processing (with negative quantities)
router.post('/from-invoice', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('invoiceNumber').trim().isLength({ min: 1 }),
  body('invoiceDate').isISO8601(),
  body('totalAmount').isFloat({ min: 0 }),
  body('returnItems').isArray({ min: 1 }),
  body('returnItems.*.productName').trim().isLength({ min: 1 }),
  body('returnItems.*.purchasePrice').isFloat({ min: 0 }),
  body('returnItems.*.quantity').isInt({ min: 1 }),
  body('returnItems.*.reason').optional().trim(),
  body('returnItems.*.sku').optional().trim()
], async (req, res) => {
  try {
    console.log('Return from invoice request received:', {
      body: req.body,
      user: req.user
    });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { invoiceNumber, invoiceDate, totalAmount, returnItems } = req.body;

    // Find or create purchase invoice
    let purchaseInvoice = await prisma.purchaseInvoice.findFirst({
      where: { 
        invoiceNumber,
        tenantId: tenant.id 
      }
    });

    if (!purchaseInvoice) {
      purchaseInvoice = await prisma.purchaseInvoice.create({
        data: {
          invoiceNumber,
          invoiceDate: new Date(invoiceDate),
          totalAmount: 0, // This will be updated with return amount
          tenantId: tenant.id
        }
      });
    }

    // Generate return number
    const returnNumber = await generateReturnNumber(tenant.id);

    const result = await prisma.$transaction(async (tx) => {
      // Create the return
      const returnRecord = await tx.return.create({
        data: {
          returnNumber,
          reason: 'INVOICE_RETURN',
          returnDate: new Date(invoiceDate),
          totalAmount,
          notes: `Return processed from invoice ${invoiceNumber}`,
          tenantId: tenant.id,
          purchaseInvoiceId: purchaseInvoice.id
        }
      });

      // Create return items using createMany for better performance
      const returnItemsData = returnItems.map(item => ({
        productName: item.productName,
        description: item.description || null,
        purchasePrice: item.purchasePrice,
        quantity: item.quantity,
        reason: item.reason || 'INVOICE_RETURN',
        sku: item.sku || null,
        returnId: returnRecord.id
      }));

      await tx.returnItem.createMany({
        data: returnItemsData
      });

      // Fetch the created items to return them
      const createdReturnItems = await tx.returnItem.findMany({
        where: { returnId: returnRecord.id }
      });

      return { returnRecord, returnItems: createdReturnItems };
    }, {
      timeout: 30000, // Increase timeout to 30 seconds
      maxWait: 10000, // Maximum time to wait for a transaction slot
    });

    res.status(201).json({
      message: 'Return created successfully from invoice',
      return: result.returnRecord,
      returnItems: result.returnItems
    });
  } catch (error) {
    console.error('Create return from invoice error:', error);
    res.status(500).json({ error: 'Failed to create return from invoice' });
  }
});

// Update return status
router.put('/:id/status', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('status').isIn(['PENDING', 'APPROVED', 'REJECTED', 'PROCESSED'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { status } = req.body;

    const returnRecord = await prisma.return.updateMany({
      where: { 
        id: req.params.id,
        tenantId: tenant.id 
      },
      data: { status }
    });

    if (returnRecord.count === 0) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json({ message: 'Return status updated successfully' });
  } catch (error) {
    console.error('Update return status error:', error);
    res.status(500).json({ error: 'Failed to update return status' });
  }
});

// Update return
router.put('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('reason').optional().trim(),
  body('returnDate').optional().isISO8601(),
  body('totalAmount').optional().isFloat({ min: 0 }),
  body('notes').optional().trim(),
  body('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'PROCESSED'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const updateData = { ...req.body };
    if (updateData.returnDate) {
      updateData.returnDate = new Date(updateData.returnDate);
    }

    const returnRecord = await prisma.return.updateMany({
      where: { 
        id: req.params.id,
        tenantId: tenant.id 
      },
      data: updateData
    });

    if (returnRecord.count === 0) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json({ message: 'Return updated successfully' });
  } catch (error) {
    console.error('Update return error:', error);
    res.status(500).json({ error: 'Failed to update return' });
  }
});

// Delete return
router.delete('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const returnRecord = await prisma.return.deleteMany({
      where: { 
        id: req.params.id,
        tenantId: tenant.id 
      }
    });

    if (returnRecord.count === 0) {
      return res.status(404).json({ error: 'Return not found' });
    }

    res.json({ message: 'Return deleted successfully' });
  } catch (error) {
    console.error('Delete return error:', error);
    res.status(500).json({ error: 'Failed to delete return' });
  }
});

module.exports = router;
