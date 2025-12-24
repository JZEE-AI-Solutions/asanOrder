const prisma = require('../lib/db');
const accountingService = require('./accountingService');

class InvestorService {
  /**
   * Create investor
   * @param {Object} investorData - Investor data
   * @returns {Object} Created investor
   */
  async createInvestor(investorData) {
    const {
      tenantId,
      name,
      contact,
      address,
      email,
      phone,
      investmentPercentage
    } = investorData;

    return await prisma.investor.create({
      data: {
        name,
        contact,
        address,
        email,
        phone,
        investmentPercentage,
        tenantId,
        status: 'ACTIVE'
      }
    });
  }

  /**
   * Get investors
   * @param {string} tenantId - Tenant ID
   * @returns {Array} Investors
   */
  async getInvestors(tenantId) {
    return await prisma.investor.findMany({
      where: {
        tenantId,
        status: 'ACTIVE'
      },
      include: {
        investments: {
          orderBy: {
            date: 'desc'
          }
        },
        withdrawals: {
          orderBy: {
            date: 'desc'
          }
        },
        profitDistributionItems: {
          include: {
            profitDistribution: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Record investment
   * @param {Object} investmentData - Investment data
   * @returns {Object} Created investment with transaction
   */
  async recordInvestment(investmentData) {
    const {
      tenantId,
      investorId,
      date,
      amount,
      description
    } = investmentData;

    const investor = await prisma.investor.findFirst({
      where: {
        id: investorId,
        tenantId
      }
    });

    if (!investor) {
      throw new Error('Investor not found');
    }

    // Generate investment number
    const investmentCount = await prisma.investment.count({
      where: { tenantId }
    });
    const investmentNumber = `INV-${new Date().getFullYear()}-${String(investmentCount + 1).padStart(4, '0')}`;

    return await prisma.$transaction(async (tx) => {
      // Create investment
      const investment = await tx.investment.create({
        data: {
          investmentNumber,
          date: new Date(date),
          amount,
          description,
          tenantId,
          investorId
        }
      });

      // Get or create investor capital account
      const investorCapitalAccount = await accountingService.getOrCreateAccount({
        code: `300${investor.id.slice(-1)}`, // Simple code generation
        name: `Investor Capital - ${investor.name}`,
        type: 'EQUITY',
        tenantId,
        balance: 0
      });

      // Get cash/bank account
      const cashAccount = await accountingService.getAccountByCode('1000', tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '1000',
          name: 'Cash',
          type: 'ASSET',
          tenantId,
          balance: 0
        });

      // Create accounting transaction
      const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      const transaction = await accountingService.createTransaction(
        {
          transactionNumber,
          date: new Date(date),
          description: `Investment: ${investmentNumber} - ${description || investor.name}`,
          tenantId
        },
        [
          {
            accountId: cashAccount.id,
            debitAmount: amount,
            creditAmount: 0
          },
          {
            accountId: investorCapitalAccount.id,
            debitAmount: 0,
            creditAmount: amount
          }
        ]
      );

      // Link transaction to investment
      await tx.investment.update({
        where: { id: investment.id },
        data: { transactionId: transaction.id }
      });

      // Update investor
      await tx.investor.update({
        where: { id: investorId },
        data: {
          totalInvestedAmount: investor.totalInvestedAmount + amount,
          currentBalance: investor.currentBalance + amount
        }
      });

      // Update tenant total invested capital
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId }
      });
      
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          totalInvestedCapital: (tenant.totalInvestedCapital || 0) + amount
        }
      });

      return {
        ...investment,
        transaction
      };
    });
  }

  /**
   * Get investment by ID
   * @param {string} investmentId - Investment ID
   * @param {string} tenantId - Tenant ID
   * @returns {Object} Investment
   */
  async getInvestmentById(investmentId, tenantId) {
    return await prisma.investment.findFirst({
      where: {
        id: investmentId,
        tenantId
      },
      include: {
        investor: true,
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
  }

  /**
   * Get investments
   * @param {Object} filters - Filter options
   * @returns {Object} Investments with pagination
   */
  async getInvestments(filters = {}) {
    const {
      tenantId,
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'desc',
      investorId,
      fromDate,
      toDate
    } = filters;

    const skip = (page - 1) * limit;

    const where = {
      tenantId
    };

    if (investorId) where.investorId = investorId;
    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) where.date.gte = new Date(fromDate);
      if (toDate) where.date.lte = new Date(toDate);
    }

    const [investments, total] = await Promise.all([
      prisma.investment.findMany({
        where,
        include: {
          investor: true
        },
        orderBy: {
          [sort]: order
        },
        skip,
        take: limit
      }),
      prisma.investment.count({ where })
    ]);

    return {
      data: investments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = new InvestorService();

