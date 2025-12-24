const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const prisma = require('../../lib/db');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const balanceService = require('../../services/balanceService');
const accountingService = require('../../services/accountingService');

// Get all suppliers for a tenant with pagination and search
router.get('/', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      page = 1,
      limit = 20,
      search = '',
      sortBy = 'name',
      sortOrder = 'asc',
      hasPendingPayment = false
    } = req.query;

    // Build where clause
    const where = {
      tenantId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { contact: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    // Get suppliers with pagination
    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        include: {
          _count: {
            select: {
              purchaseInvoices: {
                where: { isDeleted: false }
              }
            }
          }
        }
      }),
      prisma.supplier.count({ where })
    ]);

    // Calculate balance for each supplier (always calculate for consistent UI)
    const suppliersWithBalance = await Promise.all(
      suppliers.map(async (supplier) => {
        try {
          const balance = await balanceService.calculateSupplierBalance(supplier.id);
          return { ...supplier, balance };
        } catch (error) {
          console.error(`Error calculating balance for supplier ${supplier.id}:`, error);
          // Return supplier with null balance if calculation fails
          return { ...supplier, balance: null };
        }
      })
    );

    // Filter by pending payments if filter is active
    let filteredSuppliers = suppliersWithBalance;
    if (hasPendingPayment === 'true' || hasPendingPayment === true) {
      filteredSuppliers = suppliersWithBalance.filter(s => s.balance && s.balance.pending > 0);
    }

    res.json({
      success: true,
      suppliers: filteredSuppliers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: hasPendingPayment ? filteredSuppliers.length : total,
        pages: Math.ceil((hasPendingPayment ? filteredSuppliers.length : total) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch suppliers'
      }
    });
  }
});

// Create new supplier
router.post('/', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('contact').optional().trim(),
  body('address').optional().trim(),
  body('email').optional().isEmail().withMessage('Invalid email address'),
  body('phone').optional().trim(),
  body('balance').optional().isFloat().withMessage('Balance must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const tenantId = req.user.tenant.id;
    const { name, contact, address, email, phone, balance = 0 } = req.body;

    // Check if supplier with same name already exists
    const existingSupplier = await prisma.supplier.findFirst({
      where: {
        tenantId,
        name: {
          equals: name,
          mode: 'insensitive'
        }
      }
    });

    if (existingSupplier) {
      return res.status(400).json({
        error: 'Supplier with this name already exists'
      });
    }

    // Create supplier
    const supplier = await prisma.supplier.create({
      data: {
        name,
        contact: contact || null,
        address: address || null,
        email: email || null,
        phone: phone || null,
        balance: parseFloat(balance) || 0,
        tenantId
      }
    });

    // Create accounting entry if balance is provided
    const balanceAmount = parseFloat(balance) || 0;
    if (balanceAmount !== 0) {
      try {
        // Get or create Opening Balance equity account
        const openingBalanceAccount = await accountingService.getAccountByCode('3001', tenantId) ||
          await accountingService.getOrCreateAccount({
            code: '3001',
            name: 'Opening Balance',
            type: 'EQUITY',
            tenantId,
            balance: 0
          });

        const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}-SUP-OB`;
        const transactionLines = [];

        if (balanceAmount < 0) {
          // Negative balance = Supplier Owes Us (we paid them advance OR we returned products)
          // Debit Advance to Suppliers (ASSET - we paid them, they owe us goods/services)
          // Credit Opening Balance (source of funds - we paid them, so equity decreases)
          const advanceToSuppliersAccount = await accountingService.getAccountByCode('1230', tenantId) ||
            await accountingService.getOrCreateAccount({
              code: '1230',
              name: 'Advance to Suppliers',
              type: 'ASSET',
              tenantId,
              balance: 0
            });

          transactionLines.push(
            {
              accountId: advanceToSuppliersAccount.id,
              debitAmount: Math.abs(balanceAmount), // Debit increases asset
              creditAmount: 0
            },
            {
              accountId: openingBalanceAccount.id,
              debitAmount: 0,
              creditAmount: Math.abs(balanceAmount) // Credit decreases equity (we paid them, so equity decreases)
            }
          );
        } else {
          // Positive balance = We owe supplier (Accounts Payable)
          // Credit Accounts Payable (LIABILITY - we owe them)
          // Debit Opening Balance
          const apAccount = await accountingService.getAccountByCode('2000', tenantId) ||
            await accountingService.getOrCreateAccount({
              code: '2000',
              name: 'Accounts Payable',
              type: 'LIABILITY',
              tenantId,
              balance: 0
            });

          transactionLines.push(
            {
              accountId: apAccount.id,
              debitAmount: 0,
              creditAmount: balanceAmount // Credit increases liability
            },
            {
              accountId: openingBalanceAccount.id,
              debitAmount: balanceAmount,
              creditAmount: 0
            }
          );
        }

        await accountingService.createTransaction({
          transactionNumber,
          date: new Date(),
          description: `Supplier Opening Balance - ${name}`,
          tenantId
        }, transactionLines);
      } catch (accountingError) {
        console.error('Error creating accounting entry for supplier opening balance:', accountingError);
        // Don't fail supplier creation if accounting entry fails
        // The balance is still stored in supplier.balance and will be used in calculations
      }
    }

    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      supplier
    });
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create supplier'
    });
  }
});

// Get supplier by ID
router.get('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;

    const supplier = await prisma.supplier.findFirst({
      where: {
        id,
        tenantId
      },
      include: {
        purchaseInvoices: {
          where: { isDeleted: false },
          orderBy: { invoiceDate: 'desc' },
          take: 10,
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            totalAmount: true,
            paymentAmount: true
          }
        },
        payments: {
          where: { type: 'SUPPLIER_PAYMENT' },
          orderBy: { date: 'desc' },
          take: 10,
          select: {
            id: true,
            paymentNumber: true,
            date: true,
            amount: true,
            paymentMethod: true
          }
        },
        _count: {
          select: {
            purchaseInvoices: {
              where: { isDeleted: false }
            },
            payments: true
          }
        }
      }
    });

    if (!supplier) {
      return res.status(404).json({
        error: 'Supplier not found'
      });
    }

    // Calculate balance
    let balance = null;
    try {
      balance = await balanceService.calculateSupplierBalance(supplier.id);
    } catch (error) {
      console.error('Error calculating supplier balance:', error);
    }

    res.json({
      success: true,
      supplier: {
        ...supplier,
        balance
      }
    });
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch supplier'
    });
  }
});

// Update supplier
router.put('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('name').optional().trim().isLength({ min: 2 }),
  body('contact').optional().trim(),
  body('address').optional().trim(),
  body('email').optional().isEmail(),
  body('phone').optional().trim(),
  body('balance').optional().isFloat()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const tenantId = req.user.tenant.id;
    const { id } = req.params;
    const updateData = req.body;

    // Verify supplier belongs to tenant
    const supplier = await prisma.supplier.findFirst({
      where: { id, tenantId }
    });

    if (!supplier) {
      return res.status(404).json({
        error: 'Supplier not found'
      });
    }

    // Check if name is being updated and if it's unique
    if (updateData.name && updateData.name !== supplier.name) {
      const existingSupplier = await prisma.supplier.findFirst({
        where: {
          tenantId,
          name: {
            equals: updateData.name,
            mode: 'insensitive'
          },
          id: { not: id }
        }
      });

      if (existingSupplier) {
        return res.status(400).json({
          error: 'Supplier with this name already exists'
        });
      }
    }

    // Handle balance update with accounting entries
    const oldBalance = supplier.balance || 0;
    const newBalance = updateData.balance !== undefined ? parseFloat(updateData.balance) : oldBalance;
    const balanceChanged = updateData.balance !== undefined && oldBalance !== newBalance;

    // Update supplier
    const updatedSupplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(updateData.name && { name: updateData.name }),
        ...(updateData.contact !== undefined && { contact: updateData.contact || null }),
        ...(updateData.address !== undefined && { address: updateData.address || null }),
        ...(updateData.email !== undefined && { email: updateData.email || null }),
        ...(updateData.phone !== undefined && { phone: updateData.phone || null }),
        ...(updateData.balance !== undefined && { balance: newBalance })
      }
    });

    // Create accounting adjustment entry if balance changed
    if (balanceChanged) {
      try {
        const balanceDifference = newBalance - oldBalance;
        
        if (balanceDifference !== 0) {
          // Get or create Opening Balance equity account
          const openingBalanceAccount = await accountingService.getAccountByCode('3001', tenantId) ||
            await accountingService.getOrCreateAccount({
              code: '3001',
              name: 'Opening Balance',
              type: 'EQUITY',
              tenantId,
              balance: 0
            });

          const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}-SUP-ADJ`;
          const transactionLines = [];

          // Determine which accounts need adjustment based on old and new balance types
          const oldIsAdvance = oldBalance < 0;
          const newIsAdvance = newBalance < 0;
          const oldIsPayable = oldBalance > 0;
          const newIsPayable = newBalance > 0;

          if (oldIsAdvance && newIsAdvance) {
            // Both are advance (Supplier Owes Us - we paid them advance/returned products)
            // Adjust Advance to Suppliers (ASSET)
            const advanceToSuppliersAccount = await accountingService.getAccountByCode('1230', tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '1230',
                name: 'Advance to Suppliers',
                type: 'ASSET',
                tenantId,
                balance: 0
              });

            const adjustmentAmount = Math.abs(balanceDifference);
            if (balanceDifference < 0) {
              // Increase in advance (more negative = more we paid them/returned)
              transactionLines.push(
                {
                  accountId: advanceToSuppliersAccount.id,
                  debitAmount: adjustmentAmount, // Debit increases asset
                  creditAmount: 0
                },
                {
                  accountId: openingBalanceAccount.id,
                  debitAmount: 0,
                  creditAmount: adjustmentAmount // Credit decreases equity
                }
              );
            } else {
              // Decrease in advance (less negative = less we paid them/returned)
              transactionLines.push(
                {
                  accountId: advanceToSuppliersAccount.id,
                  debitAmount: 0,
                  creditAmount: adjustmentAmount // Credit decreases asset
                },
                {
                  accountId: openingBalanceAccount.id,
                  debitAmount: adjustmentAmount, // Debit increases equity
                  creditAmount: 0
                }
              );
            }
          } else if (oldIsPayable && newIsPayable) {
            // Both are payable, just adjust Accounts Payable
            const apAccount = await accountingService.getAccountByCode('2000', tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '2000',
                name: 'Accounts Payable',
                type: 'LIABILITY',
                tenantId,
                balance: 0
              });

            const adjustmentAmount = Math.abs(balanceDifference);
            if (balanceDifference > 0) {
              // Increase in payable
              transactionLines.push(
                {
                  accountId: apAccount.id,
                  debitAmount: 0,
                  creditAmount: adjustmentAmount // Credit increases liability
                },
                {
                  accountId: openingBalanceAccount.id,
                  debitAmount: adjustmentAmount,
                  creditAmount: 0
                }
              );
            } else {
              // Decrease in payable
              transactionLines.push(
                {
                  accountId: apAccount.id,
                  debitAmount: adjustmentAmount, // Debit decreases liability
                  creditAmount: 0
                },
                {
                  accountId: openingBalanceAccount.id,
                  debitAmount: 0,
                  creditAmount: adjustmentAmount
                }
              );
            }
          } else {
            // Balance type changed (advance to payable or vice versa)
            // Need to reverse old account and create new account entry
            const advanceToSuppliersAccount = await accountingService.getAccountByCode('1230', tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '1230',
                name: 'Advance to Suppliers',
                type: 'ASSET',
                tenantId,
                balance: 0
              });

            const apAccount = await accountingService.getAccountByCode('2000', tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '2000',
                name: 'Accounts Payable',
                type: 'LIABILITY',
                tenantId,
                balance: 0
              });

            if (oldIsAdvance && newIsPayable) {
              // Changed from advance (Supplier Owes Us) to payable (We Owe Supplier)
              // Original entry: Debit Advance to Suppliers, Credit Opening Balance
              // Reverse: Credit Advance to Suppliers, Debit Opening Balance
              // New entry: Credit Accounts Payable, Debit Opening Balance
              // Combined: Credit Advance to Suppliers, Credit Accounts Payable, Debit Opening Balance (net)
              const oldAdvanceAmount = Math.abs(oldBalance);
              const netOpeningBalance = oldAdvanceAmount + newBalance; // Total debit
              transactionLines.push(
                {
                  accountId: advanceToSuppliersAccount.id,
                  debitAmount: 0,
                  creditAmount: oldAdvanceAmount // Credit decreases asset (reverse)
                },
                {
                  accountId: apAccount.id,
                  debitAmount: 0,
                  creditAmount: newBalance // Credit increases liability (new)
                },
                {
                  accountId: openingBalanceAccount.id,
                  debitAmount: netOpeningBalance,
                  creditAmount: 0 // Net debit
                }
              );
            } else if (oldIsPayable && newIsAdvance) {
              // Changed from payable (We Owe Supplier) to advance (Supplier Owes Us)
              // Original entry: Credit Accounts Payable, Debit Opening Balance
              // Reverse: Debit Accounts Payable, Credit Opening Balance
              // New entry: Debit Advance to Suppliers, Credit Opening Balance
              // Combined: Debit Accounts Payable, Debit Advance to Suppliers, Credit Opening Balance (net)
              const newAdvanceAmount = Math.abs(newBalance);
              const netOpeningBalance = oldBalance + newAdvanceAmount; // Total credit
              transactionLines.push(
                {
                  accountId: apAccount.id,
                  debitAmount: oldBalance, // Debit decreases liability (reverse)
                  creditAmount: 0
                },
                {
                  accountId: advanceToSuppliersAccount.id,
                  debitAmount: newAdvanceAmount, // Debit increases asset (new)
                  creditAmount: 0
                },
                {
                  accountId: openingBalanceAccount.id,
                  debitAmount: 0,
                  creditAmount: netOpeningBalance // Net credit
                }
              );
            }
          }

          if (transactionLines.length > 0) {
            await accountingService.createTransaction({
              transactionNumber,
              date: new Date(),
              description: `Supplier Balance Adjustment - ${supplier.name}`,
              tenantId
            }, transactionLines);
          }
        }
      } catch (accountingError) {
        console.error('Error creating accounting entry for supplier balance adjustment:', accountingError);
        // Don't fail supplier update if accounting entry fails
        // Log the error but continue
      }
    }

    res.json({
      success: true,
      message: 'Supplier updated successfully',
      supplier: updatedSupplier
    });
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update supplier'
    });
  }
});

// Delete supplier
router.delete('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;

    // Verify supplier belongs to tenant
    const supplier = await prisma.supplier.findFirst({
      where: { id, tenantId },
      include: {
        _count: {
          select: {
            purchaseInvoices: {
              where: { isDeleted: false }
            }
          }
        }
      }
    });

    if (!supplier) {
      return res.status(404).json({
        error: 'Supplier not found'
      });
    }

    // Check if supplier has purchase invoices
    if (supplier._count.purchaseInvoices > 0) {
      return res.status(400).json({
        error: 'Cannot delete supplier with existing purchase invoices'
      });
    }

    // Delete supplier
    await prisma.supplier.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Supplier deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete supplier'
    });
  }
});

// Get supplier statistics
router.get('/stats/overview', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;

    const [
      totalSuppliers,
      totalPurchaseInvoices,
      supplierBalances
    ] = await Promise.all([
      // Total suppliers
      prisma.supplier.count({
        where: { tenantId }
      }),
      // Total purchase invoices
      prisma.purchaseInvoice.count({
        where: {
          tenantId,
          isDeleted: false
        }
      }),
      // Get all supplier balances
      balanceService.getAllSupplierBalances(tenantId)
    ]);

    // Calculate totals
    const totalPurchases = supplierBalances.reduce((sum, s) => sum + (s.totalInvoices || 0), 0);
    const totalPaid = supplierBalances.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
    const totalPending = supplierBalances.reduce((sum, s) => sum + (s.pending || 0), 0);
    const suppliersWithPending = supplierBalances.filter(s => s.pending > 0).length;

    res.json({
      success: true,
      stats: {
        totalSuppliers,
        totalPurchaseInvoices,
        totalPurchases,
        totalPaid,
        totalPending,
        suppliersWithPending,
        averagePurchasePerSupplier: totalSuppliers > 0 ? totalPurchases / totalSuppliers : 0
      }
    });
  } catch (error) {
    console.error('Error fetching supplier stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch supplier statistics'
    });
  }
});

// Get supplier balance
router.get('/:id/balance', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;

    // Verify supplier belongs to tenant
    const supplier = await prisma.supplier.findFirst({
      where: { id, tenantId }
    });

    if (!supplier) {
      return res.status(404).json({
        error: 'Supplier not found'
      });
    }

    const balance = await balanceService.calculateSupplierBalance(id);

    res.json({
      success: true,
      balance
    });
  } catch (error) {
    console.error('Error fetching supplier balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch supplier balance'
    });
  }
});

// Search suppliers
router.get('/search/:query', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { query } = req.params;

    const suppliers = await prisma.supplier.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { contact: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } }
        ]
      },
      orderBy: { name: 'asc' },
      take: 10,
      select: {
        id: true,
        name: true,
        contact: true,
        email: true,
        phone: true,
        balance: true
      }
    });

    res.json({
      success: true,
      suppliers
    });
  } catch (error) {
    console.error('Error searching suppliers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search suppliers'
    });
  }
});

// Get supplier balance by name (for purchase invoice creation)
router.get('/by-name/:name/balance', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { name } = req.params;

    const supplier = await prisma.supplier.findFirst({
      where: {
        tenantId,
        name: {
          equals: name,
          mode: 'insensitive'
        }
      }
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    const balance = await balanceService.calculateSupplierBalance(supplier.id);
    
    // Calculate available advance
    // Available advance = negative opening balance + any overpayments
    // If totalOwed (openingBalance + invoiceTotal) < paidTotal, we have advance
    const totalOwed = (balance.openingBalance || 0) + (balance.totalInvoices || 0);
    const totalPaid = balance.totalPaid || 0;
    const availableAdvance = totalPaid > totalOwed ? totalPaid - totalOwed : 0;

    res.json({
      success: true,
      supplier: {
        id: supplier.id,
        name: supplier.name
      },
      balance,
      availableAdvance
    });
  } catch (error) {
    console.error('Error fetching supplier balance by name:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch supplier balance'
    });
  }
});

module.exports = router;

