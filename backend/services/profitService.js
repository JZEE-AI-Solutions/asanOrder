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
}

module.exports = new ProfitService();
