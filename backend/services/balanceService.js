const prisma = require('../lib/db');

class BalanceService {
  /**
   * Calculate customer AR balance
   * @param {string} customerId - Customer ID
   * @returns {Object} Balance details
   */
  async calculateCustomerBalance(customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        orders: {
          where: {
            status: 'CONFIRMED'
          },
          select: {
            id: true,
            orderNumber: true,
            selectedProducts: true,
            productQuantities: true,
            productPrices: true,
            paymentAmount: true,
            verifiedPaymentAmount: true,
            paymentVerified: true,
            shippingCharges: true,
            refundAmount: true,
            codFee: true,
            codFeePaidBy: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get all payments (including direct payments without orders)
    const allPayments = await prisma.payment.findMany({
      where: {
        customerId: customerId,
        type: 'CUSTOMER_PAYMENT'
      },
      select: {
        id: true,
        amount: true,
        orderId: true,
        date: true
      }
    });

    // Get all returns
    const allReturns = await prisma.return.findMany({
      where: {
        order: {
          customerId: customerId
        },
        returnType: {
          in: ['CUSTOMER_FULL', 'CUSTOMER_PARTIAL']
        }
      },
      select: {
        id: true,
        returnNumber: true,
        totalAmount: true,
        refundAmount: true,
        status: true,
        orderId: true,
        returnDate: true
      }
    });

    // Calculate opening balance from accounting transactions
    // Look for opening balance transaction
    const openingBalanceTransaction = await prisma.transaction.findFirst({
      where: {
        tenantId: customer.tenantId,
        description: {
          contains: `Customer Opening Balance - ${customer.name || customer.phoneNumber}`,
          mode: 'insensitive'
        }
      },
      include: {
        transactionLines: {
          include: {
            account: true
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    });

    let openingARBalance = 0;
    let openingAdvanceBalance = 0;

    // First, try to get opening balance from the initial opening balance transaction
    // This ensures we get the original balance, not the current balance after subsequent transactions
    if (openingBalanceTransaction) {
      // Calculate opening balance from transaction lines
      for (const line of openingBalanceTransaction.transactionLines) {
        if (line.account.code === '1200') {
          // Accounts Receivable - debit means customer owes us
          openingARBalance += (line.debitAmount || 0) - (line.creditAmount || 0);
        } else if (line.account.code === '1210') {
          // Customer Advance Balance - debit means customer paid us advance
          openingAdvanceBalance = (line.debitAmount || 0) - (line.creditAmount || 0);
        }
      }
    }
    
    // If no opening balance transaction found, check if customer has advanceBalance set
    // This handles cases where customer was created with advance balance but no transaction was created
    // However, we should only use this if we didn't find a transaction (to avoid including subsequent payments)
    if (!openingBalanceTransaction && customer.advanceBalance) {
      openingAdvanceBalance = customer.advanceBalance;
    }

    let totalOrderValue = 0;
    let totalVerifiedPayments = 0;
    let totalPending = 0;
    const orderBalances = [];

    for (const order of customer.orders) {
      // Parse order data
      let selectedProducts = [];
      let productQuantities = {};
      let productPrices = {};

      try {
        selectedProducts = typeof order.selectedProducts === 'string'
          ? JSON.parse(order.selectedProducts)
          : (order.selectedProducts || []);
        productQuantities = typeof order.productQuantities === 'string'
          ? JSON.parse(order.productQuantities)
          : (order.productQuantities || {});
        productPrices = typeof order.productPrices === 'string'
          ? JSON.parse(order.productPrices)
          : (order.productPrices || {});
      } catch (e) {
        console.error('Error parsing order data:', e);
        continue;
      }

      // Calculate order total (products + shipping)
      let orderTotal = 0;
      if (Array.isArray(selectedProducts)) {
        selectedProducts.forEach(product => {
          const quantity = productQuantities[product.id] || product.quantity || 1;
          const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
          orderTotal += price * quantity;
        });
      }

      // Add shipping charges
      const shippingCharges = order.shippingCharges || 0;
      orderTotal += shippingCharges;

      // Add COD fee if customer pays
      if (order.codFeePaidBy === 'CUSTOMER' && order.codFee && order.codFee > 0) {
        orderTotal += order.codFee;
      }

      totalOrderValue += orderTotal;

      // Calculate pending amount
      // Use verified payment amount if payment is verified, otherwise use 0 (unverified payments don't count)
      const paidAmount = order.paymentVerified && order.verifiedPaymentAmount !== null && order.verifiedPaymentAmount !== undefined
        ? order.verifiedPaymentAmount
        : 0;
      totalVerifiedPayments += paidAmount;
      const refundAmount = order.refundAmount || 0;
      const pending = Math.max(0, orderTotal - paidAmount - refundAmount);

      if (pending > 0) {
        totalPending += pending;
        orderBalances.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderTotal,
          paidAmount,
          refundAmount,
          pending,
          orderDate: order.createdAt,
          claimedPayment: order.paymentAmount || 0,
          verifiedPayment: order.paymentVerified ? (order.verifiedPaymentAmount || 0) : 0,
          paymentVerified: order.paymentVerified || false
        });
      }
    }

    // Calculate direct payments (payments without orders)
    const directPayments = allPayments.filter(p => !p.orderId);
    const totalDirectPayments = directPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Calculate total returns/refunds
    const totalReturns = allReturns.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
    const totalRefunds = allReturns.reduce((sum, r) => sum + (r.refundAmount || 0), 0);

    // Net balance calculation:
    // Opening AR + Order Totals - Verified Payments - Direct Payments - Returns + Opening Advance
    const netARBalance = openingARBalance + totalOrderValue - totalVerifiedPayments - totalDirectPayments - totalReturns;
    const netBalance = netARBalance - openingAdvanceBalance; // Positive = customer owes, Negative = customer has advance

    return {
      customerId: customer.id,
      customerName: customer.name,
      openingARBalance,
      openingAdvanceBalance,
      totalOrderValue,
      totalVerifiedPayments,
      totalDirectPayments,
      totalReturns,
      totalRefunds,
      totalPending: Math.max(0, netARBalance), // Pending AR (can't be negative)
      availableAdvance: Math.max(0, -netBalance), // Available advance (if netBalance is negative)
      netBalance, // Net balance (positive = owes us, negative = has advance)
      advanceBalance: openingAdvanceBalance,
      orders: orderBalances,
      directPayments: directPayments.map(p => ({
        id: p.id,
        amount: p.amount,
        date: p.date
      })),
      returns: allReturns.map(r => ({
        id: r.id,
        returnNumber: r.returnNumber,
        totalAmount: r.totalAmount,
        refundAmount: r.refundAmount,
        status: r.status,
        orderId: r.orderId,
        returnDate: r.returnDate
      }))
    };
  }

  /**
   * Get all customer balances
   * @param {string} tenantId - Tenant ID
   * @returns {Array} Customer balances
   */
  async getAllCustomerBalances(tenantId) {
    try {
      const customers = await prisma.customer.findMany({
        where: {
          tenantId,
          isActive: true
        },
        include: {
          orders: {
            where: {
              status: 'CONFIRMED'
            }
          }
        }
      });

      const balances = [];

      for (const customer of customers) {
        try {
          const balance = await this.calculateCustomerBalance(customer.id);
          if (balance.totalPending > 0 || balance.advanceBalance > 0) {
            balances.push(balance);
          }
        } catch (err) {
          console.error(`Error calculating balance for customer ${customer.id}:`, err);
          // Continue with other customers
        }
      }

      return balances;
    } catch (error) {
      console.error('Error in getAllCustomerBalances:', error);
      return [];
    }
  }

  /**
   * Calculate supplier AP balance
   * @param {string} supplierId - Supplier ID
   * @returns {Object} Balance details
   */
  async calculateSupplierBalance(supplierId) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        purchaseInvoices: {
          where: {
            isDeleted: false
          },
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            totalAmount: true,
            paymentAmount: true,  // Include initial payment amount for backward compatibility
            purchaseItems: {
              select: {
                purchasePrice: true,
                quantity: true
              }
            },
            returns: {
              where: {
                returnType: 'SUPPLIER'
              },
              select: {
                id: true,
                totalAmount: true,
                refundMethod: true
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
            amount: true,
            date: true,
            purchaseInvoiceId: true
          }
        }
      }
    });

    if (!supplier) {
      throw new Error('Supplier not found');
    }

    // Get opening balance (positive means we owe supplier, negative means supplier owes us)
    const openingBalance = supplier.balance || 0;

    // Calculate invoice total: Use totalAmount which is already net (purchases - returns)
    // The totalAmount field is correctly set to net amount when invoice is created/updated
    // However, for return-only invoices, totalAmount is positive (the return amount)
    // but we need to subtract it from the balance
    const invoiceTotal = supplier.purchaseInvoices.reduce((sum, inv) => {
      // Check if this is a return-only invoice (has returns but no purchase items)
      const hasReturns = inv.returns && inv.returns.length > 0;
      const hasPurchaseItems = inv.purchaseItems && inv.purchaseItems.length > 0;
      
      if (hasReturns && !hasPurchaseItems) {
        // Pure return transaction: totalAmount is positive return amount, but we need to subtract it
        // because returns reduce what we owe the supplier
        return sum - inv.totalAmount;
      } else {
        // Regular purchase or purchase with returns: totalAmount is already net (purchases - returns)
        return sum + inv.totalAmount;
      }
    }, 0);

    // Calculate total paid from Payment records
    // Group payments by purchaseInvoiceId to avoid double counting
    const invoiceIds = supplier.purchaseInvoices.map(inv => inv.id);
    let paidTotal = 0;

    // Count payments linked to purchase invoices
    const paymentsByInvoice = {};
    for (const payment of supplier.payments) {
      if (payment.purchaseInvoiceId && invoiceIds.includes(payment.purchaseInvoiceId)) {
        // Payment is linked to a purchase invoice
        if (!paymentsByInvoice[payment.purchaseInvoiceId]) {
          paymentsByInvoice[payment.purchaseInvoiceId] = 0;
        }
        paymentsByInvoice[payment.purchaseInvoiceId] += payment.amount;
      } else if (!payment.purchaseInvoiceId) {
        // Legacy payment not linked to any invoice - count it separately
        paidTotal += payment.amount;
      }
    }

    // For each invoice, use linked payments if available, otherwise use paymentAmount
    // Note: We prioritize linked Payment records over paymentAmount to avoid double counting.
    // If an invoice has both linked payments and paymentAmount, we only use linked payments.
    for (const inv of supplier.purchaseInvoices) {
      if (paymentsByInvoice[inv.id]) {
        // Use payments linked to this invoice (preferred method)
        paidTotal += paymentsByInvoice[inv.id];
      } else if (inv.paymentAmount > 0) {
        // Fall back to paymentAmount for backward compatibility (old invoices without Payment records)
        paidTotal += inv.paymentAmount;
      }
    }

    // Calculate pending: opening balance + invoices - payments
    // Positive pending means we owe the supplier (Accounts Payable)
    // Negative pending means the supplier owes us (Supplier Advance / Overpayment)
    const totalOwed = openingBalance + invoiceTotal;
    const pending = totalOwed - paidTotal; // Can be negative if supplier has advance

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      openingBalance: openingBalance,
      totalInvoices: invoiceTotal,
      totalPaid: paidTotal,
      pending,
      invoices: supplier.purchaseInvoices.map(inv => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        amount: inv.totalAmount
      }))
    };
  }

  /**
   * Get all supplier balances
   * @param {string} tenantId - Tenant ID
   * @returns {Array} Supplier balances
   */
  async getAllSupplierBalances(tenantId) {
    try {
      const suppliers = await prisma.supplier.findMany({
        where: { tenantId },
        include: {
          purchaseInvoices: {
            where: {
              isDeleted: false
            },
            select: {
              id: true
            }
          }
        }
      });

      const balances = [];

      for (const supplier of suppliers) {
        try {
          // Calculate balance for all suppliers, including those without invoices
          // This will show opening balance for new suppliers
          const balance = await this.calculateSupplierBalance(supplier.id);
          balances.push(balance);
        } catch (err) {
          console.error(`Error calculating balance for supplier ${supplier.id}:`, err);
          // Continue with other suppliers
        }
      }

      return balances;
    } catch (error) {
      console.error('Error in getAllSupplierBalances:', error);
      return [];
    }
  }

  /**
   * Get balance summary
   * @param {string} tenantId - Tenant ID
   * @returns {Object} Balance summary
   */
  async getBalanceSummary(tenantId) {
    try {
      const [customerBalances, supplierBalances, accounts] = await Promise.all([
        this.getAllCustomerBalances(tenantId).catch(err => {
          console.error('Error fetching customer balances:', err);
          return [];
        }),
        this.getAllSupplierBalances(tenantId).catch(err => {
          console.error('Error fetching supplier balances:', err);
          return [];
        }),
        prisma.account.findMany({
          where: { tenantId },
          select: {
            name: true,
            type: true,
            balance: true
          }
        }).catch(err => {
          console.error('Error fetching accounts:', err);
          return [];
        })
      ]);

      const totalReceivables = customerBalances.reduce((sum, b) => sum + (b.totalPending || 0), 0);
      // Total Payables should only include positive pending balances (we owe suppliers)
      // Negative balances (supplier advances) should not be included in payables
      const totalPayables = supplierBalances.reduce((sum, b) => {
        const pending = b.pending || 0;
        return sum + (pending > 0 ? pending : 0); // Only sum positive pending (we owe them)
      }, 0);

      const expensesByCategory = {};
      accounts
        .filter(a => a.type === 'EXPENSE')
        .forEach(a => {
          expensesByCategory[a.name] = a.balance || 0;
        });

      const cashAccounts = accounts.filter(a =>
        a.type === 'ASSET' && (a.name?.includes('Cash') || a.name?.includes('Bank'))
      );
      const cashPosition = cashAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);

      return {
        totalReceivables: totalReceivables || 0,
        totalPayables: totalPayables || 0,
        expensesByCategory,
        cashPosition: cashPosition || 0,
        netBalance: totalReceivables - totalPayables,
        customerCount: customerBalances.length || 0,
        supplierCount: supplierBalances.length || 0
      };
    } catch (error) {
      console.error('Error in getBalanceSummary:', error);
      throw error;
    }
  }
}

module.exports = new BalanceService();

