const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const InventoryService = require('../services/inventoryService');
const profitService = require('../services/profitService');
const accountingService = require('../services/accountingService');
const balanceService = require('../services/balanceService');
const { generateInvoiceNumber, generateReturnNumber } = require('../utils/invoiceNumberGenerator');

const router = express.Router();

// Helper function to get payment method from account
async function getPaymentMethodFromAccount(accountId, tenantId) {
  try {
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        tenantId,
        type: 'ASSET',
        accountSubType: { in: ['CASH', 'BANK'] }
      }
    });

    if (!account) {
      return 'Cash'; // Default fallback
    }

    // Derive payment method from account subType
    return account.accountSubType === 'BANK' ? 'Bank Transfer' : 'Cash';
  } catch (error) {
    console.error('Error getting payment method from account:', error);
    return 'Cash'; // Default fallback
  }
}

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
  body('totalAmount').isFloat(), // Allow negative for return-only invoices (netAmount is recalculated anyway)
  body('products').optional().isArray(),
  body('products.*.name').optional().trim().notEmpty(),
  body('products.*.purchasePrice').optional().isFloat({ min: 0 }),
  body('products.*.quantity').optional().isInt({ min: 1 }),
  body('returnItems').optional().isArray(),
  body('returnItems.*.name').optional().trim().notEmpty(),
  body('returnItems.*.productName').optional().trim().notEmpty(),
  body('returnItems.*.purchasePrice').optional().isFloat({ min: 0 }),
  body('returnItems.*.quantity').optional().isInt({ min: 1 }),
  body('returnHandlingMethod').optional().isIn(['REDUCE_AP', 'REFUND']),
  body('returnRefundAccountId').optional().trim(),
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

    let { invoiceNumber, invoiceDate, totalAmount, products, returnItems, returnHandlingMethod, returnRefundAccountId, supplierName, supplierId, paymentAmount, paymentAccountId, notes, useAdvanceBalance, advanceAmountUsed } = req.body;
    
    // Normalize returnItems - handle both 'name' and 'productName' fields
    const normalizedReturnItems = (returnItems || []).map(item => ({
      ...item,
      productName: item.productName || item.name,
      name: item.name || item.productName
    }));
    
    // Calculate purchase total and return total
    const purchaseTotal = (products || []).reduce((sum, p) => sum + (parseFloat(p.purchasePrice || 0) * parseInt(p.quantity || 0)), 0);
    const returnTotal = normalizedReturnItems.reduce((sum, r) => sum + (parseFloat(r.purchasePrice || 0) * parseInt(r.quantity || 0)), 0);
    const netAmount = purchaseTotal - returnTotal;
    
    // Validate: Must have at least products OR returnItems
    if ((!products || products.length === 0) && normalizedReturnItems.length === 0) {
      return res.status(400).json({ 
        error: 'At least one product (purchase or return) is required' 
      });
    }
    
    // Validate net amount is not negative only if there are purchase items
    // If only return items exist, netAmount can be negative (pure return transaction)
    if ((products || []).length > 0 && netAmount < 0) {
      return res.status(400).json({ 
        error: `Return total (Rs. ${returnTotal.toFixed(2)}) cannot exceed purchase total (Rs. ${purchaseTotal.toFixed(2)})` 
      });
    }
    
    // Validate return handling method if return items exist
    if (normalizedReturnItems.length > 0) {
      if (!returnHandlingMethod || !['REDUCE_AP', 'REFUND'].includes(returnHandlingMethod)) {
        return res.status(400).json({ 
          error: 'Return handling method is required when return items are present. Must be either "REDUCE_AP" or "REFUND".' 
        });
      }
      
      if (returnHandlingMethod === 'REFUND' && !returnRefundAccountId) {
        return res.status(400).json({ 
          error: 'Return refund account is required when return handling method is "REFUND".' 
        });
      }
      
      // Validate return refund account exists and is Cash/Bank type
      if (returnHandlingMethod === 'REFUND') {
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
    }
    
    // Use net amount as totalAmount (purchases - returns)
    // For pure return transactions (only return items), use absolute value
    totalAmount = Math.abs(netAmount);
    
    // Validate payment amount if provided
    let paidAmount = paymentAmount ? parseFloat(paymentAmount) : 0;
    
    // Create or find supplier if supplierName is provided (needed before advance calculation)
    let finalSupplierId = supplierId || null;
    if (supplierName && !supplierId) {
      // Try to find existing supplier by name
      let supplier = await prisma.supplier.findFirst({
        where: {
          tenantId: tenant.id,
          name: {
            equals: supplierName,
            mode: 'insensitive'
          }
        }
      });

      // If not found, create new supplier
      if (!supplier) {
        supplier = await prisma.supplier.create({
          data: {
            name: supplierName,
            tenantId: tenant.id,
            balance: 0
          }
        });
      }
      finalSupplierId = supplier.id;
    }
    
    // Handle advance balance adjustment if supplier exists and advance is being used
    let actualAdvanceUsed = 0;
    let advanceToSuppliersAccount = null;
    
    if (useAdvanceBalance && finalSupplierId) {
      try {
        // Calculate supplier balance to get available advance
        const supplierBalance = await balanceService.calculateSupplierBalance(finalSupplierId);
        // Available advance = negative pending balance (we paid them advance/returned products, they owe us goods)
        // pending = (openingBalance + totalInvoices) - totalPaid
        // If pending < 0, we have advance with supplier (we paid them/returned products, they owe us goods)
        const availableAdvance = supplierBalance.pending < 0 ? Math.abs(supplierBalance.pending) : 0;
        
        if (availableAdvance > 0) {
          // Use the specified advance amount or available advance, whichever is less
          const requestedAdvance = advanceAmountUsed ? parseFloat(advanceAmountUsed) : availableAdvance;
          actualAdvanceUsed = Math.min(requestedAdvance, availableAdvance, totalAmount);
          
          // Note: paidAmount and actualAdvanceUsed are separate payments
          // Do NOT subtract advance from paidAmount - they are both separate payment methods
        }
      } catch (balanceError) {
        console.error('Error calculating supplier balance for advance adjustment:', balanceError);
        // Continue without advance adjustment if calculation fails
      }
    }
    
    // For return-only invoices (netAmount < 0), payment should be 0
    // Returns are handled via returnHandlingMethod (REDUCE_AP or REFUND)
    if (netAmount < 0) {
      // This is a return-only invoice - no payment should be made
      if (paidAmount > 0 || actualAdvanceUsed > 0) {
        return res.status(400).json({ 
          error: 'Payment cannot be made for return-only invoices. Returns are handled via the return handling method.' 
        });
      }
    } else {
      // Regular purchase invoice - validate payment against positive total amount
      // Validate total payment (advance + cash/bank) doesn't exceed total amount
      const totalPayment = paidAmount + actualAdvanceUsed;
      if (totalPayment > totalAmount) {
        return res.status(400).json({ 
          error: `Total payment (Rs. ${totalPayment.toFixed(2)}) exceeds invoice total (Rs. ${totalAmount.toFixed(2)})` 
        });
      }
      
      if (paidAmount < 0 || paidAmount > totalAmount) {
        return res.status(400).json({ error: 'Payment amount must be between 0 and total amount' });
      }
    }

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

    // Create purchase invoice with products and returns in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the purchase invoice
      const purchaseInvoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber: invoiceNumber,
          supplierName: supplierName || null,
          supplierId: finalSupplierId,
          invoiceDate: new Date(invoiceDate),
          totalAmount: totalAmount, // Net amount (purchases - returns)
          paymentAmount: paidAmount > 0 ? paidAmount : null,
          paymentMethod: paidAmount > 0 ? (paymentAccountId ? await getPaymentMethodFromAccount(paymentAccountId, tenant.id) : null) : null,
          notes: notes || null,
          tenantId: tenant.id
        }
      });

      // Create purchase items using createMany for better performance (only if products exist)
      let purchaseItems = [];
      if (products && products.length > 0) {
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
        purchaseItems = await tx.purchaseItem.findMany({
          where: { purchaseInvoiceId: purchaseInvoice.id }
        });
      }

      // Create return records if return items exist
      let returnRecord = null;
      let createdReturnItems = [];
      
      if (normalizedReturnItems.length > 0) {
        // Generate return number
        const returnNumber = await generateReturnNumber(tenant.id);
        
        // Create Return record
        returnRecord = await tx.return.create({
          data: {
            returnNumber: returnNumber,
            reason: 'Purchase invoice return',
            returnDate: new Date(invoiceDate),
            totalAmount: returnTotal,
            returnType: 'SUPPLIER',
            notes: `Return processed from purchase invoice ${invoiceNumber}`,
            tenantId: tenant.id,
            purchaseInvoiceId: purchaseInvoice.id
          }
        });

        // Create return items
        const returnItemsData = normalizedReturnItems.map((item) => ({
          productName: item.productName || item.name,
          description: item.description || null,
          purchasePrice: item.purchasePrice,
          quantity: item.quantity,
          reason: item.reason || 'Purchase invoice return',
          sku: item.sku || null,
          returnId: returnRecord.id
        }));

        await tx.returnItem.createMany({
          data: returnItemsData
        });

        // Get the created return items
        createdReturnItems = await tx.returnItem.findMany({
          where: { returnId: returnRecord.id }
        });
      }

      return { purchaseInvoice, purchaseItems, returnRecord, returnItems: createdReturnItems };
    }, {
      timeout: 30000, // 30 seconds timeout
      maxWait: 10000  // 10 seconds max wait
    });

    // Create accounting transaction for purchase invoice
    try {
      // Get or create accounts
      let inventoryAccount = await accountingService.getAccountByCode('1300', tenant.id);
      if (!inventoryAccount) {
        inventoryAccount = await accountingService.getOrCreateAccount({
          code: '1300',
          name: 'Inventory',
          type: 'ASSET',
          tenantId: tenant.id,
          balance: 0
        });
      }

      // Calculate amounts: totalAmount (net) = purchaseTotal - returnTotal
      // For purchases: unpaidAmount = purchaseTotal - paidAmount - actualAdvanceUsed
      // Note: totalAmount is net (purchases - returns), but payment is only for purchases
      // For pure return transactions (no purchases), unpaidAmount should be 0
      const unpaidAmount = Math.max(0, purchaseTotal - paidAmount - actualAdvanceUsed);
      const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      const transactionLines = [];

      // Debit Inventory for purchases (only if there are purchases)
      if (purchaseTotal > 0) {
        transactionLines.push({
          accountId: inventoryAccount.id,
          debitAmount: purchaseTotal,
          creditAmount: 0
        });
      }
      
      // Credit Inventory for returns (new logic)
      if (returnTotal > 0) {
        transactionLines.push({
          accountId: inventoryAccount.id,
          debitAmount: 0,
          creditAmount: returnTotal
        });
      }

      // If advance balance is used, credit Advance to Suppliers (reducing the asset - we're using the advance we paid them)
      if (actualAdvanceUsed > 0) {
        advanceToSuppliersAccount = await accountingService.getAccountByCode('1230', tenant.id);
        if (!advanceToSuppliersAccount) {
          advanceToSuppliersAccount = await accountingService.getOrCreateAccount({
            code: '1230',
            name: 'Advance to Suppliers',
            type: 'ASSET',
            tenantId: tenant.id,
            balance: 0
          });
        }

        transactionLines.push({
          accountId: advanceToSuppliersAccount.id,
          debitAmount: 0,
          creditAmount: actualAdvanceUsed // Credit decreases asset (we're using the advance we paid them)
        });
      }

      // If paid with cash/bank (fully or partially), credit Cash/Bank based on selected account
      if (paidAmount > 0) {
        // Require paymentAccountId when cash payment > 0
        if (!paymentAccountId) {
          return res.status(400).json({
            error: 'Payment account is required when making cash/bank payment'
          });
        }

        // Validate payment account exists and is Cash/Bank type
        const paymentAccount = await prisma.account.findFirst({
          where: {
            id: paymentAccountId,
            tenantId: tenant.id,
            type: 'ASSET',
            accountSubType: { in: ['CASH', 'BANK'] }
          }
        });

        if (!paymentAccount) {
          return res.status(400).json({
            error: 'Invalid payment account. Account must be a Cash or Bank account.'
          });
        }

        transactionLines.push({
          accountId: paymentAccount.id,
          debitAmount: 0,
          creditAmount: paidAmount
        });
      }

      // If unpaid (fully or partially), credit Accounts Payable
      if (unpaidAmount > 0) {
        let apAccount = await accountingService.getAccountByCode('2000', tenant.id);
        if (!apAccount) {
          apAccount = await accountingService.getOrCreateAccount({
            code: '2000',
            name: 'Accounts Payable',
            type: 'LIABILITY',
            tenantId: tenant.id,
            balance: 0
          });
        }

        transactionLines.push({
          accountId: apAccount.id,
          debitAmount: 0,
          creditAmount: unpaidAmount
        });
      }

      // Handle return accounting entries (new logic)
      if (returnTotal > 0) {
        if (returnHandlingMethod === 'REDUCE_AP') {
          // Credit Inventory (already added above), Debit AP
          let apAccount = await accountingService.getAccountByCode('2000', tenant.id);
          if (!apAccount) {
            apAccount = await accountingService.getOrCreateAccount({
              code: '2000',
              name: 'Accounts Payable',
              type: 'LIABILITY',
              tenantId: tenant.id,
              balance: 0
            });
          }
          
          transactionLines.push({
            accountId: apAccount.id,
            debitAmount: returnTotal,
            creditAmount: 0
          });
        } else if (returnHandlingMethod === 'REFUND') {
          // Credit Inventory (already added above), Debit Cash/Bank
          const refundAccount = await prisma.account.findFirst({
            where: {
              id: returnRefundAccountId,
              tenantId: tenant.id,
              type: 'ASSET',
              accountSubType: { in: ['CASH', 'BANK'] }
            }
          });
          
          if (!refundAccount) {
            throw new Error(`Invalid return refund account. Account must be a Cash or Bank account.`);
          }
          
          transactionLines.push({
            accountId: refundAccount.id,
            debitAmount: returnTotal,
            creditAmount: 0
          });
        }
      }

      // Create transaction
      let description = `Purchase Invoice: ${invoiceNumber}${supplierName ? ` - ${supplierName}` : ''}`;
      if (purchaseTotal > 0) {
        description += ` (Purchases: Rs. ${purchaseTotal.toFixed(2)})`;
      }
      if (returnTotal > 0) {
        description += ` (Returns: Rs. ${returnTotal.toFixed(2)})`;
      }
      if (paidAmount > 0) {
        description += ` (Paid: Rs. ${paidAmount.toFixed(2)})`;
      }
      if (actualAdvanceUsed > 0) {
        description += ` (Advance Used: Rs. ${actualAdvanceUsed.toFixed(2)})`;
      }
      
      await accountingService.createTransaction(
        {
          transactionNumber,
          date: new Date(invoiceDate),
          description,
          tenantId: tenant.id,
          purchaseInvoiceId: result.purchaseInvoice.id
        },
        transactionLines
      );

      // Update supplier balance if advance was used
      if (actualAdvanceUsed > 0 && finalSupplierId) {
        try {
          const supplier = await prisma.supplier.findUnique({
            where: { id: finalSupplierId }
          });
          
          if (supplier) {
            // Increase balance (reduce negative, or make it less negative)
            // Since negative balance means advance, using advance means balance becomes less negative (closer to 0)
            await prisma.supplier.update({
              where: { id: finalSupplierId },
              data: {
                balance: (supplier.balance || 0) + actualAdvanceUsed
              }
            });
          }
        } catch (balanceUpdateError) {
          console.error('Error updating supplier balance after advance usage:', balanceUpdateError);
          // Don't fail invoice creation if balance update fails
        }
      }

      // Create Payment records for tracking/display purposes
      // The accounting entries are already created in the purchase transaction above
      // We don't link them to the transaction (transactionId stays null) to avoid conflicts
      if (finalSupplierId) {
        try {
          // Get current payment count for generating payment numbers
          const paymentCount = await prisma.payment.count({
            where: { tenantId: tenant.id }
          });

          // Create payment record for advance usage (if any)
          if (actualAdvanceUsed > 0) {
            const advancePaymentNumber = `PAY-${new Date().getFullYear()}-${String(paymentCount + 1).padStart(4, '0')}`;
            await prisma.payment.create({
              data: {
                paymentNumber: advancePaymentNumber,
                date: new Date(invoiceDate),
                type: 'SUPPLIER_PAYMENT',
                amount: actualAdvanceUsed,
                paymentMethod: 'Advance Balance', // Special payment method for advance usage
                tenantId: tenant.id,
                supplierId: finalSupplierId,
                purchaseInvoiceId: result.purchaseInvoice.id
                // transactionId is null - accounting entries are in the purchase transaction
              }
            });
            console.log(`✅ Advance payment record created: Rs. ${actualAdvanceUsed} for purchase invoice ${invoiceNumber}`);
          }

          // Create payment record for cash/bank payment (if any)
          if (paidAmount > 0) {
            const cashPaymentNumber = `PAY-${new Date().getFullYear()}-${String(paymentCount + (actualAdvanceUsed > 0 ? 2 : 1)).padStart(4, '0')}`;
            await prisma.payment.create({
              data: {
                paymentNumber: cashPaymentNumber,
                date: new Date(invoiceDate),
                type: 'SUPPLIER_PAYMENT',
                amount: paidAmount,
                paymentMethod: paymentAccountId ? await getPaymentMethodFromAccount(paymentAccountId, tenant.id) : 'Cash',
                accountId: paymentAccountId || null,
                tenantId: tenant.id,
                supplierId: finalSupplierId,
                purchaseInvoiceId: result.purchaseInvoice.id
                // transactionId is null - accounting entries are in the purchase transaction
              }
            });
            console.log(`✅ Cash/Bank payment record created: Rs. ${paidAmount} for purchase invoice ${invoiceNumber}`);
          }
        } catch (paymentError) {
          console.error('Error creating payment records:', paymentError);
          // Don't fail purchase invoice creation if payment record creation fails
        }
      }

      console.log(`✅ Accounting entry created for purchase invoice ${invoiceNumber}`);
    } catch (accountingError) {
      console.error('Error creating accounting entries for purchase invoice:', accountingError);
      // Don't fail purchase invoice creation if accounting fails
      // Log error but continue
    }

    // Update inventory using the inventory service (outside transaction)
    // Update inventory for purchases (only if there are purchase items)
    if (result.purchaseItems && result.purchaseItems.length > 0) {
      await InventoryService.updateInventoryFromPurchase(
        tenant.id,
        result.purchaseItems,
        result.purchaseInvoice.id,
        invoiceNumber
      );
    }

    // Update inventory for returns (new logic)
    if (result.returnItems && result.returnItems.length > 0) {
      await InventoryService.decreaseInventoryFromReturn(
        tenant.id,
        result.returnItems,
        result.purchaseInvoice.id,
        invoiceNumber
      );
    }

    res.status(201).json({
      message: 'Purchase invoice created successfully',
      invoice: result.purchaseInvoice,
      items: result.purchaseItems,
      returnItems: result.returnItems || []
    });

  } catch (error) {
    console.error('Create purchase invoice with products error:', error);
    const errorMessage = error.message || 'Failed to create purchase invoice';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Search purchase invoices by product name (for return creation)
router.get('/search', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    if (!req.user.tenant?.id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { productName, supplierId, limit = 50 } = req.query;
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));

    const whereClause = {
      tenantId: req.user.tenant.id,
      isDeleted: false
    };

    if (supplierId) {
      whereClause.supplierId = supplierId;
    }

    // Find invoices that have products matching the product name
    let purchaseInvoices = [];
    
    if (productName) {
      // Search for purchase items with matching product name
      const purchaseItems = await prisma.purchaseItem.findMany({
        where: {
          tenantId: req.user.tenant.id,
          isDeleted: false,
          name: {
            contains: productName,
            mode: 'insensitive'
          }
        },
        select: {
          purchaseInvoiceId: true
        },
        distinct: ['purchaseInvoiceId']
      });

      const invoiceIds = purchaseItems.map(item => item.purchaseInvoiceId).filter(Boolean);
      
      if (invoiceIds.length > 0) {
        whereClause.id = { in: invoiceIds };
      } else {
        // No matching products found
        return res.json({
          success: true,
          purchaseInvoices: [],
          pagination: {
            page: 1,
            limit: limitNum,
            total: 0,
            pages: 0
          }
        });
      }
    }

    purchaseInvoices = await prisma.purchaseInvoice.findMany({
      where: whereClause,
      select: {
        id: true,
        invoiceNumber: true,
        supplierName: true,
        supplierId: true,
        invoiceDate: true,
        totalAmount: true,
        supplier: {
          select: {
            id: true,
            name: true
          }
        },
        purchaseItems: {
          where: {
            isDeleted: false,
            ...(productName ? {
              name: {
                contains: productName,
                mode: 'insensitive'
              }
            } : {})
          },
          select: {
            id: true,
            name: true,
            purchasePrice: true,
            quantity: true,
            sku: true
          }
        },
        returns: {
          where: {
            returnType: 'SUPPLIER',
            status: { not: 'REJECTED' }
          },
          include: {
            returnItems: {
              select: {
                productName: true,
                quantity: true
              }
            }
          }
        }
      },
      orderBy: {
        invoiceDate: 'desc'
      },
      take: limitNum
    });

    // Calculate available quantities for each product in each invoice
    const invoicesWithAvailability = purchaseInvoices.map(invoice => {
      const productAvailability = {};
      
      invoice.purchaseItems.forEach(item => {
        const existingReturns = invoice.returns.flatMap(r => 
          r.returnItems.filter(ri => ri.productName === item.name)
        );
        const returnedQty = existingReturns.reduce((sum, ri) => sum + ri.quantity, 0);
        productAvailability[item.name] = item.quantity - returnedQty;
      });

      return {
        ...invoice,
        productAvailability
      };
    });

    res.json({
      success: true,
      purchaseInvoices: invoicesWithAvailability,
      pagination: {
        page: 1,
        limit: limitNum,
        total: invoicesWithAvailability.length,
        pages: Math.ceil(invoicesWithAvailability.length / limitNum)
      }
    });
  } catch (error) {
    console.error('Search purchase invoices error:', error);
    res.status(500).json({ error: 'Failed to search purchase invoices' });
  }
});

// Get all purchase invoices for a tenant (Business Owner only)
router.get('/', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    // Optimize: Use tenant from authenticated user
    if (!req.user.tenant?.id) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { includeDeleted, page = 1, limit = 50, supplierId } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));
    const skipNum = (pageNum - 1) * limitNum;

    const whereClause = { tenantId: req.user.tenant.id };
    
    // Only include non-deleted invoices by default
    if (includeDeleted !== 'true') {
      whereClause.isDeleted = false;
    }
    
    // Filter by supplier if provided
    if (supplierId) {
      whereClause.supplierId = supplierId;
    }

    // Optimize: Add pagination, use select instead of include, limit purchaseItems
    const [purchaseInvoices, total] = await Promise.all([
      prisma.purchaseInvoice.findMany({
        where: whereClause,
        select: {
          id: true,
          invoiceNumber: true,
          supplierName: true,
          supplierId: true,
          invoiceDate: true,
          totalAmount: true,
          paymentAmount: true,
          paymentMethod: true,
          image: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          isDeleted: true,
          deletedAt: true,
          supplier: {
            select: {
              id: true,
              name: true,
              payments: {
                where: {
                  type: 'SUPPLIER_PAYMENT',
                  purchaseInvoiceId: null // Legacy payments not linked to purchase invoice
                },
                select: {
                  id: true,
                  amount: true
                }
              }
            }
          },
          payments: {
            where: {
              type: 'SUPPLIER_PAYMENT'
            },
            select: {
              id: true,
              amount: true
            }
          },
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
        returns: {
          where: {
            returnType: 'SUPPLIER'
          },
          include: {
            returnItems: {
              select: {
                id: true,
                productName: true,
                description: true,
                purchasePrice: true,
                quantity: true,
                reason: true,
                sku: true,
                createdAt: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        supplier: {
          include: {
            payments: {
              where: {
                type: 'SUPPLIER_PAYMENT',
                purchaseInvoiceId: null // Legacy payments not linked to purchase invoice
              },
              orderBy: {
                date: 'desc'
              },
              select: {
                id: true,
                paymentNumber: true,
                date: true,
                amount: true,
                paymentMethod: true,
                supplierId: true
              }
            }
          }
        },
        payments: {
          where: {
            type: 'SUPPLIER_PAYMENT'
          },
          orderBy: {
            date: 'desc'
          },
          select: {
            id: true,
            paymentNumber: true,
            date: true,
            amount: true,
            paymentMethod: true,
            supplierId: true,
            accountId: true,
            account: {
              select: {
                id: true,
                name: true
              }
            }
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

    // Determine return handling method from accounting entries
    // This is a best-effort approach - we check the transaction lines to see if returns were handled via AP or Cash/Bank
    let returnHandlingMethod = null;
    let returnRefundAccountId = null;
    
    if (purchaseInvoice.returns && purchaseInvoice.returns.length > 0) {
      try {
        // Get transactions for this invoice
        const transactions = await prisma.transaction.findMany({
          where: {
            purchaseInvoiceId: id,
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
        
        // Look for return-related entries (Credit Inventory, Debit AP or Cash/Bank)
        for (const txn of transactions) {
          const inventoryCredits = txn.transactionLines.filter(line => 
            line.account.code === '1300' && line.creditAmount > 0
          );
          const apDebits = txn.transactionLines.filter(line => 
            line.account.code === '2000' && line.debitAmount > 0
          );
          const cashBankDebits = txn.transactionLines.filter(line => 
            (line.account.accountSubType === 'CASH' || line.account.accountSubType === 'BANK') && 
            line.debitAmount > 0
          );
          
          if (inventoryCredits.length > 0) {
            // Returns exist - determine method
            if (apDebits.length > 0 && apDebits[0].debitAmount === inventoryCredits[0].creditAmount) {
              returnHandlingMethod = 'REDUCE_AP';
            } else if (cashBankDebits.length > 0 && cashBankDebits[0].debitAmount === inventoryCredits[0].creditAmount) {
              returnHandlingMethod = 'REFUND';
              returnRefundAccountId = cashBankDebits[0].account.id;
            }
          }
        }
      } catch (error) {
        console.error('Error determining return handling method:', error);
        // Default to REDUCE_AP if we can't determine
        returnHandlingMethod = 'REDUCE_AP';
      }
    }

    res.json({ 
      purchaseInvoice,
      profit: profitData,
      returnHandlingMethod: returnHandlingMethod,
      returnRefundAccountId: returnRefundAccountId
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
      supplierId,
      paymentAmount,
      paymentAccountId,
      notes,
      items = []
    } = req.body;

    // Validate payment amount if provided
    const paidAmount = paymentAmount ? parseFloat(paymentAmount) : 0;
    if (paidAmount < 0 || paidAmount > totalAmount) {
      return res.status(400).json({ 
        error: 'Payment amount must be between 0 and total amount' 
      });
    }

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Create or find supplier if supplierName is provided
    let finalSupplierId = supplierId || null;
    if (supplierName && !supplierId) {
      // Try to find existing supplier by name
      let supplier = await prisma.supplier.findFirst({
        where: {
          tenantId: tenant.id,
          name: {
            equals: supplierName,
            mode: 'insensitive'
          }
        }
      });

      // If not found, create new supplier
      if (!supplier) {
        supplier = await prisma.supplier.create({
          data: {
            name: supplierName,
            tenantId: tenant.id,
            balance: 0
          }
        });
      }
      finalSupplierId = supplier.id;
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
          supplierId: finalSupplierId,
          paymentAmount: paidAmount > 0 ? paidAmount : null,
          paymentMethod: paidAmount > 0 ? (paymentAccountId ? await getPaymentMethodFromAccount(paymentAccountId, tenant.id) : null) : null,
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

    // Create accounting transaction for purchase invoice
    try {
      // Get or create accounts
      const inventoryAccount = await accountingService.getAccountByCode('1300', tenant.id) ||
        await accountingService.getOrCreateAccount({
          code: '1300',
          name: 'Inventory',
          type: 'ASSET',
          tenantId: tenant.id,
          balance: 0
        });

      const unpaidAmount = parseFloat(totalAmount) - paidAmount;
      const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      const transactionLines = [];

      // Always debit Inventory
      transactionLines.push({
        accountId: inventoryAccount.id,
        debitAmount: parseFloat(totalAmount),
        creditAmount: 0
      });

      // If paid (fully or partially), credit Cash/Bank
      if (paidAmount > 0) {
        // Require paymentAccountId when cash payment > 0
        if (!paymentAccountId) {
          return res.status(400).json({
            error: 'Payment account is required when making cash/bank payment'
          });
        }

        // Validate payment account exists and is Cash/Bank type
        const paymentAccount = await prisma.account.findFirst({
          where: {
            id: paymentAccountId,
            tenantId: tenant.id,
            type: 'ASSET',
            accountSubType: { in: ['CASH', 'BANK'] }
          }
        });

        if (!paymentAccount) {
          return res.status(400).json({
            error: 'Invalid payment account. Account must be a Cash or Bank account.'
          });
        }

        transactionLines.push({
          accountId: paymentAccount.id,
          debitAmount: 0,
          creditAmount: paidAmount
        });
      }

      // If unpaid (fully or partially), credit Accounts Payable
      if (unpaidAmount > 0) {
        let apAccount = await accountingService.getAccountByCode('2000', tenant.id);
        if (!apAccount) {
          apAccount = await accountingService.getOrCreateAccount({
            code: '2000',
            name: 'Accounts Payable',
            type: 'LIABILITY',
            tenantId: tenant.id,
            balance: 0
          });
        }

        transactionLines.push({
          accountId: apAccount.id,
          debitAmount: 0,
          creditAmount: unpaidAmount
        });
      }

      // Create transaction
      await accountingService.createTransaction(
        {
          transactionNumber,
          date: new Date(invoiceDate),
          description: `Purchase Invoice: ${invoiceNumber}${supplierName ? ` - ${supplierName}` : ''}${paidAmount > 0 ? ` (Paid: Rs. ${paidAmount})` : ''}`,
          tenantId: tenant.id,
          purchaseInvoiceId: result.purchaseInvoice.id
        },
        transactionLines
      );

      // Create Payment record for initial payment (if any) - for tracking/display purposes
      // The accounting entries are already created in the purchase transaction above
      // We don't link it to the transaction (transactionId stays null) to avoid conflicts
      if (paidAmount > 0 && finalSupplierId) {
        try {
          // Generate payment number
          const paymentCount = await prisma.payment.count({
            where: { tenantId: tenant.id }
          });
          const paymentNumber = `PAY-${new Date().getFullYear()}-${String(paymentCount + 1).padStart(4, '0')}`;

          // Create payment record linked to purchase invoice
          await prisma.payment.create({
            data: {
              paymentNumber,
              date: new Date(invoiceDate),
              type: 'SUPPLIER_PAYMENT',
              amount: paidAmount,
              paymentMethod: paymentAccountId ? await getPaymentMethodFromAccount(paymentAccountId, tenant.id) : 'Cash',
              accountId: paymentAccountId || null,
              tenantId: tenant.id,
              supplierId: finalSupplierId,
              purchaseInvoiceId: result.purchaseInvoice.id
              // transactionId is null - accounting entries are in the purchase transaction
            }
          });

          console.log(`✅ Initial payment record created for purchase invoice ${invoiceNumber}`);
        } catch (paymentError) {
          console.error('Error creating initial payment record:', paymentError);
          // Don't fail purchase invoice creation if payment record creation fails
        }
      }

      console.log(`✅ Accounting entry created for purchase invoice ${invoiceNumber}`);
    } catch (accountingError) {
      console.error('Error creating accounting entries for purchase invoice:', accountingError);
      // Don't fail purchase invoice creation if accounting fails
      // Log error but continue
    }

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

// Update purchase invoice with products (Business Owner only)
router.put('/:id/with-products', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('invoiceNumber').optional().trim(),
  body('invoiceDate').optional().isISO8601(),
  body('totalAmount').optional().isFloat({ min: 0 }),
  body('supplierName').optional().trim(),
  body('notes').optional().trim(),
  body('products').optional().isArray(),
  body('products.*.name').optional().trim().notEmpty(),
  body('products.*.purchasePrice').optional().isFloat({ min: 0 }),
  body('products.*.quantity').optional().isInt({ min: 1 }),
  body('returnItems').optional().isArray(),
  body('returnItems.*.name').optional().trim().notEmpty(),
  body('returnItems.*.productName').optional().trim().notEmpty(),
  body('returnItems.*.purchasePrice').optional().isFloat({ min: 0 }),
  body('returnItems.*.quantity').optional().isInt({ min: 1 }),
  body('returnHandlingMethod').optional().isIn(['REDUCE_AP', 'REFUND']),
  body('returnRefundAccountId').optional().trim()
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
    const { invoiceNumber, invoiceDate, totalAmount, supplierName, notes, products, returnItems, returnHandlingMethod, returnRefundAccountId } = req.body;
    
    // Normalize returnItems - handle both 'name' and 'productName' fields
    const normalizedReturnItems = (returnItems || []).map(item => ({
      ...item,
      productName: item.productName || item.name,
      name: item.name || item.productName
    }));
    
    // Calculate purchase total and return total
    const purchaseTotal = (products || []).reduce((sum, p) => sum + (parseFloat(p.purchasePrice || 0) * parseInt(p.quantity || 0)), 0);
    const returnTotal = normalizedReturnItems.reduce((sum, r) => sum + (parseFloat(r.purchasePrice || 0) * parseInt(r.quantity || 0)), 0);
    const netAmount = purchaseTotal - returnTotal;
    
    // Validate net amount is not negative
    if (netAmount < 0) {
      return res.status(400).json({ 
        error: `Return total (Rs. ${returnTotal.toFixed(2)}) cannot exceed purchase total (Rs. ${purchaseTotal.toFixed(2)})` 
      });
    }
    
    // Validate return handling method if return items exist
    if (normalizedReturnItems.length > 0) {
      if (!returnHandlingMethod || !['REDUCE_AP', 'REFUND'].includes(returnHandlingMethod)) {
        return res.status(400).json({ 
          error: 'Return handling method is required when return items are present. Must be either "REDUCE_AP" or "REFUND".' 
        });
      }
      
      if (returnHandlingMethod === 'REFUND' && !returnRefundAccountId) {
        return res.status(400).json({ 
          error: 'Return refund account is required when return handling method is "REFUND".' 
        });
      }
      
      // Validate return refund account exists and is Cash/Bank type
      if (returnHandlingMethod === 'REFUND') {
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
    }

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
      },
      include: {
        purchaseItems: {
          where: { isDeleted: false }
        },
        returns: {
          where: {
            returnType: 'SUPPLIER'
          },
          include: {
            returnItems: true
          }
        }
      }
    });

    if (!existingInvoice) {
      return res.status(404).json({ error: 'Purchase invoice not found' });
    }

    // Store old values for comparison
    const oldPurchaseItems = JSON.parse(JSON.stringify(existingInvoice.purchaseItems));
    
    // Identify standalone returns (those with their own accounting transactions via orderReturnId)
    // These should NOT be included in adjustment calculations since they have their own accounting
    const standaloneReturnIds = new Set();
    if (existingInvoice.returns && existingInvoice.returns.length > 0) {
      for (const returnRecord of existingInvoice.returns) {
        const hasStandaloneTransaction = await prisma.transaction.findFirst({
          where: {
            orderReturnId: returnRecord.id,
            tenantId: tenant.id
          }
        });
        if (hasStandaloneTransaction) {
          standaloneReturnIds.add(returnRecord.id);
        }
      }
    }
    
    // Calculate oldReturnItems excluding standalone returns (they have their own accounting)
    const oldReturnItems = existingInvoice.returns && existingInvoice.returns.length > 0
      ? existingInvoice.returns
          .filter(r => !standaloneReturnIds.has(r.id)) // Exclude standalone returns
          .flatMap(r => r.returnItems.map(ri => ({ ...ri, returnId: r.id })))
      : [];
    const oldPurchaseTotal = oldPurchaseItems.reduce((sum, p) => sum + (parseFloat(p.purchasePrice || 0) * parseInt(p.quantity || 0)), 0);
    const oldReturnTotal = oldReturnItems.reduce((sum, r) => sum + (parseFloat(r.purchasePrice || 0) * parseInt(r.quantity || 0)), 0);
    const oldNetAmount = oldPurchaseTotal - oldReturnTotal;
    const newPurchaseTotal = purchaseTotal;
    const newReturnTotal = returnTotal;
    const newNetAmount = netAmount;
    const netAmountDifference = newNetAmount - oldNetAmount;
    
    // Use net amount as totalAmount if not provided
    const finalTotalAmount = totalAmount !== undefined ? parseFloat(totalAmount) : newNetAmount;

    // Create or find supplier if supplierName is provided
    let finalSupplierId = existingInvoice.supplierId || null;
    if (supplierName !== undefined && supplierName && supplierName.trim()) {
      // Try to find existing supplier by name
      let supplier = await prisma.supplier.findFirst({
        where: {
          tenantId: tenant.id,
          name: {
            equals: supplierName.trim(),
            mode: 'insensitive'
          }
        }
      });

      // If not found, create new supplier
      if (!supplier) {
        supplier = await prisma.supplier.create({
          data: {
            name: supplierName.trim(),
            tenantId: tenant.id,
            balance: 0
          }
        });
      }
      finalSupplierId = supplier.id;
    } else if (supplierName !== undefined && (!supplierName || !supplierName.trim())) {
      // Clear supplier if supplierName is empty
      finalSupplierId = null;
    }

    // Update invoice and products in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update the invoice
      const updatedInvoice = await tx.purchaseInvoice.update({
        where: { id: id },
        data: {
          ...(invoiceNumber && { invoiceNumber }),
          ...(invoiceDate && { invoiceDate: new Date(invoiceDate) }),
          ...(totalAmount !== undefined && { totalAmount: finalTotalAmount }),
          ...(supplierName !== undefined && { supplierName: supplierName ? supplierName.trim() : null }),
          ...(finalSupplierId !== undefined && { supplierId: finalSupplierId }),
          ...(notes !== undefined && { notes: notes || null })
        }
      });

      // Handle products if provided
      if (products && Array.isArray(products)) {
        // Get existing purchase items
        const existingItems = await tx.purchaseItem.findMany({
          where: { purchaseInvoiceId: id, isDeleted: false }
        });

        // Create a map of existing items by id
        const existingItemsMap = new Map(existingItems.map(item => [item.id, item]));

        // Process products
        const itemsToCreate = [];
        const itemsToUpdate = [];
        const itemsToDelete = [];

        for (const product of products) {
          if (product.id && existingItemsMap.has(product.id)) {
            // Update existing item
            itemsToUpdate.push({
              id: product.id,
              data: {
                name: product.name.trim(),
                quantity: parseInt(product.quantity),
                purchasePrice: parseFloat(product.purchasePrice),
                sku: product.sku?.trim() || null,
                category: product.category?.trim() || null,
                description: product.description?.trim() || null
              }
            });
            existingItemsMap.delete(product.id);
          } else {
            // New item to create
            itemsToCreate.push({
              name: product.name.trim(),
              quantity: parseInt(product.quantity),
              purchasePrice: parseFloat(product.purchasePrice),
              sku: product.sku?.trim() || null,
              category: product.category?.trim() || null,
              description: product.description?.trim() || null,
              tenantId: tenant.id,
              purchaseInvoiceId: id
            });
          }
        }

        // Items that exist but weren't in the update list should be deleted
        existingItemsMap.forEach((item) => {
          itemsToDelete.push(item.id);
        });

        // Delete items
        if (itemsToDelete.length > 0) {
          await tx.purchaseItem.updateMany({
            where: { id: { in: itemsToDelete } },
            data: {
              isDeleted: true,
              deletedAt: new Date()
            }
          });
        }

        // Update items
        for (const itemUpdate of itemsToUpdate) {
          await tx.purchaseItem.update({
            where: { id: itemUpdate.id },
            data: itemUpdate.data
          });
        }

        // Create new items
        if (itemsToCreate.length > 0) {
          await tx.purchaseItem.createMany({
            data: itemsToCreate
          });
        }

        // Get all purchase items (including new ones)
        const allPurchaseItems = await tx.purchaseItem.findMany({
          where: { purchaseInvoiceId: id, isDeleted: false }
        });

        // Handle return items if provided
        let allReturnItems = [];
        if (returnItems !== undefined) {
          // Get existing return records for this invoice
          const existingReturns = await tx.return.findMany({
            where: {
              purchaseInvoiceId: id,
              returnType: 'SUPPLIER'
            },
            include: {
              returnItems: true
            }
          });

          // Create a map of existing return items by id
          const existingReturnItemsMap = new Map();
          existingReturns.forEach(ret => {
            ret.returnItems.forEach(item => {
              existingReturnItemsMap.set(item.id, { ...item, returnId: ret.id });
            });
          });

          // Process return items
          const returnItemsToCreate = [];
          const returnItemsToUpdate = [];
          const returnItemsToDelete = [];

          for (const returnItem of normalizedReturnItems) {
            if (returnItem.id && existingReturnItemsMap.has(returnItem.id)) {
              // Update existing return item
              returnItemsToUpdate.push({
                id: returnItem.id,
                data: {
                  productName: returnItem.productName || returnItem.name,
                  description: returnItem.description || null,
                  purchasePrice: parseFloat(returnItem.purchasePrice),
                  quantity: parseInt(returnItem.quantity),
                  reason: returnItem.reason || 'Purchase invoice return',
                  sku: returnItem.sku || null
                }
              });
              existingReturnItemsMap.delete(returnItem.id);
            } else {
              // New return item to create
              // Find or create return record
              let returnRecord = existingReturns[0];
              if (!returnRecord) {
                const returnNumber = await generateReturnNumber(tenant.id);
                returnRecord = await tx.return.create({
                  data: {
                    returnNumber: returnNumber,
                    reason: 'Purchase invoice return',
                    returnDate: new Date(invoiceDate || existingInvoice.invoiceDate),
                    totalAmount: returnTotal,
                    returnType: 'SUPPLIER',
                    notes: `Return processed from purchase invoice ${invoiceNumber || existingInvoice.invoiceNumber}`,
                    tenantId: tenant.id,
                    purchaseInvoiceId: id
                  }
                });
              } else if (returnTotal > 0) {
                // Update existing return record total
                await tx.return.update({
                  where: { id: returnRecord.id },
                  data: {
                    totalAmount: returnTotal,
                    returnDate: invoiceDate ? new Date(invoiceDate) : undefined
                  }
                });
              }

              returnItemsToCreate.push({
                productName: returnItem.productName || returnItem.name,
                description: returnItem.description || null,
                purchasePrice: parseFloat(returnItem.purchasePrice),
                quantity: parseInt(returnItem.quantity),
                reason: returnItem.reason || 'Purchase invoice return',
                sku: returnItem.sku || null,
                returnId: returnRecord.id
              });
            }
          }

          // Delete return items that exist but weren't in the update list
          existingReturnItemsMap.forEach((item) => {
            returnItemsToDelete.push(item.id);
          });

          // Delete return items
          if (returnItemsToDelete.length > 0) {
            await tx.returnItem.deleteMany({
              where: { id: { in: returnItemsToDelete } }
            });
          }

          // Update return items
          for (const itemUpdate of returnItemsToUpdate) {
            await tx.returnItem.update({
              where: { id: itemUpdate.id },
              data: itemUpdate.data
            });
          }

          // Create new return items
          if (returnItemsToCreate.length > 0) {
            await tx.returnItem.createMany({
              data: returnItemsToCreate
            });
          }

          // Delete return records if no return items remain
          if (normalizedReturnItems.length === 0 && existingReturns.length > 0) {
            for (const ret of existingReturns) {
              await tx.returnItem.deleteMany({
                where: { returnId: ret.id }
              });
              await tx.return.delete({
                where: { id: ret.id }
              });
            }
          }

          // Get all return items (including new ones)
          const allReturns = await tx.return.findMany({
            where: {
              purchaseInvoiceId: id,
              returnType: 'SUPPLIER'
            },
            include: {
              returnItems: true
            }
          });
          allReturnItems = allReturns.flatMap(r => r.returnItems);
        } else {
          // Return items not provided - keep existing
          allReturnItems = oldReturnItems;
        }

        return { purchaseInvoice: updatedInvoice, purchaseItems: allPurchaseItems, returnItems: allReturnItems };
      }

      // If products not provided, get existing return items
      let allReturnItems = oldReturnItems;
      if (returnItems !== undefined) {
        // Handle return items even if products not provided
        const existingReturns = await tx.return.findMany({
          where: {
            purchaseInvoiceId: id,
            returnType: 'SUPPLIER'
          },
          include: {
            returnItems: true
          }
        });
        allReturnItems = existingReturns.flatMap(r => r.returnItems);
      }

      return { purchaseInvoice: updatedInvoice, purchaseItems: existingInvoice.purchaseItems, returnItems: allReturnItems };
    }, {
      timeout: 30000,
      maxWait: 10000
    });

    // Create accounting adjustment entries for purchase items (existing logic - PRESERVED)
    const purchaseAmountDifference = newPurchaseTotal - oldPurchaseTotal;
    if (Math.abs(purchaseAmountDifference) > 0.01) {
      try {
        // Get or create accounts
        const inventoryAccount = await accountingService.getAccountByCode('1300', tenant.id) ||
          await accountingService.getOrCreateAccount({
            code: '1300',
            name: 'Inventory',
            type: 'ASSET',
            tenantId: tenant.id,
            balance: 0
          });

        const apAccount = await accountingService.getAccountByCode('2000', tenant.id) ||
          await accountingService.getOrCreateAccount({
            code: '2000',
            name: 'Accounts Payable',
            type: 'LIABILITY',
            tenantId: tenant.id,
            balance: 0
          });

        const invoiceNum = result.purchaseInvoice.invoiceNumber || existingInvoice.invoiceNumber;

        // Create purchase invoice amount adjustment (existing logic)
        const transactionNumber = `TXN-ADJ-PURCHASE-${new Date().getFullYear()}-${Date.now()}`;
        const description = `Purchase Invoice Adjustment (Purchases): ${invoiceNum} (${purchaseAmountDifference > 0 ? 'Increase' : 'Decrease'}: Rs. ${Math.abs(purchaseAmountDifference).toFixed(2)})`;

        const transactionLines = [];

        // Adjust Inventory
        if (purchaseAmountDifference > 0) {
          // Increase: Debit Inventory
          transactionLines.push({
            accountId: inventoryAccount.id,
            debitAmount: purchaseAmountDifference,
            creditAmount: 0
          });
        } else {
          // Decrease: Credit Inventory
          transactionLines.push({
            accountId: inventoryAccount.id,
            debitAmount: 0,
            creditAmount: Math.abs(purchaseAmountDifference)
          });
        }

        // Adjust Accounts Payable (opposite of inventory)
        if (purchaseAmountDifference > 0) {
          // Increase: Credit AP (we owe more)
          transactionLines.push({
            accountId: apAccount.id,
            debitAmount: 0,
            creditAmount: purchaseAmountDifference
          });
        } else {
          // Decrease: Debit AP (we owe less)
          transactionLines.push({
            accountId: apAccount.id,
            debitAmount: Math.abs(purchaseAmountDifference),
            creditAmount: 0
          });
        }

        // Create adjustment transaction linked to purchase invoice
        await accountingService.createTransaction(
          {
            transactionNumber,
            date: new Date(),
            description,
            tenantId: tenant.id,
            purchaseInvoiceId: id
          },
          transactionLines
        );

        console.log(`✅ Purchase accounting adjustment entry created for purchase invoice ${invoiceNum}: Rs. ${purchaseAmountDifference > 0 ? '+' : ''}${purchaseAmountDifference.toFixed(2)}`);
      } catch (accountingError) {
        console.error('❌ Error creating purchase accounting adjustment entry:', accountingError);
        // Don't fail the update if accounting adjustment fails, but log it
      }
    }

    // Create accounting adjustment entries for return items (new logic)
    const returnAmountDifference = newReturnTotal - oldReturnTotal;
    if (Math.abs(returnAmountDifference) > 0.01 || (returnItems !== undefined && returnHandlingMethod)) {
      try {
        // Get or create accounts
        const inventoryAccount = await accountingService.getAccountByCode('1300', tenant.id) ||
          await accountingService.getOrCreateAccount({
            code: '1300',
            name: 'Inventory',
            type: 'ASSET',
            tenantId: tenant.id,
            balance: 0
          });

        const apAccount = await accountingService.getAccountByCode('2000', tenant.id) ||
          await accountingService.getOrCreateAccount({
            code: '2000',
            name: 'Accounts Payable',
            type: 'LIABILITY',
            tenantId: tenant.id,
            balance: 0
          });

        const invoiceNum = result.purchaseInvoice.invoiceNumber || existingInvoice.invoiceNumber;

        // Determine old return handling method from existing transactions
        let oldReturnHandlingMethod = 'REDUCE_AP'; // Default
        let oldReturnRefundAccountId = null;
        
        if (oldReturnTotal > 0) {
          try {
            const oldTransactions = await prisma.transaction.findMany({
              where: {
                purchaseInvoiceId: id,
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

            for (const txn of oldTransactions) {
              const inventoryCredits = txn.transactionLines.filter(line => 
                line.account.code === '1300' && line.creditAmount > 0
              );
              const apDebits = txn.transactionLines.filter(line => 
                line.account.code === '2000' && line.debitAmount > 0
              );
              const cashBankDebits = txn.transactionLines.filter(line => 
                (line.account.accountSubType === 'CASH' || line.account.accountSubType === 'BANK') && 
                line.debitAmount > 0
              );
              
              if (inventoryCredits.length > 0) {
                if (apDebits.length > 0 && Math.abs(apDebits[0].debitAmount - inventoryCredits[0].creditAmount) < 0.01) {
                  oldReturnHandlingMethod = 'REDUCE_AP';
                } else if (cashBankDebits.length > 0 && Math.abs(cashBankDebits[0].debitAmount - inventoryCredits[0].creditAmount) < 0.01) {
                  oldReturnHandlingMethod = 'REFUND';
                  oldReturnRefundAccountId = cashBankDebits[0].account.id;
                }
                break;
              }
            }
          } catch (error) {
            console.error('Error determining old return handling method:', error);
          }
        }

        // Validate return handling method if returns exist
        if (normalizedReturnItems.length > 0) {
          if (!returnHandlingMethod || !['REDUCE_AP', 'REFUND'].includes(returnHandlingMethod)) {
            return res.status(400).json({ 
              error: 'Return handling method is required when return items are present. Must be either "REDUCE_AP" or "REFUND".' 
            });
          }
          
          if (returnHandlingMethod === 'REFUND' && !returnRefundAccountId) {
            return res.status(400).json({ 
              error: 'Return refund account is required when return handling method is "REFUND".' 
            });
          }
          
          // Validate return refund account exists and is Cash/Bank type
          if (returnHandlingMethod === 'REFUND') {
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
        }

        // Check if return handling method changed
        const methodChanged = returnHandlingMethod && returnHandlingMethod !== oldReturnHandlingMethod;
        const returnTotalChanged = Math.abs(returnAmountDifference) > 0.01;

        if (returnTotalChanged || methodChanged) {
          // Reverse old return accounting (if returns existed)
          if (oldReturnTotal > 0) {
            try {
              const reverseTransactionNumber = `TXN-ADJ-RETURN-REVERSE-${new Date().getFullYear()}-${Date.now()}`;
              const reverseDescription = `Purchase Invoice Return Adjustment (Reverse): ${invoiceNum} (Rs. ${oldReturnTotal.toFixed(2)}, Method: ${oldReturnHandlingMethod || 'N/A'})`;
              const reverseTransactionLines = [];

              // Reverse: Debit Inventory (opposite of original Credit)
              reverseTransactionLines.push({
                accountId: inventoryAccount.id,
                debitAmount: oldReturnTotal,
                creditAmount: 0
              });

              // Reverse the old method
              if (oldReturnHandlingMethod === 'REDUCE_AP') {
                // Reverse: Credit AP (opposite of original Debit)
                reverseTransactionLines.push({
                  accountId: apAccount.id,
                  debitAmount: 0,
                  creditAmount: oldReturnTotal
                });
              } else if (oldReturnHandlingMethod === 'REFUND' && oldReturnRefundAccountId) {
                // Reverse: Credit Cash/Bank (opposite of original Debit)
                const oldRefundAccount = await prisma.account.findFirst({
                  where: {
                    id: oldReturnRefundAccountId,
                    tenantId: tenant.id
                  }
                });
                
                if (oldRefundAccount) {
                  reverseTransactionLines.push({
                    accountId: oldRefundAccount.id,
                    debitAmount: 0,
                    creditAmount: oldReturnTotal
                  });
                } else {
                  console.warn(`⚠️ Old refund account ${oldReturnRefundAccountId} not found, skipping reversal`);
                  // Still need to balance the transaction - use AP as fallback
                  reverseTransactionLines.push({
                    accountId: apAccount.id,
                    debitAmount: 0,
                    creditAmount: oldReturnTotal
                  });
                }
              }

              // Validate transaction balance before creating
              const totalDebits = reverseTransactionLines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
              const totalCredits = reverseTransactionLines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);
              
              if (Math.abs(totalDebits - totalCredits) > 0.01) {
                throw new Error(`Reversal transaction is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
              }

              await accountingService.createTransaction(
                {
                  transactionNumber: reverseTransactionNumber,
                  date: new Date(),
                  description: reverseDescription,
                  tenantId: tenant.id,
                  purchaseInvoiceId: id
                },
                reverseTransactionLines
              );
              
              console.log(`✅ Reversed old return accounting: Rs. ${oldReturnTotal.toFixed(2)} (${oldReturnHandlingMethod || 'N/A'})`);
            } catch (reversalError) {
              console.error('❌ Error reversing old return accounting:', reversalError);
              // Fail the entire update if reversal fails - this is critical
              return res.status(500).json({ 
                error: 'Failed to reverse old return accounting entries',
                details: reversalError.message 
              });
            }
          }

          // Create new return accounting (if returns exist now)
          if (newReturnTotal > 0) {
            try {
              const newTransactionNumber = `TXN-ADJ-RETURN-${new Date().getFullYear()}-${Date.now()}`;
              const newDescription = `Purchase Invoice Return Adjustment: ${invoiceNum} (Rs. ${newReturnTotal.toFixed(2)}, Method: ${returnHandlingMethod})`;
              const newTransactionLines = [];

              // Credit Inventory
              newTransactionLines.push({
                accountId: inventoryAccount.id,
                debitAmount: 0,
                creditAmount: newReturnTotal
              });

              // Debit based on new method
              if (returnHandlingMethod === 'REDUCE_AP') {
                newTransactionLines.push({
                  accountId: apAccount.id,
                  debitAmount: newReturnTotal,
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
                
                newTransactionLines.push({
                  accountId: refundAccount.id,
                  debitAmount: newReturnTotal,
                  creditAmount: 0
                });
              } else {
                throw new Error('Invalid return handling method or missing refund account');
              }

              // Validate transaction balance
              const totalDebits = newTransactionLines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
              const totalCredits = newTransactionLines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);
              
              if (Math.abs(totalDebits - totalCredits) > 0.01) {
                throw new Error(`New return transaction is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
              }

              await accountingService.createTransaction(
                {
                  transactionNumber: newTransactionNumber,
                  date: new Date(),
                  description: newDescription,
                  tenantId: tenant.id,
                  purchaseInvoiceId: id
                },
                newTransactionLines
              );
              
              console.log(`✅ Created new return accounting: Rs. ${newReturnTotal.toFixed(2)} (${returnHandlingMethod})`);
            } catch (newTransactionError) {
              console.error('❌ Error creating new return accounting:', newTransactionError);
              // Fail the entire update if new transaction creation fails
              return res.status(500).json({ 
                error: 'Failed to create new return accounting entries',
                details: newTransactionError.message 
              });
            }
          } else {
            // All returns deleted - log for audit
            console.log(`ℹ️ All returns deleted for invoice ${invoiceNum}`);
          }

          console.log(`✅ Return accounting adjustment completed for purchase invoice ${invoiceNum}: Old: Rs. ${oldReturnTotal.toFixed(2)} (${oldReturnHandlingMethod || 'N/A'}), New: Rs. ${newReturnTotal.toFixed(2)} (${returnHandlingMethod || 'N/A'})`);
        }
        } catch (accountingError) {
          console.error('❌ Error creating return accounting adjustment entry:', accountingError);
          // Fail the entire update if accounting adjustment fails - this is critical
          return res.status(500).json({ 
            error: 'Failed to process return accounting entries',
            details: accountingError.message 
          });
        }
    }

    // Update inventory if products were modified (existing logic - PRESERVED)
    if (products && Array.isArray(products)) {
      try {
        console.log('🔄 Calling updateInventoryFromPurchaseEdit with:');
        console.log('  - Old items:', oldPurchaseItems.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, productId: i.productId })));
        console.log('  - New items:', result.purchaseItems.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, productId: i.productId })));
        
        const inventoryResult = await InventoryService.updateInventoryFromPurchaseEdit(
          tenant.id,
          oldPurchaseItems,
          result.purchaseItems,
          id,
          result.purchaseInvoice.invoiceNumber || existingInvoice.invoiceNumber
        );
        
        console.log('✅ Inventory update result:', inventoryResult);
      } catch (inventoryError) {
        console.error('❌ Error updating inventory after purchase edit:', inventoryError);
        console.error('Error stack:', inventoryError.stack);
        // Return error to user so they know inventory update failed
        return res.status(500).json({ 
          error: 'Purchase invoice updated but inventory update failed',
          details: inventoryError.message 
        });
      }
    }

    // Update inventory if return items were modified (new logic)
    if (returnItems !== undefined) {
      try {
        console.log('🔄 Calling updateInventoryFromReturnEdit with:');
        console.log('  - Old return items:', oldReturnItems.map(i => ({ id: i.id, productName: i.productName, quantity: i.quantity })));
        console.log('  - New return items:', result.returnItems.map(i => ({ id: i.id, productName: i.productName, quantity: i.quantity })));
        
        const inventoryResult = await InventoryService.updateInventoryFromReturnEdit(
          tenant.id,
          oldReturnItems,
          result.returnItems,
          id,
          result.purchaseInvoice.invoiceNumber || existingInvoice.invoiceNumber
        );
        
        console.log('✅ Return inventory update result:', inventoryResult);
      } catch (inventoryError) {
        console.error('❌ Error updating inventory after return edit:', inventoryError);
        console.error('Error stack:', inventoryError.stack);
        // Return error to user so they know inventory update failed
        return res.status(500).json({ 
          error: 'Purchase invoice updated but return inventory update failed',
          details: inventoryError.message 
        });
      }
    }

    res.json({
      success: true,
      message: 'Purchase invoice updated successfully',
      purchaseInvoice: result.purchaseInvoice,
      items: result.purchaseItems,
      returnItems: result.returnItems || []
    });

  } catch (error) {
    console.error('Update purchase invoice with products error:', error);
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