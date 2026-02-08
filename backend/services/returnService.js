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

    // Check for existing returns on this order
    const existingReturns = await prisma.return.findMany({
      where: {
        orderId,
        tenantId,
        status: {
          in: ['PENDING', 'APPROVED', 'REFUNDED'] // Only count active returns
        }
      }
    });

    // Calculate total order value
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

    // Calculate total order value
    let totalOrderValue = 0;
    selectedProductsList.forEach(product => {
      const productId = product.id || product;
      const quantity = productQuantities[productId] || 1;
      const price = productPrices[productId] || product.price || product.currentRetailPrice || 0;
      totalOrderValue += price * quantity;
    });
    const shippingCharges = order.shippingCharges || 0;
    const totalOrderAmount = totalOrderValue + shippingCharges;

    // Calculate total already returned
    const totalReturnedAmount = existingReturns.reduce((sum, ret) => sum + (ret.totalAmount || 0), 0);
    const remainingOrderValue = totalOrderAmount - totalReturnedAmount;

    // Validation: Prevent full return if one already exists
    if (returnType === 'CUSTOMER_FULL') {
      const hasFullReturn = existingReturns.some(ret => ret.returnType === 'CUSTOMER_FULL');
      if (hasFullReturn) {
        throw new Error('A full return already exists for this order. Cannot create another full return.');
      }
      
      // Also check if existing partial returns already cover the full order
      if (totalReturnedAmount >= totalOrderAmount * 0.99) {
        throw new Error('This order has already been fully returned. Total returned amount exceeds 99% of order value.');
      }
    }

    // Validation: For partial returns, check if it would exceed order value
    if (returnType === 'CUSTOMER_PARTIAL') {
      // Calculate value of products being returned in this partial return
      let partialReturnValue = 0;
      if (selectedProducts && selectedProducts.length > 0) {
        selectedProducts.forEach(product => {
          const productId = typeof product === 'object' ? (product.id || product) : product;
          const quantity = typeof product === 'object' && product.quantity !== undefined
            ? product.quantity
            : (productQuantities[productId] || 1);
          const price = typeof product === 'object' && product.price !== undefined
            ? product.price
            : (productPrices[productId] || 0);
          partialReturnValue += price * quantity;
        });
      }

      // Check if this partial return would exceed remaining order value
      if (totalReturnedAmount + partialReturnValue > totalOrderAmount * 1.01) { // 1% tolerance for rounding
        throw new Error(`This partial return would exceed the order value. Remaining order value: Rs. ${remainingOrderValue.toFixed(2)}, Return amount: Rs. ${partialReturnValue.toFixed(2)}`);
      }
    }

    // Calculate return amount (using already parsed data)
    let productsValue = 0;
    const productsToReturn = returnType === 'CUSTOMER_FULL' 
      ? selectedProductsList 
      : (selectedProducts || []);

    if (!productsToReturn || productsToReturn.length === 0) {
      throw new Error('No products selected for return');
    }

    productsToReturn.forEach(product => {
      // Handle both object format {id, quantity, price} and simple ID format
      const productId = typeof product === 'object' ? (product.id || product) : product;
      const quantity = typeof product === 'object' && product.quantity !== undefined
        ? product.quantity
        : (productQuantities[productId] || 1);
      const price = typeof product === 'object' && product.price !== undefined
        ? product.price
        : (productPrices[productId] || 0);
      productsValue += price * quantity;
    });

    // shippingCharges already declared above (line 71)
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

      // Get order items to extract variant info
      const orderItems = await tx.orderItem.findMany({
        where: { orderId: orderId }
      });

      // Map by composite key (productId_variantId) so multiple variant lines of same product are correct
      const orderItemsMap = new Map();
      orderItems.forEach(item => {
        if (item.productId) {
          const compositeKey = `${item.productId}_${item.productVariantId || 'base'}`;
          orderItemsMap.set(compositeKey, item);
          if (!item.productVariantId) orderItemsMap.set(item.productId, item); // legacy single-key
        }
      });

      // Create return items
      for (const product of productsToReturn) {
        const productId = typeof product === 'object' ? (product.id || product) : product;
        const variantId = typeof product === 'object' ? (product.variantId || product.productVariantId) : null;
        const compositeKey = variantId ? `${productId}_${variantId}` : productId;
        const quantity = typeof product === 'object' && product.quantity !== undefined
          ? product.quantity
          : (productQuantities[compositeKey] ?? productQuantities[productId] ?? 1);
        const price = typeof product === 'object' && product.price !== undefined
          ? product.price
          : (productPrices[compositeKey] ?? productPrices[productId] ?? 0);
        const productName = typeof product === 'object' && product.name
          ? product.name
          : ('Product');

        const orderItem = orderItemsMap.get(compositeKey) || orderItemsMap.get(productId);
        const variantIdResolved = orderItem?.productVariantId || variantId;
        const color = orderItem?.color || (typeof product === 'object' ? product.color : null);
        const size = orderItem?.size || (typeof product === 'object' ? product.size : null);
        
        await tx.returnItem.create({
          data: {
            productName,
            purchasePrice: price,
            quantity,
            reason,
            returnId: returnRecord.id,
            productVariantId: variantIdResolved || null,
            color: color || null,
            size: size || null
          }
        });
      }

      // Note: Accounting entries are now created on approval, not on creation
      // This allows returns to be created as drafts and edited without accounting impact

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

      return returnRecord;
    });
  }

  /**
   * Approve return
   * @param {string} returnId - Return ID
   * @param {string} tenantId - Tenant ID
   * @returns {Object} Updated return
   */
  async approveReturn(returnId, tenantId) {
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
        },
        returnItems: true,
        transactions: true
      }
    });

    if (!returnRecord) {
      throw new Error('Return not found');
    }

    if (returnRecord.status !== 'PENDING') {
      throw new Error('Only pending returns can be approved');
    }

    // Check if accounting transaction already exists (shouldn't happen, but safety check)
    if (returnRecord.transactions && returnRecord.transactions.length > 0) {
      // Transaction already exists, just update status
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

    const transactionResult = await prisma.$transaction(async (tx) => {
      // Get accounts
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

      // Calculate transaction amounts from return items
      // Note: totalAmount already includes shipping if FULL_REFUND, so we need to recalculate
      let productsValue = 0;
      if (returnRecord.returnItems && returnRecord.returnItems.length > 0) {
        productsValue = returnRecord.returnItems.reduce((sum, item) => {
          return sum + (item.purchasePrice || 0) * (item.quantity || 0);
        }, 0);
      }
      
      const shippingCharges = returnRecord.shippingChargeAmount || 0;
      
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
      if (returnRecord.shippingChargeHandling === 'FULL_REFUND') {
        transactionLines[0].debitAmount += shippingCharges;
        transactionLines[1].creditAmount += shippingCharges;
      }

      // Validate transaction balance
      const totalDebits = transactionLines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
      const totalCredits = transactionLines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);
      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error(`Transaction is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
      }

      // Create accounting transaction
      const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      const transactionDate = new Date();
      
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber,
          date: transactionDate,
          description: `Return Approved: ${returnRecord.returnNumber} - ${returnRecord.reason || 'Customer return'}`,
          tenantId,
          orderId: returnRecord.orderId || null,
          orderReturnId: returnRecord.id,
          transactionLines: {
            create: transactionLines.map(line => ({
              accountId: line.accountId,
              debitAmount: line.debitAmount || 0,
              creditAmount: line.creditAmount || 0
            }))
          }
        },
        include: {
          transactionLines: {
            include: {
              account: true
            }
          }
        }
      });

      // Update account balances
      for (const line of transactionLines) {
        const account = await tx.account.findUnique({
          where: { id: line.accountId }
        });

        if (account) {
          const isDebitIncrease = account.type === 'ASSET' || account.type === 'EXPENSE';
          let balanceChange;
          
          if (isDebitIncrease) {
            balanceChange = (line.debitAmount || 0) - (line.creditAmount || 0);
          } else if (account.type === 'EQUITY') {
            balanceChange = (line.debitAmount || 0) - (line.creditAmount || 0);
          } else {
            balanceChange = (line.creditAmount || 0) - (line.debitAmount || 0);
          }
          
          await tx.account.update({
            where: { id: line.accountId },
            data: {
              balance: account.balance + balanceChange
            }
          });
        }
      }

      // Update return status
      const updatedReturn = await tx.return.update({
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

      return {
        ...updatedReturn,
        transaction
      };
    });

    const approvedReturnForResponse = transactionResult;

    // Increase inventory after transaction (business receives product back from customer return)
    const isCustomerReturn = returnRecord.returnType === 'CUSTOMER_FULL' || returnRecord.returnType === 'CUSTOMER_PARTIAL';
    if (isCustomerReturn && approvedReturnForResponse?.returnItems?.length > 0) {
      try {
        const InventoryService = require('./inventoryService');
        await InventoryService.increaseInventoryFromCustomerReturn(
          tenantId,
          approvedReturnForResponse.returnItems,
          returnId,
          approvedReturnForResponse.returnNumber
        );
      } catch (inventoryErr) {
        console.error('⚠️  Inventory increase from customer return failed (return still approved):', inventoryErr);
      }
    }

    return approvedReturnForResponse;
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

  /**
   * Update order return (full editability)
   * @param {string} returnId - Return ID
   * @param {Object} updateData - Update data
   * @returns {Object} Updated return
   */
  async updateOrderReturn(returnId, updateData) {
    const {
      tenantId,
      returnType,
      reason,
      returnDate,
      shippingChargeHandling,
      shippingChargeAmount,
      selectedProducts,
      refundMethod,
      refundAmount
    } = updateData;

    // Get existing return
    const existingReturn = await prisma.return.findFirst({
      where: {
        id: returnId,
        tenantId
      },
      include: {
        order: {
          include: {
            customer: true
          }
        },
        returnItems: true,
        transactions: {
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

    if (!existingReturn) {
      throw new Error('Return not found');
    }

    // Allow editing if status is PENDING or APPROVED (but not REFUNDED or REJECTED)
    if (existingReturn.status === 'REFUNDED') {
      throw new Error('Cannot edit return after refund has been processed');
    }
    
    if (existingReturn.status === 'REJECTED') {
      throw new Error('Cannot edit rejected return');
    }

    const order = existingReturn.order;
    if (!order) {
      throw new Error('Order not found for return');
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

    // Calculate new return amount
    const productsToReturn = returnType === 'CUSTOMER_FULL' 
      ? selectedProductsList 
      : (selectedProducts || existingReturn.returnItems.map(item => ({
          id: item.id,
          name: item.productName,
          quantity: item.quantity,
          price: item.purchasePrice
        })));

    let productsValue = 0;
    productsToReturn.forEach(product => {
      const productId = product.id || product;
      const quantity = productQuantities[productId] || product.quantity || 1;
      const price = productPrices[productId] || product.price || product.currentRetailPrice || 0;
      productsValue += price * quantity;
    });

    const shippingCharges = order.shippingCharges || 0;
    const finalShippingChargeAmount = shippingChargeAmount !== undefined ? shippingChargeAmount : shippingCharges;
    let finalRefundAmount = productsValue;
    let advanceBalanceUsed = 0;

    // Handle shipping charges
    const handling = shippingChargeHandling || existingReturn.shippingChargeHandling;
    if (handling === 'FULL_REFUND') {
      finalRefundAmount += finalShippingChargeAmount;
    } else if (handling === 'DEDUCT_FROM_ADVANCE') {
      const customer = order.customer;
      const advanceBalance = customer?.advanceBalance || 0;
      
      if (advanceBalance >= finalShippingChargeAmount) {
        advanceBalanceUsed = finalShippingChargeAmount;
      } else {
        advanceBalanceUsed = advanceBalance;
        finalRefundAmount -= (finalShippingChargeAmount - advanceBalance);
      }
    } else if (handling === 'CUSTOMER_PAYS') {
      finalRefundAmount -= finalShippingChargeAmount;
    }

    // Use provided refund amount if specified, otherwise use calculated
    const newRefundAmount = refundAmount !== undefined ? parseFloat(refundAmount) : finalRefundAmount;

    return await prisma.$transaction(async (tx) => {
      // Reverse old accounting transaction if return was APPROVED
      // (PENDING returns don't have accounting entries yet)
      if (existingReturn.status === 'APPROVED' && existingReturn.transactions && existingReturn.transactions.length > 0) {
        for (const oldTransaction of existingReturn.transactions) {
          // Only reverse approval transactions (not refund transactions)
          // Refund transactions have different descriptions
          if (oldTransaction.description && oldTransaction.description.includes('Refund:')) {
            continue; // Skip refund transactions
          }
          
          // Create reversing transaction
          const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}-REV`;
          const reverseLines = oldTransaction.transactionLines.map(line => ({
            accountId: line.accountId,
            debitAmount: line.creditAmount, // Reverse
            creditAmount: line.debitAmount  // Reverse
          }));

          await accountingService.createTransaction(
            {
              transactionNumber: reverseTransactionNumber,
              date: new Date(),
              description: `Return Update (Reverse): ${existingReturn.returnNumber}`,
              tenantId
            },
            reverseLines
          );
        }
      }

      // Delete old return items
      await tx.returnItem.deleteMany({
        where: { returnId }
      });

      // Create new return items
      for (const product of productsToReturn) {
        const productId = product.id || product;
        const quantity = productQuantities[productId] || product.quantity || 1;
        const price = productPrices[productId] || product.price || product.currentRetailPrice || 0;
        
        await tx.returnItem.create({
          data: {
            productName: product.name || 'Product',
            purchasePrice: price,
            quantity,
            reason: reason || existingReturn.reason,
            returnId
          }
        });
      }

      // Update return record
      const updatedReturn = await tx.return.update({
        where: { id: returnId },
        data: {
          returnType: returnType || existingReturn.returnType,
          reason: reason !== undefined ? reason : existingReturn.reason,
          returnDate: returnDate ? new Date(returnDate) : existingReturn.returnDate,
          totalAmount: newRefundAmount,
          shippingChargeHandling: handling,
          shippingChargeAmount: finalShippingChargeAmount,
          advanceBalanceUsed,
          refundAmount: newRefundAmount,
          refundMethod: refundMethod || existingReturn.refundMethod
        },
        include: {
          order: {
            include: {
              customer: true
            }
          },
          returnItems: true
        }
      });

      // Create new accounting transaction only if return was APPROVED
      // (PENDING returns don't have accounting entries, so no need to recreate)
      if (existingReturn.status === 'APPROVED') {
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

        // Calculate transaction amounts
        // newRefundAmount already includes shipping if FULL_REFUND, so we need to recalculate
        // Calculate products value from updated return items
        let productsValue = 0;
        if (updatedReturn.returnItems && updatedReturn.returnItems.length > 0) {
          productsValue = updatedReturn.returnItems.reduce((sum, item) => {
            return sum + (item.purchasePrice || 0) * (item.quantity || 0);
          }, 0);
        }
        
        let transactionAmount = productsValue;
        // Add shipping refund if applicable
        if (handling === 'FULL_REFUND') {
          transactionAmount += finalShippingChargeAmount;
        }

        const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
        await accountingService.createTransaction(
          {
            transactionNumber,
            date: new Date(),
            description: `Return Update: ${updatedReturn.returnNumber}`,
            tenantId,
            orderId: order.id || null,
            orderReturnId: returnId
          },
          [
            {
              accountId: salesReturnsAccount.id,
              debitAmount: transactionAmount,
              creditAmount: 0
            },
            {
              accountId: arAccount.id,
              debitAmount: 0,
              creditAmount: transactionAmount
            }
          ]
        );
      }

      // Update order return status
      if (order) {
        const orderReturns = await tx.return.findMany({
          where: {
            orderId: order.id,
            status: { in: ['PENDING', 'APPROVED', 'REFUNDED'] }
          }
        });

        const totalReturnAmount = orderReturns.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
        const orderTotal = productsValue + shippingCharges;
        const isFullReturn = totalReturnAmount >= orderTotal * 0.99; // 99% threshold for full return

        await tx.order.update({
          where: { id: order.id },
          data: {
            returnStatus: isFullReturn ? 'FULL' : (totalReturnAmount > 0 ? 'PARTIAL' : 'NONE'),
            refundAmount: totalReturnAmount
          }
        });
      }

      return updatedReturn;
    });
  }

  /**
   * Reject return
   * @param {string} returnId - Return ID
   * @param {string} tenantId - Tenant ID
   * @param {string} reason - Rejection reason
   * @returns {Object} Updated return
   */
  async rejectReturn(returnId, tenantId, reason) {
    const existingReturn = await prisma.return.findFirst({
      where: {
        id: returnId,
        tenantId
      },
      include: {
        transactions: {
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

    if (!existingReturn) {
      throw new Error('Return not found');
    }

    // Allow rejection of PENDING or APPROVED returns
    if (existingReturn.status === 'REFUNDED') {
      throw new Error('Cannot reject return after refund has been processed');
    }
    
    if (existingReturn.status === 'REJECTED') {
      throw new Error('Return is already rejected');
    }

    return await prisma.$transaction(async (tx) => {
      // Reverse accounting transactions only if return was APPROVED
      // (PENDING returns don't have accounting entries)
      if (existingReturn.status === 'APPROVED' && existingReturn.transactions && existingReturn.transactions.length > 0) {
        for (const oldTransaction of existingReturn.transactions) {
          // Only reverse approval transactions (not refund transactions)
          if (oldTransaction.description && oldTransaction.description.includes('Refund:')) {
            continue; // Skip refund transactions
          }
          
          const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}-REJ`;
          const reverseLines = oldTransaction.transactionLines.map(line => ({
            accountId: line.accountId,
            debitAmount: line.creditAmount,
            creditAmount: line.debitAmount
          }));

          await accountingService.createTransaction(
            {
              transactionNumber: reverseTransactionNumber,
              date: new Date(),
              description: `Return Rejected (Reverse): ${existingReturn.returnNumber}`,
              tenantId
            },
            reverseLines
          );
        }
      }

      // Update return status
      const updatedReturn = await tx.return.update({
        where: { id: returnId },
        data: {
          status: 'REJECTED',
          reason: reason || existingReturn.reason || 'Return rejected'
        },
        include: {
          order: true,
          returnItems: true
        }
      });

      // Update order return status
      if (updatedReturn.orderId) {
        const orderReturns = await tx.return.findMany({
          where: {
            orderId: updatedReturn.orderId,
            status: { in: ['PENDING', 'APPROVED', 'REFUNDED'] }
          }
        });

        const totalReturnAmount = orderReturns.reduce((sum, r) => sum + (r.totalAmount || 0), 0);

        await tx.order.update({
          where: { id: updatedReturn.orderId },
          data: {
            returnStatus: totalReturnAmount > 0 ? 'PARTIAL' : 'NONE',
            refundAmount: totalReturnAmount
          }
        });
      }

      return updatedReturn;
    });
  }
}

module.exports = new ReturnService();

