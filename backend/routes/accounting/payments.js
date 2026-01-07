const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const prisma = require('../../lib/db');
const { authenticateToken, requireRole } = require('../../middleware/auth');
const accountingService = require('../../services/accountingService');
const balanceService = require('../../services/balanceService');

// Get payments
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'desc',
      type,
      fromDate,
      toDate,
      orderId,
      customerId,
      supplierId
    } = req.query;

    const skip = (page - 1) * limit;

    const where = {
      tenantId
    };

    if (type) where.type = type;
    if (orderId) where.orderId = orderId;
    if (customerId) where.customerId = customerId;
    if (supplierId) where.supplierId = supplierId;
    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) where.date.gte = new Date(fromDate);
      if (toDate) where.date.lte = new Date(toDate);
    }

    // Fetch Payment records (all payments, including initial payments from purchase invoices)
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phoneNumber: true
            }
          },
          supplier: {
            select: {
              id: true,
              name: true
            }
          },
          order: {
            select: {
              id: true,
              orderNumber: true
            }
          },
          account: {
            select: {
              id: true,
              name: true,
              code: true,
              accountSubType: true
            }
          }
        },
        orderBy: {
          [sort]: order
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.payment.count({ where })
    ]);

    res.json({
      success: true,
      data: payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch payments'
      }
    });
  }
});

// Record payment
router.post('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const {
      date,
      type, // CUSTOMER_PAYMENT, SUPPLIER_PAYMENT, REFUND
      amount,
      paymentAccountId,
      customerId,
      supplierId,
      orderId,
      orderReturnId,
      purchaseInvoiceId,
      useAdvanceBalance,
      advanceAmountUsed
    } = req.body;

    if (!date || !type) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Date and type are required'
        }
      });
    }

    // For customer payments, amount is required, paymentAccountId required only if verified
    if (type === 'CUSTOMER_PAYMENT' && !amount) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Amount is required for customer payments'
        }
      });
    }

    // Check if payment should be verified immediately
    const isVerified = req.body.isVerified !== undefined ? req.body.isVerified : (orderId !== null && orderId !== undefined);
    
    // Initialize customer advance variables
    let useCustomerAdvance = false;
    let customerAdvanceAmountUsed = 0;
    let customerAdvanceAccount = null;
    
    // For customer payments, check if advance balance should be used
    if (type === 'CUSTOMER_PAYMENT' && req.body.useAdvanceBalance && customerId) {
      useCustomerAdvance = true;
      try {
        // Get customer's current advanceBalance directly from database
        // This is more reliable than calculating from balance service
        const customerForAdvance = await prisma.customer.findUnique({
          where: { id: customerId },
          select: { advanceBalance: true }
        });
        const availableAdvance = customerForAdvance?.advanceBalance || 0;
        
        if (availableAdvance > 0) {
          const requestedAdvance = req.body.advanceAmountUsed ? parseFloat(req.body.advanceAmountUsed) : availableAdvance;
          customerAdvanceAmountUsed = Math.min(requestedAdvance, availableAdvance, parseFloat(amount));
          
          // Get or create Customer Advance Balance account
          customerAdvanceAccount = await accountingService.getAccountByCode('1210', tenantId) ||
            await accountingService.getOrCreateAccount({
              code: '1210',
              name: 'Customer Advance Balance',
              type: 'ASSET',
              tenantId,
              balance: 0
            });
        }
      } catch (balanceError) {
        console.error('Error calculating customer balance for advance usage:', balanceError);
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Failed to calculate customer balance for advance usage'
          }
        });
      }
    }
    
    // For supplier payments with advance, validate advance usage
    let actualAdvanceUsed = 0;
    let advanceToSuppliersAccount = null;
    let cashPaymentAmount = parseFloat(amount) || 0;
    
    // For customer payments, calculate cash payment amount (total - advance used)
    if (type === 'CUSTOMER_PAYMENT') {
      cashPaymentAmount = parseFloat(amount) - customerAdvanceAmountUsed;
    }

    if (type === 'SUPPLIER_PAYMENT' && useAdvanceBalance && supplierId) {
      try {
        const supplierBalance = await balanceService.calculateSupplierBalance(supplierId);
        // Advance is represented as a negative pending balance (we paid them advance/returned products, they owe us goods)
        const availableAdvance = supplierBalance.pending < 0 ? Math.abs(supplierBalance.pending) : 0;

        if (availableAdvance > 0) {
          const requestedAdvance = advanceAmountUsed ? parseFloat(advanceAmountUsed) : availableAdvance;
          actualAdvanceUsed = Math.min(requestedAdvance, availableAdvance);

          // Get or create Advance to Suppliers account (ASSET - we paid them advance/returned products)
          advanceToSuppliersAccount = await accountingService.getAccountByCode('1230', tenantId) ||
            await accountingService.getOrCreateAccount({
              code: '1230',
              name: 'Advance to Suppliers',
              type: 'ASSET',
              tenantId,
              balance: 0
            });
        }
      } catch (balanceError) {
        console.error('Error calculating supplier balance for advance adjustment:', balanceError);
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Failed to calculate supplier balance for advance usage'
          }
        });
      }
    }

    // For supplier payments, if no cash payment and no advance, require payment method
    if (type === 'SUPPLIER_PAYMENT' && cashPaymentAmount === 0 && actualAdvanceUsed === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either payment amount or advance balance must be provided'
        }
      });
    }

    // For supplier payments, payment account is required if cash payment > 0
    if (type === 'SUPPLIER_PAYMENT' && cashPaymentAmount > 0 && !paymentAccountId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Payment account is required when making cash/bank payment'
        }
      });
    }

    // Generate payment number
    const paymentCount = await prisma.payment.count({
      where: { tenantId }
    });
    const paymentNumber = `PAY-${new Date().getFullYear()}-${String(paymentCount + 1).padStart(4, '0')}`;

    // Get payment account (only if cash payment > 0)
    let paymentAccount = null;
    let paymentMethod = null;
    if (cashPaymentAmount > 0) {
      // Validate payment account exists and is Cash/Bank type
      paymentAccount = await prisma.account.findFirst({
        where: {
          id: paymentAccountId,
          tenantId,
        type: 'ASSET',
          accountSubType: { in: ['CASH', 'BANK'] }
        }
      });

      if (!paymentAccount) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid payment account. Account must be a Cash or Bank account.'
          }
        });
      }

      // Derive payment method from account subType
      paymentMethod = paymentAccount.accountSubType === 'BANK' ? 'Bank Transfer' : 'Cash';
    }

    let transactionLines = [];
    let accountToCredit = null;

    if (type === 'CUSTOMER_PAYMENT') {
      if (!customerId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Customer ID required for customer payment'
          }
        });
      }

      // For verified payments, payment account is required
      if (isVerified && !paymentAccount) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Payment account is required for verified payments'
          }
        });
      }

      // Only create accounting entries if payment is verified
      if (isVerified) {
        const arAccount = await accountingService.getAccountByCode('1200', tenantId) ||
          await accountingService.getOrCreateAccount({
            code: '1200',
            name: 'Accounts Receivable',
            type: 'ASSET',
            tenantId,
            balance: 0
          });

        // Build transaction lines
        // 1. Cash/Bank payment (if any)
        if (cashPaymentAmount > 0 && paymentAccount) {
          transactionLines.push({
            accountId: paymentAccount.id,
            debitAmount: cashPaymentAmount,
            creditAmount: 0
          });
        }

        // 2. Advance usage (if any)
        // When advance is used, we credit the Customer Advance Balance (ASSET) to decrease it
        if (customerAdvanceAmountUsed > 0 && customerAdvanceAccount) {
          transactionLines.push({
            accountId: customerAdvanceAccount.id,
            debitAmount: 0,
            creditAmount: customerAdvanceAmountUsed
          });
        }

        // 3. Credit account (AR for order payments, Advance Balance for direct payments)
        if (transactionLines.length > 0) {
          const creditAccount = orderId 
            ? arAccount 
            : (await accountingService.getAccountByCode('1210', tenantId) ||
               await accountingService.getOrCreateAccount({
                 code: '1210',
                 name: 'Customer Advance Balance',
                 type: 'ASSET',
                 tenantId,
                 balance: 0
               }));

          accountToCredit = creditAccount;

          transactionLines.push({
            accountId: creditAccount.id,
            debitAmount: 0,
            creditAmount: parseFloat(amount)
          });
        }
      }
      // If unverified, transactionLines will remain empty and no transaction will be created
    } else if (type === 'SUPPLIER_PAYMENT') {
      if (!supplierId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Supplier ID required for supplier payment'
          }
        });
      }

      const apAccount = await accountingService.getAccountByCode('2000', tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '2000',
          name: 'Accounts Payable',
          type: 'LIABILITY',
          tenantId,
          balance: 0
        });

      accountToCredit = apAccount;

      // Calculate total payment (cash + advance)
      const totalPaymentAmount = cashPaymentAmount + actualAdvanceUsed;

      transactionLines = [
        {
          accountId: apAccount.id,
          debitAmount: totalPaymentAmount, // Total payment reduces AP
          creditAmount: 0
        }
      ];

      // Add cash/bank payment entry if cash payment > 0
      if (cashPaymentAmount > 0 && paymentAccount) {
        transactionLines.push({
          accountId: paymentAccount.id,
          debitAmount: 0,
          creditAmount: cashPaymentAmount
        });
      }

      // Add advance to suppliers entry if advance is used
      if (actualAdvanceUsed > 0 && advanceToSuppliersAccount) {
        transactionLines.push({
          accountId: advanceToSuppliersAccount.id,
          debitAmount: 0,
          creditAmount: actualAdvanceUsed // Credit decreases asset (we're using the advance we paid them)
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Build transaction description
      let description = `Payment: ${paymentNumber} - ${type}`;
      if (type === 'SUPPLIER_PAYMENT') {
        if (cashPaymentAmount > 0 && actualAdvanceUsed > 0) {
          description += ` (Paid: Rs. ${cashPaymentAmount}, Advance Used: Rs. ${actualAdvanceUsed})`;
        } else if (actualAdvanceUsed > 0) {
          description += ` (Advance Used: Rs. ${actualAdvanceUsed})`;
        } else if (cashPaymentAmount > 0) {
          description += ` (Paid: Rs. ${cashPaymentAmount})`;
        }
      }

      // Create accounting transaction only if verified (transactionLines has entries)
      let transaction = null;
      if (transactionLines.length > 0) {
        const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
        
        // Enhance description with invoice number if available
        if (purchaseInvoiceId && type === 'SUPPLIER_PAYMENT') {
          try {
            const invoice = await prisma.purchaseInvoice.findUnique({
              where: { id: purchaseInvoiceId },
              select: { invoiceNumber: true }
            });
            if (invoice?.invoiceNumber) {
              description += ` - Invoice: ${invoice.invoiceNumber}`;
            }
          } catch (err) {
            // Don't fail if we can't fetch invoice number
            console.error('Error fetching invoice number for transaction description:', err);
          }
        }
        
        transaction = await accountingService.createTransaction(
          {
            transactionNumber,
            date: new Date(date),
            description,
            tenantId,
            orderId: orderId || null,
            orderReturnId: orderReturnId || null,
            purchaseInvoiceId: purchaseInvoiceId || null
          },
          transactionLines
        );
      }

      // Create payment record (for both verified and unverified payments)
      // For customer payments, always create payment record
      // For supplier payments, only create if there's actual cash/bank payment
      let payment = null;
      if (type === 'CUSTOMER_PAYMENT' || (type === 'SUPPLIER_PAYMENT' && cashPaymentAmount > 0)) {
        payment = await tx.payment.create({
          data: {
            paymentNumber,
            date: new Date(date),
            type,
            amount: type === 'CUSTOMER_PAYMENT' ? parseFloat(amount) : cashPaymentAmount,
            paymentMethod: paymentMethod || (type === 'CUSTOMER_PAYMENT' ? 'Cash' : null),
            accountId: paymentAccountId || null,
            tenantId,
            customerId: type === 'CUSTOMER_PAYMENT' ? customerId : null,
            supplierId: type === 'SUPPLIER_PAYMENT' ? supplierId : null,
            orderId: orderId || null,
            orderReturnId: orderReturnId || null,
            purchaseInvoiceId: purchaseInvoiceId || null,
            transactionId: transaction ? transaction.id : null // null if unverified
          },
          include: {
            customer: true,
            supplier: true,
            order: true,
            account: true
          }
        });
      }

      // Update order payment amount if customer payment with order
      if (type === 'CUSTOMER_PAYMENT' && orderId) {
        const order = await tx.order.findUnique({
          where: { id: orderId }
        });
        
        if (order) {
          const currentPaymentAmount = order.paymentAmount || 0;
          const currentVerifiedAmount = order.verifiedPaymentAmount || 0;
          const paymentAmountToAdd = parseFloat(amount);
          
          // Update paymentAmount (total claimed + received)
          // Update verifiedPaymentAmount (only verified/received payments count)
          // Since this payment is being received by business owner, it's automatically verified
          await tx.order.update({
            where: { id: orderId },
            data: {
              paymentAmount: currentPaymentAmount + paymentAmountToAdd,
              verifiedPaymentAmount: currentVerifiedAmount + paymentAmountToAdd,
              paymentVerified: true, // Payment received by business owner is automatically verified
              paymentVerifiedAt: new Date(),
              paymentVerifiedBy: req.user.id,
              paymentAccountId: paymentAccountId || order.paymentAccountId
            }
          });
        }
      }

      // Update customer advance balance
      if (type === 'CUSTOMER_PAYMENT' && customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: customerId }
        });
        
        if (customer) {
          let newAdvanceBalance = customer.advanceBalance || 0;
          
          // If advance was used, decrease advance balance
          // Use advanceAmountToDeduct which is captured before transaction to ensure correct value
          if (useCustomerAdvance && advanceAmountToDeduct > 0) {
            newAdvanceBalance = Math.max(0, newAdvanceBalance - advanceAmountToDeduct);
          }
          
          // If direct payment (no order) and verified, increase advance balance
          if (!orderId && isVerified && transaction && cashPaymentAmount > 0) {
            newAdvanceBalance = newAdvanceBalance + cashPaymentAmount;
          }
          
          // Always update to ensure balance is saved (even if unchanged, to ensure transaction commits)
          await tx.customer.update({
            where: { id: customerId },
            data: {
              advanceBalance: newAdvanceBalance
            }
          });
        }
      }

      return {
        payment: payment,
        transaction,
        advanceUsed: actualAdvanceUsed > 0 ? actualAdvanceUsed : undefined
      };
    });

    // If payment is null (fully paid with advance), return transaction info
    const responseData = result.payment || {
      id: null,
      paymentNumber,
      date: new Date(date),
      type,
      amount: 0,
      paymentMethod: null,
      note: 'Payment made entirely from advance balance',
      transaction: result.transaction
    };

    res.status(201).json({
      success: true,
      data: responseData,
      advanceUsed: result.advanceUsed
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to record payment'
      }
    });
  }
});

// Update payment (Business Owner only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant.id;
    const { id } = req.params;
    const {
      date,
      amount,
      paymentAccountId
    } = req.body;

    // Get existing payment
    const existingPayment = await prisma.payment.findFirst({
      where: {
        id: id,
        tenantId: tenantId
      },
      include: {
        transaction: {
          include: {
            transactionLines: {
              include: {
                account: true
              }
            }
          }
        }
      }
    });

    if (!existingPayment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Payment not found'
        }
      });
    }

    // Allow editing both supplier and customer payments
    // For customer payments, only allow editing if not linked to order payment verification
    if (existingPayment.type === 'CUSTOMER_PAYMENT' && existingPayment.orderId) {
      // Check if this payment was created via order payment verification
      const order = await prisma.order.findUnique({
        where: { id: existingPayment.orderId },
        select: { paymentVerified: true, verifiedPaymentAmount: true }
      });
      
      if (order && order.paymentVerified && Math.abs((order.verifiedPaymentAmount || 0) - existingPayment.amount) < 0.01) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'This payment is linked to order payment verification. Use order payment update endpoint instead.'
          }
        });
      }
    }

    const oldAmount = existingPayment.amount;
    const newAmount = parseFloat(amount) || oldAmount;
    const amountDifference = newAmount - oldAmount;
    
    // Get old payment account from existing payment
    let oldPaymentAccount = null;
    if (existingPayment.accountId) {
      oldPaymentAccount = await prisma.account.findUnique({
        where: { id: existingPayment.accountId }
      });
    } else if (existingPayment.transaction) {
      // Derive from transaction if accountId not set
      const paymentAccountLine = existingPayment.transaction.transactionLines.find(
        line => line.account.type === 'ASSET' && (line.account.accountSubType === 'CASH' || line.account.accountSubType === 'BANK')
      );
      if (paymentAccountLine) {
        oldPaymentAccount = paymentAccountLine.account;
      }
    }

    // Get new payment account
    let newPaymentAccount = null;
    if (paymentAccountId) {
      newPaymentAccount = await prisma.account.findFirst({
        where: {
          id: paymentAccountId,
          tenantId,
          type: 'ASSET',
          accountSubType: { in: ['CASH', 'BANK'] }
        }
      });

      if (!newPaymentAccount) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid payment account. Account must be a Cash or Bank account.'
          }
        });
      }
    }

    const accountChanged = oldPaymentAccount && newPaymentAccount && oldPaymentAccount.id !== newPaymentAccount.id;
    const oldPaymentMethod = oldPaymentAccount ? (oldPaymentAccount.accountSubType === 'BANK' ? 'Bank Transfer' : 'Cash') : 'Cash';
    const newPaymentMethod = newPaymentAccount ? (newPaymentAccount.accountSubType === 'BANK' ? 'Bank Transfer' : 'Cash') : oldPaymentMethod;

    // If no amount change and no account change, just update date if provided
    if (Math.abs(amountDifference) < 0.01 && !accountChanged) {
      const updatedPayment = await prisma.payment.update({
        where: { id: id },
        data: {
          ...(date && { date: new Date(date) })
        }
      });

      return res.json({
        success: true,
        data: updatedPayment
      });
    }

    // If only account changed (no amount change), create account adjustment
    if (Math.abs(amountDifference) < 0.01 && accountChanged) {
      if (!oldPaymentAccount || !newPaymentAccount) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot change account: old or new account not found'
          }
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        // Update payment record
        const updatedPayment = await tx.payment.update({
          where: { id: id },
          data: {
            ...(date && { date: new Date(date) }),
            paymentMethod: newPaymentMethod,
            accountId: newPaymentAccount.id
          }
        });

        // Get invoice number for description
        let invoiceNumber = 'N/A';
        if (existingPayment.purchaseInvoiceId) {
          try {
            const invoice = await prisma.purchaseInvoice.findUnique({
              where: { id: existingPayment.purchaseInvoiceId },
              select: { invoiceNumber: true }
            });
            if (invoice?.invoiceNumber) {
              invoiceNumber = invoice.invoiceNumber;
            }
          } catch (err) {
            console.error('Error fetching invoice number:', err);
          }
        }

        // Create account change transaction
        // Credit old account (money moved out), Debit new account (money moved in)
        const transactionNumber = `TXN-PAY-ACCOUNT-${new Date().getFullYear()}-${Date.now()}`;
        const description = `Payment Account Change: ${existingPayment.paymentNumber} - Invoice: ${invoiceNumber} (${oldPaymentAccount.name} → ${newPaymentAccount.name})`;

        const transactionLines = [
          {
            accountId: oldPaymentAccount.id,
            debitAmount: 0,
            creditAmount: oldAmount // Credit old account (money moved out)
          },
          {
            accountId: newPaymentAccount.id,
            debitAmount: oldAmount,
            creditAmount: 0 // Debit new account (money moved in)
          }
        ];

        const adjustmentTransaction = await accountingService.createTransaction(
          {
            transactionNumber,
            date: new Date(),
            description,
            tenantId,
            purchaseInvoiceId: existingPayment.purchaseInvoiceId || null
          },
          transactionLines
        );

        return {
          payment: updatedPayment,
          adjustmentTransaction
        };
      });

      return res.json({
        success: true,
        data: result.payment,
        adjustmentTransaction: result.adjustmentTransaction
      });
    }

    // Amount changed (and possibly payment method too) - create adjustment transaction
    const result = await prisma.$transaction(async (tx) => {
      // Build update data object
      const updateData = {
        amount: parseFloat(newAmount)
      };
      
      if (date) {
        updateData.date = new Date(date);
      }
      
      if (newPaymentAccount) {
        updateData.paymentMethod = newPaymentMethod;
        updateData.accountId = newPaymentAccount.id;
      }
      
      // Update payment record
      const updatedPayment = await tx.payment.update({
        where: { id: id },
        data: updateData
      });

      // Get accounts
      const apAccount = await accountingService.getAccountByCode('2000', tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '2000',
          name: 'Accounts Payable',
          type: 'LIABILITY',
          tenantId,
          balance: 0
        });

      // Use existing accounts if available, otherwise get from IDs
      if (!oldPaymentAccount && existingPayment.accountId) {
        oldPaymentAccount = await prisma.account.findUnique({
          where: { id: existingPayment.accountId }
        });
      }

      if (!newPaymentAccount && paymentAccountId) {
        newPaymentAccount = await prisma.account.findFirst({
          where: {
            id: paymentAccountId,
            tenantId,
            type: 'ASSET',
            accountSubType: { in: ['CASH', 'BANK'] }
          }
        });
      }

      // If account changed, use new account; otherwise use old account
      const paymentAccount = newPaymentAccount || oldPaymentAccount;

      // Get invoice number for description
      let invoiceNumber = 'N/A';
      if (existingPayment.purchaseInvoiceId) {
        try {
          const invoice = await prisma.purchaseInvoice.findUnique({
            where: { id: existingPayment.purchaseInvoiceId },
            select: { invoiceNumber: true }
          });
          if (invoice?.invoiceNumber) {
            invoiceNumber = invoice.invoiceNumber;
          }
        } catch (err) {
          console.error('Error fetching invoice number:', err);
        }
      }

      // Build description
      let description = `Payment Adjustment: ${existingPayment.paymentNumber} - Invoice: ${invoiceNumber}`;
      const changes = [];
      if (Math.abs(amountDifference) > 0.01) {
        changes.push(`${amountDifference > 0 ? 'Increase' : 'Decrease'}: Rs. ${Math.abs(amountDifference).toFixed(2)}`);
      }
      if (accountChanged) {
        changes.push(`Account: ${oldPaymentAccount?.name || 'Unknown'} → ${newPaymentAccount?.name || 'Unknown'}`);
      }
      if (changes.length > 0) {
        description += ` (${changes.join(', ')})`;
      }

      // Create adjustment transaction
      const transactionNumber = `TXN-PAY-ADJ-${new Date().getFullYear()}-${Date.now()}`;
      const transactionLines = [];

      // Handle the accounting adjustment
      if (accountChanged && Math.abs(amountDifference) > 0.01) {
        // Both amount and account changed: Reverse old payment, apply new payment
        if (!oldPaymentAccount || !newPaymentAccount) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Cannot change account and amount: account information missing'
            }
          });
        }

        const creditAccount = accountToCredit;
        transactionLines.push(
          {
            accountId: oldPaymentAccount.id,
            debitAmount: oldAmount, // Debit old account (reverse credit)
            creditAmount: 0
          },
          {
            accountId: creditAccount.id,
            debitAmount: 0,
            creditAmount: oldAmount // Credit AR/AP/Advance (reverse debit)
          },
          {
            accountId: newPaymentAccount.id,
            debitAmount: 0,
            creditAmount: newAmount // Credit new account (new payment)
          },
          {
            accountId: creditAccount.id,
            debitAmount: newAmount, // Debit AR/AP/Advance (new payment)
            creditAmount: 0
          }
        );
      } else if (accountChanged && !paymentAccount) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot change account: account information missing'
          }
        });
      } else if (accountChanged) {
        // Only account changed, same amount: Move money from old account to new account
        transactionLines.push(
          {
            accountId: oldPaymentAccount.id,
            debitAmount: 0,
            creditAmount: oldAmount // Credit old account (money moved out)
          },
          {
            accountId: newPaymentAccount.id,
            debitAmount: oldAmount,
            creditAmount: 0 // Debit new account (money moved in)
          }
        );
      } else {
        // Only amount changed, same account: Adjust AP and payment account
        if (!paymentAccount) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Payment account not found'
            }
          });
        }

        const creditAccount = accountToCredit;
        if (amountDifference > 0) {
          // Payment increased: Debit AR/AP/Advance more, Credit payment account more
          transactionLines.push(
            {
              accountId: creditAccount.id,
              debitAmount: amountDifference,
              creditAmount: 0
            },
            {
              accountId: paymentAccount.id,
              debitAmount: 0,
              creditAmount: amountDifference
            }
          );
        } else {
          // Payment decreased: Credit AR/AP/Advance (reduce), Debit payment account (get money back)
          transactionLines.push(
            {
              accountId: creditAccount.id,
              debitAmount: 0,
              creditAmount: Math.abs(amountDifference)
            },
            {
              accountId: paymentAccount.id,
              debitAmount: Math.abs(amountDifference),
              creditAmount: 0
            }
          );
        }
      }

      // Create adjustment transaction linked to purchase invoice
      const adjustmentTransaction = await accountingService.createTransaction(
        {
          transactionNumber,
          date: new Date(),
          description,
          tenantId,
          purchaseInvoiceId: existingPayment.purchaseInvoiceId || null
        },
        transactionLines
      );

      return {
        payment: updatedPayment,
        adjustmentTransaction
      };
    });

    res.json({
      success: true,
      data: result.payment,
      adjustmentTransaction: result.adjustmentTransaction
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to update payment'
      }
    });
  }
});

// Verify payment (for direct customer payments without orders)
router.post('/:id/verify', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('paymentAccountId').notEmpty().withMessage('Payment account is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors.array()
        }
      });
    }

    const tenantId = req.user.tenant.id;
    const { id } = req.params;
    const { paymentAccountId } = req.body;

    // Get payment
    const payment = await prisma.payment.findFirst({
      where: {
        id,
        tenantId,
        type: 'CUSTOMER_PAYMENT'
      },
      include: {
        customer: true,
        order: true
      }
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Payment not found'
        }
      });
    }

    // Check if already verified
    if (payment.transactionId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Payment has already been verified'
        }
      });
    }

    // Validate payment account
    const paymentAccount = await prisma.account.findFirst({
      where: {
        id: paymentAccountId,
        tenantId,
        type: 'ASSET',
        accountSubType: { in: ['CASH', 'BANK'] }
      }
    });

    if (!paymentAccount) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payment account. Must be a Cash or Bank account.'
        }
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Determine credit account based on whether payment is linked to order
      const arAccount = await accountingService.getAccountByCode('1200', tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '1200',
          name: 'Accounts Receivable',
          type: 'ASSET',
          tenantId,
          balance: 0
        });

      // For direct payments (no orderId), credit to Customer Advance Balance
      // For order payments, credit to AR
      const creditAccount = payment.orderId 
        ? arAccount 
        : (await accountingService.getAccountByCode('1210', tenantId) ||
           await accountingService.getOrCreateAccount({
             code: '1210',
             name: 'Customer Advance Balance',
             type: 'ASSET',
             tenantId,
             balance: 0
           }));

      // Create accounting transaction
      const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      const transaction = await accountingService.createTransaction(
        {
          transactionNumber,
          date: payment.date,
          description: `Payment Verified: ${payment.paymentNumber}${payment.orderId ? ` (Order: ${payment.order?.orderNumber || payment.orderId})` : ' (Direct Payment)'}`,
          tenantId,
          orderId: payment.orderId || null
        },
        [
          {
            accountId: paymentAccount.id,
            debitAmount: payment.amount,
            creditAmount: 0
          },
          {
            accountId: creditAccount.id,
            debitAmount: 0,
            creditAmount: payment.amount
          }
        ]
      );

      // Update payment with transaction ID
      const updatedPayment = await tx.payment.update({
        where: { id },
        data: {
          transactionId: transaction.id,
          accountId: paymentAccountId,
          paymentMethod: paymentAccount.accountSubType === 'BANK' ? 'Bank Transfer' : 'Cash'
        },
        include: {
          customer: true,
          order: true,
          account: true
        }
      });

      // Update customer advance balance if direct payment
      if (!payment.orderId && payment.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: payment.customerId }
        });
        
        if (customer) {
          await tx.customer.update({
            where: { id: payment.customerId },
            data: {
              advanceBalance: (customer.advanceBalance || 0) + payment.amount
            }
          });
        }
      }

      return { payment: updatedPayment, transaction };
    });

    res.json({
      success: true,
      message: `Payment of Rs. ${payment.amount.toFixed(2)} verified successfully`,
      data: result.payment,
      transaction: result.transaction
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to verify payment'
      }
    });
  }
});

module.exports = router;

