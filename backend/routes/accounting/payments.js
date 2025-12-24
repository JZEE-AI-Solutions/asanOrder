const express = require('express');
const router = express.Router();
const prisma = require('../../lib/db');
const { authenticateToken } = require('../../middleware/auth');
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
      toDate
    } = req.query;

    const skip = (page - 1) * limit;

    const where = {
      tenantId
    };

    if (type) where.type = type;
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
      paymentMethod,
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

    // For supplier payments, amount can be 0 if fully paid with advance
    // For other types, amount and paymentMethod are required
    if (type !== 'SUPPLIER_PAYMENT' && (!amount || !paymentMethod)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Amount and payment method are required'
        }
      });
    }

    // For supplier payments with advance, validate advance usage
    let actualAdvanceUsed = 0;
    let advanceToSuppliersAccount = null;
    let cashPaymentAmount = parseFloat(amount) || 0;

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

    // For supplier payments, payment method is only required if cash payment > 0
    if (type === 'SUPPLIER_PAYMENT' && cashPaymentAmount > 0 && !paymentMethod) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Payment method is required when making cash/bank payment'
        }
      });
    }

    // Generate payment number
    const paymentCount = await prisma.payment.count({
      where: { tenantId }
    });
    const paymentNumber = `PAY-${new Date().getFullYear()}-${String(paymentCount + 1).padStart(4, '0')}`;

    // Get accounts
    const cashAccount = await accountingService.getAccountByCode('1000', tenantId) ||
      await accountingService.getOrCreateAccount({
        code: '1000',
        name: 'Cash',
        type: 'ASSET',
        tenantId,
        balance: 0
      });

    const bankAccount = await accountingService.getAccountByCode('1100', tenantId) ||
      await accountingService.getOrCreateAccount({
        code: '1100',
        name: 'Bank Account',
        type: 'ASSET',
        tenantId,
        balance: 0
      });

    // Map payment methods to accounts (only if cash payment > 0)
    let paymentAccount = null;
    if (cashPaymentAmount > 0) {
      if (paymentMethod === 'Cash') {
        paymentAccount = cashAccount;
      } else if (paymentMethod === 'Bank Transfer' || paymentMethod === 'Cheque') {
        paymentAccount = bankAccount;
      } else {
        // Default to cash for other methods (Credit Card, etc.)
        paymentAccount = cashAccount;
      }
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

      const arAccount = await accountingService.getAccountByCode('1200', tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '1200',
          name: 'Accounts Receivable',
          type: 'ASSET',
          tenantId,
          balance: 0
        });

      accountToCredit = arAccount;

      transactionLines = [
        {
          accountId: paymentAccount.id,
          debitAmount: amount,
          creditAmount: 0
        },
        {
          accountId: arAccount.id,
          debitAmount: 0,
          creditAmount: amount
        }
      ];
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

      // Create accounting transaction
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
      
      const transaction = await accountingService.createTransaction(
        {
          transactionNumber,
          date: new Date(date),
          description,
          tenantId,
          orderId,
          orderReturnId,
          purchaseInvoiceId: purchaseInvoiceId || null
        },
        transactionLines
      );

      // Create payment record only if there's actual cash/bank payment
      // Advance usage is handled through accounting entries only
      let payment = null;
      if (cashPaymentAmount > 0) {
        payment = await tx.payment.create({
          data: {
            paymentNumber,
            date: new Date(date),
            type,
            amount: cashPaymentAmount, // Only cash/bank payment amount
            paymentMethod: paymentMethod || 'Cash',
            tenantId,
            customerId,
            supplierId,
            orderId,
            orderReturnId,
            purchaseInvoiceId: purchaseInvoiceId || null,
            transactionId: transaction.id
          },
          include: {
            customer: true,
            supplier: true,
            order: true
          }
        });
      }

      // Update order payment amount if customer payment
      if (type === 'CUSTOMER_PAYMENT' && orderId) {
        const order = await tx.order.findUnique({
          where: { id: orderId }
        });
        
        const currentPaymentAmount = order.paymentAmount || 0;
        await tx.order.update({
          where: { id: orderId },
          data: {
            paymentAmount: currentPaymentAmount + parseFloat(amount)
          }
        });
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
      paymentMethod
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

    // Only allow editing supplier payments for now
    if (existingPayment.type !== 'SUPPLIER_PAYMENT') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Only supplier payments can be edited'
        }
      });
    }

    const oldAmount = existingPayment.amount;
    const newAmount = parseFloat(amount) || oldAmount;
    const amountDifference = newAmount - oldAmount;
    
    const oldPaymentMethod = existingPayment.paymentMethod || 'Cash';
    const newPaymentMethod = paymentMethod || oldPaymentMethod;
    const paymentMethodChanged = oldPaymentMethod !== newPaymentMethod;

    // If no amount change and no payment method change, just update date if provided
    if (Math.abs(amountDifference) < 0.01 && !paymentMethodChanged) {
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

    // If only payment method changed (no amount change), create payment method adjustment
    if (Math.abs(amountDifference) < 0.01 && paymentMethodChanged) {
      const result = await prisma.$transaction(async (tx) => {
        // Update payment record
        const updatedPayment = await tx.payment.update({
          where: { id: id },
          data: {
            ...(date && { date: new Date(date) }),
            paymentMethod: newPaymentMethod
          }
        });

        // Get old and new payment accounts
        const oldPaymentAccountCode = (oldPaymentMethod !== 'Cash') ? '1100' : '1000';
        const newPaymentAccountCode = (newPaymentMethod !== 'Cash') ? '1100' : '1000';
        
        const oldPaymentAccountName = oldPaymentAccountCode === '1100' ? 'Bank Account' : 'Cash';
        const newPaymentAccountName = newPaymentAccountCode === '1100' ? 'Bank Account' : 'Cash';

        const oldPaymentAccount = await accountingService.getAccountByCode(oldPaymentAccountCode, tenantId) ||
          await accountingService.getOrCreateAccount({
            code: oldPaymentAccountCode,
            name: oldPaymentAccountName,
            type: 'ASSET',
            tenantId,
            balance: 0
          });

        const newPaymentAccount = await accountingService.getAccountByCode(newPaymentAccountCode, tenantId) ||
          await accountingService.getOrCreateAccount({
            code: newPaymentAccountCode,
            name: newPaymentAccountName,
            type: 'ASSET',
            tenantId,
            balance: 0
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

        // Create payment method change transaction
        // Credit old account (money moved out), Debit new account (money moved in)
        const transactionNumber = `TXN-PAY-METHOD-${new Date().getFullYear()}-${Date.now()}`;
        const description = `Payment Method Change: ${existingPayment.paymentNumber} - Invoice: ${invoiceNumber} (${oldPaymentMethod} → ${newPaymentMethod})`;

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
      
      if (paymentMethod) {
        updateData.paymentMethod = paymentMethod;
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

      // Get old and new payment accounts
      const oldPaymentAccountCode = (oldPaymentMethod !== 'Cash') ? '1100' : '1000';
      const newPaymentAccountCode = (newPaymentMethod !== 'Cash') ? '1100' : '1000';
      
      const oldPaymentAccountName = oldPaymentAccountCode === '1100' ? 'Bank Account' : 'Cash';
      const newPaymentAccountName = newPaymentAccountCode === '1100' ? 'Bank Account' : 'Cash';

      const oldPaymentAccount = await accountingService.getAccountByCode(oldPaymentAccountCode, tenantId) ||
        await accountingService.getOrCreateAccount({
          code: oldPaymentAccountCode,
          name: oldPaymentAccountName,
          type: 'ASSET',
          tenantId,
          balance: 0
        });

      const newPaymentAccount = await accountingService.getAccountByCode(newPaymentAccountCode, tenantId) ||
        await accountingService.getOrCreateAccount({
          code: newPaymentAccountCode,
          name: newPaymentAccountName,
          type: 'ASSET',
          tenantId,
          balance: 0
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

      // Build description
      let description = `Payment Adjustment: ${existingPayment.paymentNumber} - Invoice: ${invoiceNumber}`;
      const changes = [];
      if (Math.abs(amountDifference) > 0.01) {
        changes.push(`${amountDifference > 0 ? 'Increase' : 'Decrease'}: Rs. ${Math.abs(amountDifference).toFixed(2)}`);
      }
      if (paymentMethodChanged) {
        changes.push(`Method: ${oldPaymentMethod} → ${newPaymentMethod}`);
      }
      if (changes.length > 0) {
        description += ` (${changes.join(', ')})`;
      }

      // Create adjustment transaction
      const transactionNumber = `TXN-PAY-ADJ-${new Date().getFullYear()}-${Date.now()}`;
      const transactionLines = [];

      // Handle the accounting adjustment
      if (paymentMethodChanged && Math.abs(amountDifference) > 0.01) {
        // Both amount and method changed: Reverse old payment, create new payment, adjust AP
        // 1. Reverse old payment: Credit old account, Debit AP (reduce liability)
        transactionLines.push(
          {
            accountId: oldPaymentAccount.id,
            debitAmount: 0,
            creditAmount: oldAmount // Credit old account (reverse old payment)
          },
          {
            accountId: apAccount.id,
            debitAmount: 0,
            creditAmount: oldAmount // Credit AP (reverse old payment liability)
          }
        );
        
        // 2. Create new payment: Debit new account, Credit AP (increase liability)
        transactionLines.push(
          {
            accountId: newPaymentAccount.id,
            debitAmount: newAmount,
            creditAmount: 0 // Debit new account (new payment)
          },
          {
            accountId: apAccount.id,
            debitAmount: newAmount,
            creditAmount: 0 // Debit AP (new payment liability)
          }
        );
      } else if (paymentMethodChanged) {
        // Only method changed, same amount: Move money from old account to new account
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
        // Only amount changed, same method: Adjust AP and payment account
        if (amountDifference > 0) {
          // Payment increased: Debit AP more, Credit payment account more
          transactionLines.push(
            {
              accountId: apAccount.id,
              debitAmount: amountDifference,
              creditAmount: 0
            },
            {
              accountId: newPaymentAccount.id,
              debitAmount: 0,
              creditAmount: amountDifference
            }
          );
        } else {
          // Payment decreased: Credit AP (reduce liability), Debit payment account (get money back)
          transactionLines.push(
            {
              accountId: apAccount.id,
              debitAmount: 0,
              creditAmount: Math.abs(amountDifference)
            },
            {
              accountId: newPaymentAccount.id,
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

module.exports = router;

