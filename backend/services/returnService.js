const prisma = require('../lib/db');
const accountingService = require('./accountingService');

class ReturnService {
  /**
   * Create customer order return
   * @param {Object} returnData - Return data
   * @returns {Object} Created return
   */
  async createOrderReturn(returnData) {
    const {
      tenantId,
      orderId,
      returnType, // CUSTOMER_FULL, CUSTOMER_PARTIAL
      reason,
      returnDate,
      shippingChargeHandling, // CUSTOMER_PAYS, FULL_REFUND, DEDUCT_FROM_ADVANCE
      shippingChargeAmount,
      selectedProducts // For partial returns
    } = returnData;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true
      }
    });

    if (!order || order.tenantId !== tenantId) {
      throw new Error('Order not found');
    }

    // Parse order data
    let selectedProductsList = [];
    let productQuantities = {};
    let productPrices = {};

    try {
      selectedProductsList = typeof order.selectedProducts === 'string' 
        ? JSON.parse(order.selectedProducts) 
        : (order.selectedProducts || []);
      productQuantities = typeof order.productQuantities === 'string'
        ? JSON.parse(order.productQuantities)
        : (order.productQuantities || {});
      productPrices = typeof order.productPrices === 'string'
        ? JSON.parse(order.productPrices)
        : (order.productPrices || {});
    } catch (e) {
      throw new Error('Invalid order data');
    }

    // Calculate return amount
    let productsValue = 0;
    const productsToReturn = returnType === 'CUSTOMER_FULL' 
      ? selectedProductsList 
      : (selectedProducts || []);

    productsToReturn.forEach(product => {
      const productId = product.id || product;
      const quantity = productQuantities[productId] || product.quantity || 1;
      const price = productPrices[productId] || product.price || product.currentRetailPrice || 0;
      productsValue += price * quantity;
    });

    const shippingCharges = order.shippingCharges || 0;
    let finalRefundAmount = productsValue;
    let advanceBalanceUsed = 0;

    // Handle shipping charges
    if (shippingChargeHandling === 'FULL_REFUND') {
      finalRefundAmount += shippingCharges;
    } else if (shippingChargeHandling === 'DEDUCT_FROM_ADVANCE') {
      const customer = order.customer;
      const advanceBalance = customer?.advanceBalance || 0;
      
      if (advanceBalance >= shippingCharges) {
        advanceBalanceUsed = shippingCharges;
      } else {
        advanceBalanceUsed = advanceBalance;
        finalRefundAmount -= (shippingCharges - advanceBalance);
      }
    } else if (shippingChargeHandling === 'CUSTOMER_PAYS') {
      finalRefundAmount -= shippingCharges;
    }

    // Generate return number
    const returnCount = await prisma.return.count({
      where: { tenantId }
    });
    const returnNumber = `RET-${new Date().getFullYear()}-${String(returnCount + 1).padStart(4, '0')}`;

    return await prisma.$transaction(async (tx) => {
      // Create return
      const returnRecord = await tx.return.create({
        data: {
          returnNumber,
          reason,
          returnDate: new Date(returnDate),
          totalAmount: finalRefundAmount,
          status: 'PENDING',
          tenantId,
          orderId,
          returnType,
          shippingChargeHandling,
          shippingChargeAmount: shippingCharges,
          advanceBalanceUsed,
          refundAmount: finalRefundAmount
        }
      });

      // Create return items
      for (const product of productsToReturn) {
        const productId = product.id || product;
        const quantity = productQuantities[productId] || product.quantity || 1;
        const price = productPrices[productId] || product.price || product.currentRetailPrice || 0;
        
        await tx.returnItem.create({
          data: {
            productName: product.name || 'Product',
            purchasePrice: price,
            quantity,
            reason,
            returnId: returnRecord.id
          }
        });
      }

      // Create accounting reversal transaction
      const salesReturnsAccount = await accountingService.getAccountByCode('4100', tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '4100',
          name: 'Sales Returns',
          type: 'INCOME',
          tenantId,
          balance: 0
        });

      const arAccount = await accountingService.getAccountByCode('1200', tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '1200',
          name: 'Accounts Receivable',
          type: 'ASSET',
          tenantId,
          balance: 0
        });

      const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      
      const transactionLines = [
        {
          accountId: salesReturnsAccount.id,
          debitAmount: productsValue,
          creditAmount: 0
        },
        {
          accountId: arAccount.id,
          debitAmount: 0,
          creditAmount: productsValue
        }
      ];

      // Add shipping refund if applicable
      if (shippingChargeHandling === 'FULL_REFUND') {
        transactionLines[0].debitAmount += shippingCharges;
        transactionLines[1].creditAmount += shippingCharges;
      }

      const transaction = await accountingService.createTransaction(
        {
          transactionNumber,
          date: new Date(returnDate),
          description: `Return: ${returnNumber} - ${reason || 'Customer return'}`,
          tenantId,
          orderReturnId: returnRecord.id
        },
        transactionLines
      );

      // Update return with transaction
      await tx.return.update({
        where: { id: returnRecord.id },
        data: { 
          // Note: transactionId will be set via the relation
        }
      });

      // Update order
      const currentRefundAmount = order.refundAmount || 0;
      const newReturnStatus = returnType === 'CUSTOMER_FULL' ? 'FULL' : 'PARTIAL';
      
      await tx.order.update({
        where: { id: orderId },
        data: {
          refundAmount: currentRefundAmount + finalRefundAmount,
          returnStatus: newReturnStatus
        }
      });

      // Update customer advance balance if used
      if (advanceBalanceUsed > 0 && order.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: order.customerId }
        });
        
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            advanceBalance: (customer.advanceBalance || 0) - advanceBalanceUsed
          }
        });
      }

      // Increase inventory for returned products
      // TODO: Implement inventory update logic

      return {
        ...returnRecord,
        transaction
      };
    });
  }

  /**
   * Approve return
   * @param {string} returnId - Return ID
   * @param {string} tenantId - Tenant ID
   * @returns {Object} Updated return
   */
  async approveReturn(returnId, tenantId) {
    return await prisma.return.update({
      where: {
        id: returnId,
        tenantId
      },
      data: {
        status: 'APPROVED'
      },
      include: {
        order: true,
        returnItems: true
      }
    });
  }

  /**
   * Process refund
   * @param {string} returnId - Return ID
   * @param {Object} refundData - Refund data
   * @returns {Object} Updated return
   */
  async processRefund(returnId, refundData) {
    const {
      tenantId,
      refundMethod, // Cash, Bank Transfer, Credit to Account
      refundAmount
    } = refundData;

    const returnRecord = await prisma.return.findFirst({
      where: {
        id: returnId,
        tenantId
      },
      include: {
        order: {
          include: {
            customer: true
          }
        }
      }
    });

    if (!returnRecord) {
      throw new Error('Return not found');
    }

    if (returnRecord.status !== 'APPROVED') {
      throw new Error('Return must be approved before processing refund');
    }

    const finalRefundAmount = refundAmount || returnRecord.refundAmount || 0;

    return await prisma.$transaction(async (tx) => {
      // Get accounts
      const salesReturnsAccount = await accountingService.getAccountByCode('4100', tenantId);
      const cashAccount = await accountingService.getAccountByCode('1000', tenantId);
      const bankAccount = await accountingService.getAccountByCode('1100', tenantId);
      const advanceBalanceAccount = await accountingService.getAccountByCode('1210', tenantId);

      let transactionLines = [];

      if (refundMethod === 'Credit to Account') {
        // Credit to customer advance balance
        transactionLines = [
          {
            accountId: salesReturnsAccount.id,
            debitAmount: finalRefundAmount,
            creditAmount: 0
          },
          {
            accountId: advanceBalanceAccount.id,
            debitAmount: 0,
            creditAmount: finalRefundAmount
          }
        ];

        // Update customer advance balance
        if (returnRecord.order?.customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: returnRecord.order.customerId }
          });
          
          await tx.customer.update({
            where: { id: returnRecord.order.customerId },
            data: {
              advanceBalance: (customer.advanceBalance || 0) + finalRefundAmount
            }
          });
        }
      } else {
        // Cash or Bank Transfer
        const paymentAccount = refundMethod === 'Cash' ? cashAccount : bankAccount;
        
        transactionLines = [
          {
            accountId: salesReturnsAccount.id,
            debitAmount: finalRefundAmount,
            creditAmount: 0
          },
          {
            accountId: paymentAccount.id,
            debitAmount: 0,
            creditAmount: finalRefundAmount
          }
        ];
      }

      const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      const transaction = await accountingService.createTransaction(
        {
          transactionNumber,
          date: new Date(),
          description: `Refund: ${returnRecord.returnNumber} - ${refundMethod}`,
          tenantId,
          orderReturnId: returnId
        },
        transactionLines
      );

      // Update return status
      const updatedReturn = await tx.return.update({
        where: { id: returnId },
        data: {
          status: 'REFUNDED',
          refundMethod,
          refundAmount: finalRefundAmount
        },
        include: {
          order: true,
          returnItems: true
        }
      });

      return {
        ...updatedReturn,
        transaction
      };
    });
  }

  /**
   * Get returns with filters
   * @param {Object} filters - Filter options
   * @returns {Object} Returns with pagination
   */
  async getReturns(filters = {}) {
    const {
      tenantId,
      page = 1,
      limit = 20,
      sort = 'returnDate',
      order = 'desc',
      returnType,
      status,
      orderId
    } = filters;

    const skip = (page - 1) * limit;

    const where = {
      tenantId
    };

    if (returnType) where.returnType = returnType;
    if (status) where.status = status;
    if (orderId) where.orderId = orderId;

    const [returns, total] = await Promise.all([
      prisma.return.findMany({
        where,
        include: {
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
          },
          returnItems: true
        },
        orderBy: {
          [sort]: order
        },
        skip,
        take: limit
      }),
      prisma.return.count({ where })
    ]);

    return {
      data: returns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = new ReturnService();

