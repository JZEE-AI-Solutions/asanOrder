const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { generateReturnNumber } = require('../utils/invoiceNumberGenerator');
const accountingService = require('../services/accountingService');
const InventoryService = require('../services/inventoryService');

const router = express.Router();

// Note: generateReturnNumber is now imported from utils/invoiceNumberGenerator.js

// Get all returns for a tenant (Business Owner only)
// Supports filtering by returnType: SUPPLIER, CUSTOMER_FULL, CUSTOMER_PARTIAL
router.get('/', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Build where clause with optional filters
    const whereClause = { tenantId: tenant.id };
    if (req.query.returnType) {
      whereClause.returnType = req.query.returnType;
    }
    if (req.query.purchaseInvoiceId) {
      whereClause.purchaseInvoiceId = req.query.purchaseInvoiceId;
    }
    if (req.query.orderId) {
      whereClause.orderId = req.query.orderId;
    }

    const returns = await prisma.return.findMany({
      where: whereClause,
      include: {
        returnItems: true,
        purchaseInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            supplierName: true
          }
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: {
              select: {
                id: true,
                name: true,
                phoneNumber: true
              }
            }
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
  body('returnHandlingMethod').optional().isIn(['REDUCE_AP', 'REFUND']),
  body('returnRefundAccountId').optional().trim(),
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

    const { reason, returnDate, totalAmount, notes, purchaseInvoiceId, returnItems, returnHandlingMethod, returnRefundAccountId } = req.body;

    // Validate standalone return requirements
    if (purchaseInvoiceId) {
      // This is a standalone supplier return - require handling method
      if (!returnHandlingMethod || !['REDUCE_AP', 'REFUND'].includes(returnHandlingMethod)) {
        return res.status(400).json({ 
          error: 'Return handling method is required for supplier returns. Must be either "REDUCE_AP" or "REFUND".' 
        });
      }

      if (returnHandlingMethod === 'REFUND' && !returnRefundAccountId) {
        return res.status(400).json({ 
          error: 'Return refund account is required when return handling method is "REFUND".' 
        });
      }

      // Validate refund account if provided
      if (returnHandlingMethod === 'REFUND' && returnRefundAccountId) {
        const refundAccount = await prisma.account.findFirst({
          where: {
            id: returnRefundAccountId,
            tenantId: tenant.id,
            type: 'ASSET',
            accountSubType: { in: ['CASH', 'BANK'] }
          }
        });

        if (!refundAccount) {
          return res.status(400).json({
            error: 'Invalid return refund account. Account must be a Cash or Bank account.'
          });
        }
      }

      // Validate return doesn't exceed available products from invoice
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: {
          id: purchaseInvoiceId,
          tenantId: tenant.id
        },
        include: {
          purchaseItems: {
            where: { isDeleted: false }
          },
          returns: {
            where: {
              returnType: 'SUPPLIER',
              status: { not: 'REJECTED' }
            },
            include: {
              returnItems: true
            }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Purchase invoice not found' });
      }

      // Calculate available quantities: per variant (when purchase items have productVariantId) and per product name (fallback)
      const variantAvailability = {};
      const productAvailabilityByName = {};
      invoice.purchaseItems.forEach(item => {
        const qty = item.quantity || 0;
        if (item.productVariantId) {
          variantAvailability[item.productVariantId] = (variantAvailability[item.productVariantId] || 0) + qty;
        }
        const nameKey = item.name || '';
        productAvailabilityByName[nameKey] = (productAvailabilityByName[nameKey] || 0) + qty;
      });
      invoice.returns.forEach(r => {
        r.returnItems.forEach(ri => {
          const qty = ri.quantity || 0;
          if (ri.productVariantId) {
            variantAvailability[ri.productVariantId] = (variantAvailability[ri.productVariantId] || 0) - qty;
          }
          const nameKey = ri.productName || '';
          productAvailabilityByName[nameKey] = (productAvailabilityByName[nameKey] || 0) - qty;
        });
      });

      // Validate return items: use variant-level availability when return item has productVariantId
      for (const returnItem of returnItems) {
        const available = returnItem.productVariantId
          ? (variantAvailability[returnItem.productVariantId] ?? 0)
          : (productAvailabilityByName[returnItem.productName] ?? 0);
        if (returnItem.quantity > available) {
          return res.status(400).json({
            error: `Return quantity for ${returnItem.productName} (${returnItem.quantity}) exceeds available quantity (${available})`
          });
        }
      }
    }

    // Generate return number
    const returnNumber = await generateReturnNumber(tenant.id);

    const result = await prisma.$transaction(async (tx) => {
      // Create the return
      // If purchaseInvoiceId is provided, this is a supplier return
      const returnType = purchaseInvoiceId ? 'SUPPLIER' : null;
      
      // For supplier returns, require handling method and process everything immediately
      // Status is set to a default value but doesn't control processing
      const status = 'PROCESSED'; // Default status, but processing happens immediately on save
      
      const returnRecord = await tx.return.create({
        data: {
          returnNumber,
          reason,
          returnDate: new Date(returnDate),
          totalAmount,
          notes,
          tenantId: tenant.id,
          purchaseInvoiceId: purchaseInvoiceId || null,
          returnType: returnType || 'SUPPLIER', // Default to SUPPLIER for this endpoint
          status: status
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
        productVariantId: item.productVariantId || null,
        color: item.color || null,
        size: item.size || null,
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

    // For supplier returns, ALWAYS create accounting entries and update stock immediately on save
    // No approval workflow - everything happens on save
    if (purchaseInvoiceId) {
      // Require returnHandlingMethod for supplier returns
      if (!returnHandlingMethod || !['REDUCE_AP', 'REFUND'].includes(returnHandlingMethod)) {
        // Delete the return if handling method is missing
        await prisma.$transaction(async (tx) => {
          await tx.returnItem.deleteMany({
            where: { returnId: result.returnRecord.id }
          });
          await tx.return.delete({
            where: { id: result.returnRecord.id }
          });
        });
        return res.status(400).json({ 
          error: 'Return handling method is required for supplier returns. Must be either "REDUCE_AP" or "REFUND".' 
        });
      }
      try {
        // Get invoice for reference
        const invoice = await prisma.purchaseInvoice.findFirst({
          where: {
            id: purchaseInvoiceId,
            tenantId: tenant.id
          }
        });

        // Get or create accounts
        const inventoryAccount = await accountingService.getAccountByCode('1300', tenant.id) ||
          await accountingService.getOrCreateAccount({
            code: '1300',
            name: 'Inventory',
            type: 'ASSET',
            tenantId: tenant.id,
            balance: 0
          });

        const transactionLines = [
          {
            accountId: inventoryAccount.id,
            debitAmount: 0,
            creditAmount: totalAmount
          }
        ];

        if (returnHandlingMethod === 'REDUCE_AP') {
          const apAccount = await accountingService.getAccountByCode('2000', tenant.id) ||
            await accountingService.getOrCreateAccount({
              code: '2000',
              name: 'Accounts Payable',
              type: 'LIABILITY',
              tenantId: tenant.id,
              balance: 0
            });

          transactionLines.push({
            accountId: apAccount.id,
            debitAmount: totalAmount,
            creditAmount: 0
          });
        } else if (returnHandlingMethod === 'REFUND' && returnRefundAccountId) {
          const refundAccount = await prisma.account.findFirst({
            where: {
              id: returnRefundAccountId,
              tenantId: tenant.id
            }
          });

          if (!refundAccount) {
            throw new Error(`Refund account ${returnRefundAccountId} not found`);
          }

          // For refund: We pay cash to supplier AND reduce AP
          // Credit Inventory (decrease), Debit AP (reduce liability), Credit Cash (decrease - we pay)
          const apAccount = await accountingService.getAccountByCode('2000', tenant.id) ||
            await accountingService.getOrCreateAccount({
              code: '2000',
              name: 'Accounts Payable',
              type: 'LIABILITY',
              tenantId: tenant.id,
              balance: 0
            });

          transactionLines.push(
            {
              accountId: apAccount.id,
              debitAmount: totalAmount * 2, // Debit 2x to balance both Inventory and Cash credits
              creditAmount: 0
            },
            {
              accountId: refundAccount.id,
              debitAmount: 0,
              creditAmount: totalAmount
            }
          );
        }

        // Validate transaction balance
        const totalDebits = transactionLines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
        const totalCredits = transactionLines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);

        if (Math.abs(totalDebits - totalCredits) > 0.01) {
          throw new Error(`Transaction is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
        }

        // Create accounting transaction with return date (not invoice date)
        const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
        const transaction = await accountingService.createTransaction(
          {
            transactionNumber,
            date: new Date(returnDate), // Use return date, not invoice date
            description: `Supplier Return: ${returnNumber}${invoice ? ` (Invoice: ${invoice.invoiceNumber})` : ''}`,
            tenantId: tenant.id,
            purchaseInvoiceId: purchaseInvoiceId,
            orderReturnId: result.returnRecord.id
          },
          transactionLines
        );

        // Verify transaction was created successfully
        const createdTransaction = await prisma.transaction.findFirst({
          where: {
            orderReturnId: result.returnRecord.id,
            tenantId: tenant.id
          }
        });

        if (!createdTransaction) {
          throw new Error('Accounting transaction was not created successfully. Transaction verification failed.');
        }

        // Update stock immediately (invoice already fetched above)
        if (invoice) {
          await InventoryService.decreaseInventoryFromReturn(
            tenant.id,
            result.returnItems,
            purchaseInvoiceId,
            invoice.invoiceNumber || 'N/A'
          );
          // Reduce invoice totalAmount so supplier balance reflects the return
          const newInvoiceTotal = Math.max(0, (invoice.totalAmount || 0) - totalAmount);
          await prisma.purchaseInvoice.update({
            where: { id: purchaseInvoiceId },
            data: { totalAmount: newInvoiceTotal }
          });
        }

        console.log(`✅ Supplier return created with accounting and stock updated: ${returnNumber}, Amount: Rs. ${totalAmount}, Method: ${returnHandlingMethod}, Transaction: ${createdTransaction.transactionNumber}`);
      } catch (accountingError) {
        console.error('❌ Error creating accounting entries for standalone return:', accountingError);
        // Delete the return if accounting fails (delete return_items first due to foreign key constraint)
        await prisma.$transaction(async (tx) => {
          await tx.returnItem.deleteMany({
            where: { returnId: result.returnRecord.id }
          });
          await tx.return.delete({
            where: { id: result.returnRecord.id }
          });
        });
        throw accountingError;
      }
    }

    // Fetch updated return with status
    const finalReturn = await prisma.return.findUnique({
      where: { id: result.returnRecord.id },
      include: {
        returnItems: true
      }
    });

    res.status(201).json({
      message: 'Return created successfully',
      return: finalReturn,
      returnItems: result.returnItems
    });
  } catch (error) {
    console.error('Create return error:', error);
    res.status(500).json({ 
      error: 'Failed to create return',
      details: error.message 
    });
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
      // Create the return (from invoice, so it's a supplier return)
      const returnRecord = await tx.return.create({
        data: {
          returnNumber,
          reason: 'INVOICE_RETURN',
          returnDate: new Date(invoiceDate),
          totalAmount,
          notes: `Return processed from invoice ${invoiceNumber}`,
          tenantId: tenant.id,
          purchaseInvoiceId: purchaseInvoice.id,
          returnType: 'SUPPLIER'
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
        productVariantId: item.productVariantId || null,
        color: item.color || null,
        size: item.size || null,
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
  body('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'PROCESSED']),
  body('returnItems').optional().isArray(),
  body('returnItems.*.productName').optional().trim().isLength({ min: 1 }),
  body('returnItems.*.purchasePrice').optional().isFloat({ min: 0 }),
  body('returnItems.*.quantity').optional().isInt({ min: 1 }),
  body('returnHandlingMethod').optional().isIn(['REDUCE_AP', 'REFUND']),
  body('returnRefundAccountId').optional().trim()
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

    const { id } = req.params;
    const { reason, returnDate, totalAmount, notes, status, returnItems, returnHandlingMethod, returnRefundAccountId } = req.body;

    // Get existing return
    const existingReturn = await prisma.return.findFirst({
      where: {
        id: id,
        tenantId: tenant.id
      },
      include: {
        returnItems: true,
        purchaseInvoice: {
          include: {
            purchaseItems: {
              where: { isDeleted: false }
            }
          }
        }
      }
    });

    if (!existingReturn) {
      return res.status(404).json({ error: 'Return not found' });
    }

    // Check if this is a supplier return (has purchaseInvoiceId)
    // For supplier returns, always process accounting and stock on save - no approval workflow
    const isSupplierReturn = existingReturn.purchaseInvoiceId && 
                             existingReturn.returnType === 'SUPPLIER';

    // If editing supplier return, always process accounting and stock
    if (isSupplierReturn) {
      // Find existing transaction for this return
      const existingTransaction = await prisma.transaction.findFirst({
        where: {
          orderReturnId: id,
          tenantId: tenant.id
        },
        include: {
          transactionLines: {
            include: {
              account: true
            }
          }
        }
      });

      // Determine handling method - use provided one, or derive from existing transaction, or require it
      let oldReturnHandlingMethod = null;
      let oldRefundAccountId = null;
      
      if (existingTransaction) {
        // Determine old return handling method from transaction
        const inventoryLine = existingTransaction.transactionLines.find(
          line => line.account.accountSubType === 'INVENTORY' || line.account.code === '1300'
        );
        const apLine = existingTransaction.transactionLines.find(
          line => line.account.code === '2000' || line.account.type === 'LIABILITY'
        );
        const cashBankLine = existingTransaction.transactionLines.find(
          line => line.account.type === 'ASSET' && 
                  (line.account.accountSubType === 'CASH' || line.account.accountSubType === 'BANK')
        );

          oldReturnHandlingMethod = apLine ? 'REDUCE_AP' : (cashBankLine ? 'REFUND' : null);
        oldRefundAccountId = cashBankLine ? cashBankLine.accountId : null;
      }

      // Always process accounting and stock for supplier returns on save
      // If no transaction exists, create one. If transaction exists and data changed, update it.
      const oldReturnTotal = existingReturn.totalAmount;
      const oldReturnDate = existingReturn.returnDate;

      // Calculate new return total
      let newReturnTotal = totalAmount !== undefined ? totalAmount : existingReturn.totalAmount;
      if (returnItems && Array.isArray(returnItems) && returnItems.length > 0) {
        newReturnTotal = returnItems.reduce((sum, item) => 
          sum + (parseFloat(item.purchasePrice || 0) * parseInt(item.quantity || 0)), 0
        );
      }

      const newReturnDate = returnDate ? new Date(returnDate) : existingReturn.returnDate;
      const newHandlingMethod = returnHandlingMethod || oldReturnHandlingMethod;
      const newRefundAccountId = returnRefundAccountId || oldRefundAccountId;

      // If no existing transaction and no handling method provided, require it
      if (!existingTransaction && !newHandlingMethod) {
        return res.status(400).json({
          error: 'Return handling method is required for supplier returns. Must be either "REDUCE_AP" or "REFUND".'
        });
      }

      // Validate new handling method and refund account
      if (newHandlingMethod === 'REFUND' && !newRefundAccountId) {
        return res.status(400).json({
          error: 'Return refund account is required when return handling method is "REFUND".'
        });
      }

      if (newHandlingMethod === 'REFUND' && newRefundAccountId) {
        const refundAccount = await prisma.account.findFirst({
          where: {
            id: newRefundAccountId,
            tenantId: tenant.id,
            type: 'ASSET',
            accountSubType: { in: ['CASH', 'BANK'] }
          }
        });

        if (!refundAccount) {
          return res.status(400).json({
            error: 'Invalid return refund account. Account must be a Cash or Bank account.'
          });
        }
      }

      // Reverse old transaction if there was one and data changed
      if (existingTransaction && oldReturnTotal > 0 && oldReturnHandlingMethod) {
          const inventoryAccount = await accountingService.getAccountByCode('1300', tenant.id) ||
            await accountingService.getOrCreateAccount({
              code: '1300',
              name: 'Inventory',
              type: 'ASSET',
              tenantId: tenant.id,
              balance: 0
            });

          const reverseTransactionLines = [
            {
              accountId: inventoryAccount.id,
              debitAmount: oldReturnTotal,
              creditAmount: 0
            }
          ];

          if (oldReturnHandlingMethod === 'REDUCE_AP') {
            const apAccount = await accountingService.getAccountByCode('2000', tenant.id);
            if (apAccount) {
              reverseTransactionLines.push({
                accountId: apAccount.id,
                debitAmount: 0,
                creditAmount: oldReturnTotal
              });
            }
          } else if (oldReturnHandlingMethod === 'REFUND' && oldRefundAccountId) {
            const oldRefundAccount = await prisma.account.findFirst({
              where: { id: oldRefundAccountId, tenantId: tenant.id }
            });
            if (oldRefundAccount) {
              // Reverse: Original was Debit AP, Credit Cash, Credit Inventory
              // Reversal: Credit AP, Debit Cash, Debit Inventory
              const apAccount = await accountingService.getAccountByCode('2000', tenant.id);
              if (apAccount) {
                reverseTransactionLines.push({
                  accountId: apAccount.id,
                  debitAmount: 0,
                  creditAmount: oldReturnTotal * 2 // Credit 2x to reverse the 2x debit
                });
              }
              reverseTransactionLines.push({
                accountId: oldRefundAccount.id,
                debitAmount: oldReturnTotal,
                creditAmount: 0
              });
            } else {
              // Fallback to AP if old refund account not found
              const apAccount = await accountingService.getAccountByCode('2000', tenant.id) ||
                await accountingService.getOrCreateAccount({
                  code: '2000',
                  name: 'Accounts Payable',
                  type: 'LIABILITY',
                  tenantId: tenant.id,
                  balance: 0
                });
              reverseTransactionLines.push({
                accountId: apAccount.id,
                debitAmount: 0,
                creditAmount: oldReturnTotal
              });
            }
          }

          // Validate reverse transaction balance
          const totalDebits = reverseTransactionLines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
          const totalCredits = reverseTransactionLines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);

          if (Math.abs(totalDebits - totalCredits) > 0.01) {
            throw new Error(`Reverse transaction is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
          }

          // Create reversing transaction
          // Note: Do NOT set orderReturnId on reversal transaction to avoid unique constraint violation
          // Only the main transaction should have orderReturnId
          const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}-REV`;
          await accountingService.createTransaction(
            {
              transactionNumber: reverseTransactionNumber,
              date: oldReturnDate, // Use old return date for reversal
              description: `Reverse: Supplier Return: ${existingReturn.returnNumber}`,
              tenantId: tenant.id,
              purchaseInvoiceId: existingReturn.purchaseInvoiceId
              // orderReturnId: NOT SET for reversal transaction
            },
            reverseTransactionLines
          );

          console.log(`✅ Reversed old accounting transaction for return ${existingReturn.returnNumber}`);
        }

        // Create new transaction with updated data
        if (newReturnTotal > 0 && newHandlingMethod) {
          const inventoryAccount = await accountingService.getAccountByCode('1300', tenant.id) ||
            await accountingService.getOrCreateAccount({
              code: '1300',
              name: 'Inventory',
              type: 'ASSET',
              tenantId: tenant.id,
              balance: 0
            });

          const newTransactionLines = [
            {
              accountId: inventoryAccount.id,
              debitAmount: 0,
              creditAmount: newReturnTotal
            }
          ];

          if (newHandlingMethod === 'REDUCE_AP') {
            const apAccount = await accountingService.getAccountByCode('2000', tenant.id) ||
              await accountingService.getOrCreateAccount({
                code: '2000',
                name: 'Accounts Payable',
                type: 'LIABILITY',
                tenantId: tenant.id,
                balance: 0
              });

            newTransactionLines.push({
              accountId: apAccount.id,
              debitAmount: newReturnTotal,
              creditAmount: 0
            });
          } else if (newHandlingMethod === 'REFUND' && newRefundAccountId) {
            const refundAccount = await prisma.account.findFirst({
              where: {
                id: newRefundAccountId,
                tenantId: tenant.id
              }
            });

            if (!refundAccount) {
              throw new Error(`Refund account ${newRefundAccountId} not found`);
            }

            // For refund: We pay cash to supplier AND reduce AP
            // Credit Inventory (decrease), Debit AP (reduce liability), Credit Cash (decrease - we pay)
            const apAccount = await accountingService.getAccountByCode('2000', tenant.id) ||
              await accountingService.getOrCreateAccount({
                code: '2000',
                name: 'Accounts Payable',
                type: 'LIABILITY',
                tenantId: tenant.id,
                balance: 0
              });

            newTransactionLines.push(
              {
                accountId: apAccount.id,
                debitAmount: newReturnTotal * 2, // Debit 2x to balance both Inventory and Cash credits
                creditAmount: 0
              },
              {
                accountId: refundAccount.id,
                debitAmount: 0,
                creditAmount: newReturnTotal
              }
            );
          }

          // Validate new transaction balance
          const totalDebits = newTransactionLines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
          const totalCredits = newTransactionLines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);

          if (Math.abs(totalDebits - totalCredits) > 0.01) {
            throw new Error(`New transaction is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
          }

          // Delete old transaction if it exists (to avoid unique constraint violation on orderReturnId)
          const oldTransaction = await prisma.transaction.findFirst({
            where: {
              orderReturnId: id,
              tenantId: tenant.id
            }
          });

          if (oldTransaction) {
            // Delete transaction lines first (cascade should handle this, but being explicit)
            await prisma.transactionLine.deleteMany({
              where: { transactionId: oldTransaction.id }
            });
            // Delete the transaction
            await prisma.transaction.delete({
              where: { id: oldTransaction.id }
            });
            console.log(`✅ Deleted old transaction ${oldTransaction.transactionNumber} for return ${existingReturn.returnNumber}`);
          }

          // Create new transaction with new return date
          const newTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
          const invoice = existingReturn.purchaseInvoice;
          await accountingService.createTransaction(
            {
              transactionNumber: newTransactionNumber,
              date: newReturnDate, // Use new return date
              description: `Supplier Return: ${existingReturn.returnNumber}${invoice ? ` (Invoice: ${invoice.invoiceNumber})` : ''}`,
              tenantId: tenant.id,
              purchaseInvoiceId: existingReturn.purchaseInvoiceId,
              orderReturnId: id
            },
            newTransactionLines
          );

          console.log(`✅ Created new accounting transaction for return ${existingReturn.returnNumber}`);
        }

        // Always update stock for supplier returns
        // If return items changed, reverse old and apply new. Otherwise, ensure stock is updated.
        const itemsToProcess = (returnItems && Array.isArray(returnItems) && returnItems.length > 0) 
          ? returnItems 
          : existingReturn.returnItems;

        if (itemsToProcess && itemsToProcess.length > 0) {
          // Reverse old stock changes if items changed
          if (returnItems && Array.isArray(returnItems) && existingReturn.returnItems.length > 0) {
            // Increase inventory back (reverse the decrease)
            for (const oldItem of existingReturn.returnItems) {
              const product = await prisma.product.findFirst({
                where: {
                  tenantId: tenant.id,
                  name: { equals: oldItem.productName, mode: 'insensitive' }
                }
              });

              if (product) {
                await prisma.product.update({
                  where: { id: product.id },
                  data: {
                    currentQuantity: product.currentQuantity + oldItem.quantity,
                    lastUpdated: new Date()
                  }
                });
              }
            }
          }

          // Apply stock changes (new items or ensure existing items are processed)
          const invoice = existingReturn.purchaseInvoice;
          if (invoice) {
            const itemsForStockUpdate = returnItems && Array.isArray(returnItems) && returnItems.length > 0
              ? returnItems
              : existingReturn.returnItems.map(ri => ({
                  productName: ri.productName,
                  quantity: ri.quantity,
                  purchasePrice: ri.purchasePrice
                }));

            await InventoryService.decreaseInventoryFromReturn(
              tenant.id,
              itemsForStockUpdate,
              existingReturn.purchaseInvoiceId,
              invoice.invoiceNumber || 'N/A'
            );
          }
        }
      }

    // Update return record
    const updateData = {};
    if (reason !== undefined) updateData.reason = reason;
    if (returnDate !== undefined) updateData.returnDate = new Date(returnDate);
    if (totalAmount !== undefined) updateData.totalAmount = totalAmount;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;

    // Update return items if provided
    if (returnItems !== undefined && Array.isArray(returnItems)) {
      await prisma.$transaction(async (tx) => {
        // Delete existing return items
        await tx.returnItem.deleteMany({
          where: { returnId: id }
        });

        // Create new return items
        if (returnItems.length > 0) {
          await tx.returnItem.createMany({
            data: returnItems.map(item => ({
              productName: item.productName,
              description: item.description || null,
              purchasePrice: item.purchasePrice,
              quantity: item.quantity,
              reason: item.reason || null,
              sku: item.sku || null,
              productVariantId: item.productVariantId || null,
              color: item.color || null,
              size: item.size || null,
              returnId: id
            }))
          });
        }
      });
    }

    const returnRecord = await prisma.return.updateMany({
      where: { 
        id: id,
        tenantId: tenant.id 
      },
      data: updateData
    });

    if (returnRecord.count === 0) {
      return res.status(404).json({ error: 'Return not found' });
    }

    // Fetch updated return
    const updatedReturn = await prisma.return.findUnique({
      where: { id: id },
      include: {
        returnItems: true
      }
    });

    res.json({ 
      message: 'Return updated successfully',
      return: updatedReturn
    });
  } catch (error) {
    console.error('Update return error:', error);
    res.status(500).json({ 
      error: 'Failed to update return',
      details: error.message 
    });
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
