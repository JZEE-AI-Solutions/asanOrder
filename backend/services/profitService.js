const prisma = require('../lib/db');
const accountingService = require('./accountingService');

class ProfitService {
  /**
   * Calculate profit for a period
   * @param {Object} filters - Filter options
   * @returns {Object} Profit calculation
   */
  async calculateProfit(filters = {}) {
    const {
      tenantId,
      fromDate,
      toDate
    } = filters;

    const dateFilter = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) dateFilter.lte = new Date(toDate);

    // Get revenue (Sales - Returns)
    const confirmedOrders = await prisma.order.findMany({
      where: {
        tenantId,
        status: 'CONFIRMED',
        createdAt: dateFilter
      },
      select: {
        selectedProducts: true,
        productQuantities: true,
        productPrices: true,
        shippingCharges: true,
        refundAmount: true
      }
    });

    let totalRevenue = 0;
    let totalShippingRevenue = 0;

    for (const order of confirmedOrders) {
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
        continue;
      }

      // Calculate products revenue
      if (Array.isArray(selectedProducts)) {
        selectedProducts.forEach(product => {
          const quantity = productQuantities[product.id] || product.quantity || 1;
          const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
          totalRevenue += price * quantity;
        });
      }

      // Add shipping revenue
      const shippingCharges = order.shippingCharges || 0;
      totalShippingRevenue += shippingCharges;
    }

    // Subtract returns
    const returns = await prisma.return.findMany({
      where: {
        tenantId,
        returnType: {
          in: ['CUSTOMER_FULL', 'CUSTOMER_PARTIAL']
        },
        status: {
          in: ['APPROVED', 'REFUNDED']
        },
        returnDate: dateFilter
      },
      select: {
        refundAmount: true
      }
    });

    const totalReturns = returns.reduce((sum, r) => sum + (r.refundAmount || 0), 0);
    totalRevenue -= totalReturns;

    // Get expenses
    const expenses = await prisma.expense.findMany({
      where: {
        tenantId,
        date: dateFilter
      },
      select: {
        amount: true,
        category: true
      }
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    // Get shipping variance
    const ordersWithVariance = await prisma.order.findMany({
      where: {
        tenantId,
        shippingVariance: {
          not: null
        },
        shippingVarianceDate: dateFilter
      },
      select: {
        shippingVariance: true
      }
    });

    const shippingVarianceExpense = ordersWithVariance
      .filter(o => o.shippingVariance > 0)
      .reduce((sum, o) => sum + o.shippingVariance, 0);

    const shippingVarianceIncome = Math.abs(
      ordersWithVariance
        .filter(o => o.shippingVariance < 0)
        .reduce((sum, o) => sum + o.shippingVariance, 0)
    );

    // Calculate net profit
    const netProfit = totalRevenue + totalShippingRevenue - totalExpenses 
      - shippingVarianceExpense + shippingVarianceIncome;

    return {
      period: {
        fromDate: fromDate ? new Date(fromDate) : null,
        toDate: toDate ? new Date(toDate) : null
      },
      revenue: {
        products: totalRevenue,
        shipping: totalShippingRevenue,
        total: totalRevenue + totalShippingRevenue
      },
      returns: totalReturns,
      expenses: {
        total: totalExpenses,
        byCategory: expenses.reduce((acc, e) => {
          acc[e.category] = (acc[e.category] || 0) + e.amount;
          return acc;
        }, {})
      },
      shippingVariance: {
        expense: shippingVarianceExpense,
        income: shippingVarianceIncome,
        net: shippingVarianceIncome - shippingVarianceExpense
      },
      netProfit,
      profitMargin: (totalRevenue + totalShippingRevenue) > 0 
        ? (netProfit / (totalRevenue + totalShippingRevenue)) * 100 
        : 0
    };
  }

  /**
   * Create profit distribution
   * @param {Object} distributionData - Distribution data
   * @returns {Object} Created distribution
   */
  async createProfitDistribution(distributionData) {
    const {
      tenantId,
      date,
      fromDate,
      toDate,
      totalProfitAmount,
      distributionMethod, // PERCENTAGE, EQUAL, CUSTOM
      investorShares // Array of {investorId, percentage or amount}
    } = distributionData;

    const investors = await prisma.investor.findMany({
      where: {
        tenantId,
        status: 'ACTIVE'
      }
    });

    if (investors.length === 0) {
      throw new Error('No active investors found');
    }

    // Calculate distribution amounts
    const distributionItems = [];
    let remainingProfit = totalProfitAmount;

    if (distributionMethod === 'EQUAL') {
      const sharePerInvestor = totalProfitAmount / investors.length;
      investors.forEach(investor => {
        distributionItems.push({
          investorId: investor.id,
          profitAmount: sharePerInvestor
        });
      });
    } else if (distributionMethod === 'PERCENTAGE') {
      investors.forEach(investor => {
        const percentage = investor.investmentPercentage || (100 / investors.length);
        const amount = totalProfitAmount * (percentage / 100);
        distributionItems.push({
          investorId: investor.id,
          profitAmount: amount
        });
      });
    } else if (distributionMethod === 'CUSTOM' && investorShares) {
      investorShares.forEach(share => {
        const amount = share.amount || (totalProfitAmount * (share.percentage / 100));
        distributionItems.push({
          investorId: share.investorId,
          profitAmount: amount
        });
        remainingProfit -= amount;
      });
    } else {
      throw new Error('Invalid distribution method');
    }

    // Generate distribution number
    const distributionCount = await prisma.profitDistribution.count({
      where: { tenantId }
    });
    const distributionNumber = `PROF-${new Date().getFullYear()}-${String(distributionCount + 1).padStart(4, '0')}`;

    return await prisma.$transaction(async (tx) => {
      // Create distribution
      const distribution = await tx.profitDistribution.create({
        data: {
          distributionNumber,
          date: new Date(date),
          totalProfitAmount,
          fromDate: new Date(fromDate),
          toDate: new Date(toDate),
          status: 'PENDING',
          tenantId,
          distributionItems: {
            create: distributionItems.map(item => ({
              investorId: item.investorId,
              profitAmount: item.profitAmount
            }))
          }
        },
        include: {
          distributionItems: {
            include: {
              investor: true
            }
          }
        }
      });

      return distribution;
    });
  }

  /**
   * Approve profit distribution
   * @param {string} distributionId - Distribution ID
   * @param {string} tenantId - Tenant ID
   * @returns {Object} Updated distribution
   */
  async approveProfitDistribution(distributionId, tenantId) {
    return await prisma.profitDistribution.update({
      where: {
        id: distributionId,
        tenantId
      },
      data: {
        status: 'APPROVED'
      },
      include: {
        distributionItems: {
          include: {
            investor: true
          }
        }
      }
    });
  }

  /**
   * Distribute profit to investors (create accounting entries)
   * @param {string} distributionId - Distribution ID
   * @param {string} tenantId - Tenant ID
   * @returns {Object} Updated distribution with transactions
   */
  async distributeProfit(distributionId, tenantId) {
    const distribution = await prisma.profitDistribution.findFirst({
      where: {
        id: distributionId,
        tenantId
      },
      include: {
        distributionItems: {
          include: {
            investor: true
          }
        }
      }
    });

    if (!distribution) {
      throw new Error('Profit distribution not found');
    }

    if (distribution.status !== 'APPROVED') {
      throw new Error('Profit distribution must be approved before distributing');
    }

    return await prisma.$transaction(async (tx) => {
      // Get retained earnings account
      const retainedEarningsAccount = await accountingService.getAccountByCode('3200', tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '3200',
          name: 'Retained Earnings',
          type: 'EQUITY',
          tenantId,
          balance: 0
        });

      // Create profit payable accounts and transaction lines
      const transactionLines = [
        {
          accountId: retainedEarningsAccount.id,
          debitAmount: distribution.totalProfitAmount,
          creditAmount: 0
        }
      ];

      const profitPayableAccounts = {};

      for (const item of distribution.distributionItems) {
        // Get or create profit payable account for investor
        const accountCode = `220${item.investor.id.slice(-1)}`;
        let profitPayableAccount = await accountingService.getAccountByCode(accountCode, tenantId);
        
        if (!profitPayableAccount) {
          profitPayableAccount = await accountingService.getOrCreateAccount({
            code: accountCode,
            name: `Profit Payable - ${item.investor.name}`,
            type: 'LIABILITY',
            tenantId,
            balance: 0
          });
        }

        profitPayableAccounts[item.investorId] = profitPayableAccount;

        transactionLines.push({
          accountId: profitPayableAccount.id,
          debitAmount: 0,
          creditAmount: item.profitAmount
        });
      }

      // Create accounting transaction
      const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      const transaction = await accountingService.createTransaction(
        {
          transactionNumber,
          date: distribution.date,
          description: `Profit Distribution: ${distribution.distributionNumber}`,
          tenantId
        },
        transactionLines
      );

      // Update distribution status
      await tx.profitDistribution.update({
        where: { id: distributionId },
        data: { 
          transactionId: transaction.id,
          status: 'DISTRIBUTED'
        }
      });

      // Update investor profit balances
      for (const item of distribution.distributionItems) {
        await tx.investor.update({
          where: { id: item.investorId },
          data: {
            // Note: profit received will be updated when withdrawal is made
          }
        });
      }

      // Update tenant
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId }
      });
      
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          totalProfitDistributed: (tenant.totalProfitDistributed || 0) + distribution.totalProfitAmount
        }
      });

      return {
        ...distribution,
        transaction
      };
    });
  }

  /**
   * Get profit distributions
   * @param {Object} filters - Filter options
   * @returns {Object} Distributions with pagination
   */
  async getProfitDistributions(filters = {}) {
    const {
      tenantId,
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'desc',
      status
    } = filters;

    const skip = (page - 1) * limit;

    const where = {
      tenantId
    };

    if (status) where.status = status;

    const [distributions, total] = await Promise.all([
      prisma.profitDistribution.findMany({
        where,
        include: {
          distributionItems: {
            include: {
              investor: true
            }
          },
          transaction: {
            include: {
              transactionLines: {
                include: {
                  account: true
                }
              }
            }
          }
        },
        orderBy: {
          [sort]: order
        },
        skip,
        take: limit
      }),
      prisma.profitDistribution.count({ where })
    ]);

    return {
      data: distributions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get profit statistics for orders
   * @param {string} tenantId - Tenant ID
   * @param {Object} filters - Filter options (startDate, endDate, status)
   * @returns {Object} Profit statistics with order details
   */
  async getProfitStatistics(tenantId, filters = {}) {
    const { startDate, endDate, status } = filters;

    // Build where clause
    const whereClause = {
      tenantId,
      status: { in: ['CONFIRMED', 'DISPATCHED', 'COMPLETED'] }
    };

    if (status) {
      whereClause.status = status.toUpperCase();
    }

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    if (Object.keys(dateFilter).length > 0) {
      whereClause.createdAt = dateFilter;
    }

    // Get orders
    const orders = await prisma.order.findMany({
      where: whereClause,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        status: true,
        selectedProducts: true,
        productQuantities: true,
        productPrices: true,
        shippingCharges: true,
        shippingVariance: true,
        actualShippingCost: true,
        codFee: true,
        codFeePaidBy: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    let totalRevenue = 0;
    let totalCost = 0;
    const orderProfits = [];

    // Calculate profit for each order
    for (const order of orders) {
      try {
        // Parse order data
        let selectedProducts = [];
        let productQuantities = {};
        let productPrices = {};

        selectedProducts = typeof order.selectedProducts === 'string' 
          ? JSON.parse(order.selectedProducts) 
          : (order.selectedProducts || []);
        productQuantities = typeof order.productQuantities === 'string'
          ? JSON.parse(order.productQuantities)
          : (order.productQuantities || {});
        productPrices = typeof order.productPrices === 'string'
          ? JSON.parse(order.productPrices)
          : (order.productPrices || {});

        // Calculate revenue (products + shipping)
        let orderRevenue = 0;
        if (Array.isArray(selectedProducts)) {
          selectedProducts.forEach(product => {
            const quantity = productQuantities[product.id] || product.quantity || 1;
            const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
            orderRevenue += price * quantity;
          });
        }
        orderRevenue += (order.shippingCharges || 0);
        
        // Add COD fee revenue if customer pays
        if (order.codFeePaidBy === 'CUSTOMER' && order.codFee && order.codFee > 0) {
          orderRevenue += order.codFee;
        }

        // Calculate cost (COGS + actual shipping cost)
        let orderCost = 0;
        if (Array.isArray(selectedProducts)) {
          for (const product of selectedProducts) {
            const quantity = productQuantities[product.id] || product.quantity || 1;
            // Try to get purchase price from product data first
            let purchasePrice = product.purchasePrice || product.currentPurchasePrice || product.lastPurchasePrice || 0;
            
            // If not found, fetch from database
            if (!purchasePrice && product.id) {
              try {
                const dbProduct = await prisma.product.findUnique({
                  where: { id: product.id },
                  select: { lastPurchasePrice: true }
                });
                purchasePrice = dbProduct?.lastPurchasePrice || 0;
              } catch (e) {
                // If product not found, use 0
                purchasePrice = 0;
              }
            }
            orderCost += purchasePrice * quantity;
          }
        }
        
        // Add actual shipping cost to order cost
        // If actualShippingCost is not set, use shippingCharges as fallback
        const actualShippingCost = order.actualShippingCost !== null && order.actualShippingCost !== undefined
          ? order.actualShippingCost
          : (order.shippingCharges || 0);
        orderCost += actualShippingCost;

        // Add COD fee expense (business always pays logistics company, regardless of who pays customer)
        if (order.codFee && order.codFee > 0) {
          orderCost += order.codFee;
        }

        const orderProfit = orderRevenue - orderCost;
        const profitMargin = orderRevenue > 0 ? (orderProfit / orderRevenue) * 100 : 0;

        totalRevenue += orderRevenue;
        totalCost += orderCost;

        orderProfits.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          status: order.status,
          totalRevenue: orderRevenue,
          totalCost: orderCost,
          profit: orderProfit,
          profitMargin: profitMargin
        });
      } catch (error) {
        console.error(`Error calculating profit for order ${order.orderNumber}:`, error);
        // Continue with next order
      }
    }

    // Calculate shipping variance totals
    const ordersWithVariance = orders.filter(o => o.shippingVariance !== null && o.shippingVariance !== undefined);
    const shippingVarianceExpense = ordersWithVariance
      .filter(o => o.shippingVariance < 0)
      .reduce((sum, o) => sum + Math.abs(o.shippingVariance), 0);
    const shippingVarianceIncome = ordersWithVariance
      .filter(o => o.shippingVariance > 0)
      .reduce((sum, o) => sum + o.shippingVariance, 0);
    const shippingVarianceNet = shippingVarianceIncome - shippingVarianceExpense;

    // Calculate total profit
    // Note: Shipping variance is already accounted for in the cost calculation
    // (we use actualShippingCost in cost, not shippingCharges)
    // So variance = shippingCharges - actualShippingCost is automatically included
    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin,
      orderCount: orders.length,
      orders: orderProfits,
      shippingVariance: {
        expense: shippingVarianceExpense,
        income: shippingVarianceIncome,
        net: shippingVarianceNet
      }
    };
  }
}

module.exports = new ProfitService();
