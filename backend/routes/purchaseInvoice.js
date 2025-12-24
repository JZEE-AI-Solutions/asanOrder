const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const InventoryService = require('../services/inventoryService');
const profitService = require('../services/profitService');
const accountingService = require('../services/accountingService');
const balanceService = require('../services/balanceService');
const { generateInvoiceNumber } = require('../utils/invoiceNumberGenerator');

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

    let { invoiceNumber, invoiceDate, totalAmount, products, supplierName, supplierId, paymentAmount, paymentAccountId, notes, useAdvanceBalance, advanceAmountUsed } = req.body;
    
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
          supplierId: finalSupplierId,
          invoiceDate: new Date(invoiceDate),
          totalAmount: totalAmount,
          paymentAmount: paidAmount > 0 ? paidAmount : null,
          paymentMethod: paidAmount > 0 ? (paymentAccountId ? await getPaymentMethodFromAccount(paymentAccountId, tenant.id) : null) : null,
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

      // Calculate amounts: totalAmount = paidAmount (cash/bank) + actualAdvanceUsed + unpaidAmount
      const unpaidAmount = totalAmount - paidAmount - actualAdvanceUsed;
      const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      const transactionLines = [];

      // Always debit Inventory
      transactionLines.push({
        accountId: inventoryAccount.id,
        debitAmount: totalAmount,
        creditAmount: 0
      });

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

      // Create transaction
      let description = `Purchase Invoice: ${invoiceNumber}${supplierName ? ` - ${supplierName}` : ''}`;
      if (paidAmount > 0) {
        description += ` (Paid: Rs. ${paidAmount})`;
      }
      if (actualAdvanceUsed > 0) {
        description += ` (Advance Used: Rs. ${actualAdvanceUsed})`;
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
    const errorMessage = error.message || 'Failed to create purchase invoice';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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
            supplierId: true
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
  body('products.*.quantity').optional().isInt({ min: 1 })
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
    const { invoiceNumber, invoiceDate, totalAmount, supplierName, notes, products } = req.body;

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
        }
      }
    });

    if (!existingInvoice) {
      return res.status(404).json({ error: 'Purchase invoice not found' });
    }

    // Store old values for comparison
    const oldPurchaseItems = JSON.parse(JSON.stringify(existingInvoice.purchaseItems));
    const oldTotalAmount = existingInvoice.totalAmount;
    const newTotalAmount = totalAmount ? parseFloat(totalAmount) : oldTotalAmount;
    const amountDifference = newTotalAmount - oldTotalAmount;

    // Update invoice and products in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update the invoice
      const updatedInvoice = await tx.purchaseInvoice.update({
        where: { id: id },
        data: {
          ...(invoiceNumber && { invoiceNumber }),
          ...(invoiceDate && { invoiceDate: new Date(invoiceDate) }),
          ...(totalAmount && { totalAmount: parseFloat(totalAmount) }),
          ...(supplierName !== undefined && { supplierName: supplierName || null }),
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

        return { purchaseInvoice: updatedInvoice, purchaseItems: allPurchaseItems };
      }

      return { purchaseInvoice: updatedInvoice, purchaseItems: existingInvoice.purchaseItems };
    }, {
      timeout: 30000,
      maxWait: 10000
    });

    // Create accounting adjustment entries if total amount changed
    if (Math.abs(amountDifference) > 0.01) {
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

        // 1. Create purchase invoice amount adjustment
        const transactionNumber = `TXN-ADJ-${new Date().getFullYear()}-${Date.now()}`;
        const description = `Purchase Invoice Adjustment: ${invoiceNum} (${amountDifference > 0 ? 'Increase' : 'Decrease'}: Rs. ${Math.abs(amountDifference).toFixed(2)})`;

        const transactionLines = [];

        // Adjust Inventory
        if (amountDifference > 0) {
          // Increase: Debit Inventory
          transactionLines.push({
            accountId: inventoryAccount.id,
            debitAmount: amountDifference,
            creditAmount: 0
          });
        } else {
          // Decrease: Credit Inventory
          transactionLines.push({
            accountId: inventoryAccount.id,
            debitAmount: 0,
            creditAmount: Math.abs(amountDifference)
          });
        }

        // Adjust Accounts Payable (opposite of inventory)
        if (amountDifference > 0) {
          // Increase: Credit AP (we owe more)
          transactionLines.push({
            accountId: apAccount.id,
            debitAmount: 0,
            creditAmount: amountDifference
          });
        } else {
          // Decrease: Debit AP (we owe less)
          transactionLines.push({
            accountId: apAccount.id,
            debitAmount: Math.abs(amountDifference),
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

        console.log(`✅ Accounting adjustment entry created for purchase invoice ${invoiceNum}: Rs. ${amountDifference > 0 ? '+' : ''}${amountDifference.toFixed(2)}`);
      } catch (accountingError) {
        console.error('❌ Error creating accounting adjustment entry:', accountingError);
        // Don't fail the update if accounting adjustment fails, but log it
      }
    }

    // Update inventory if products were modified
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

    res.json({
      success: true,
      message: 'Purchase invoice updated successfully',
      purchaseInvoice: result.purchaseInvoice,
      items: result.purchaseItems
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