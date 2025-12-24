const prisma = require('../lib/db');
const accountingService = require('./accountingService');

class WithdrawalService {
  /**
   * Create withdrawal
   * @param {Object} withdrawalData - Withdrawal data
   * @returns {Object} Created withdrawal with transaction
   */
  async createWithdrawal(withdrawalData) {
    const {
      tenantId,
      date,
      amount,
      type, // INVESTOR_PROFIT, OWNER_PERSONAL, INVESTOR_CAPITAL
      paymentAccountId,
      description,
      investorId,
      profitDistributionId
    } = withdrawalData;

    // Generate withdrawal number
    const withdrawalCount = await prisma.withdrawal.count({
      where: { tenantId }
    });
    const withdrawalNumber = `WD-${new Date().getFullYear()}-${String(withdrawalCount + 1).padStart(4, '0')}`;

    return await prisma.$transaction(async (tx) => {
      let transactionLines = [];
      let accountToDebit = null;
      let accountToCredit = null;

      // Get payment account (cash/bank)
      let paymentAccount = null;
      if (paymentAccountId) {
        paymentAccount = await prisma.account.findFirst({
          where: {
            id: paymentAccountId,
            tenantId,
            type: 'ASSET',
            accountSubType: { in: ['CASH', 'BANK'] }
          }
        });

        if (!paymentAccount) {
          throw new Error('Invalid payment account. Account must be a Cash or Bank account.');
        }
      } else {
        // Fallback to default Cash account if not provided
        paymentAccount = await accountingService.getAccountByCode('1000', tenantId) ||
          await accountingService.getOrCreateAccount({
            code: '1000',
            name: 'Cash',
            type: 'ASSET',
            accountSubType: 'CASH',
            tenantId,
            balance: 0
          });
      }

      accountToCredit = paymentAccount;

      if (type === 'INVESTOR_PROFIT') {
        if (!investorId) {
          throw new Error('Investor ID required for profit withdrawal');
        }

        const investor = await tx.investor.findFirst({
          where: {
            id: investorId,
            tenantId
          }
        });

        if (!investor) {
          throw new Error('Investor not found');
        }

        // Get profit payable account
        const accountCode = `220${investor.id.slice(-1)}`;
        accountToDebit = await accountingService.getAccountByCode(accountCode, tenantId);
        
        if (!accountToDebit) {
          throw new Error('Profit payable account not found for investor');
        }

        // Check available balance
        if (accountToDebit.balance < amount) {
          throw new Error(`Insufficient profit balance. Available: ${accountToDebit.balance}, Requested: ${amount}`);
        }

        transactionLines = [
          {
            accountId: accountToDebit.id,
            debitAmount: amount,
            creditAmount: 0
          },
          {
            accountId: accountToCredit.id,
            debitAmount: 0,
            creditAmount: amount
          }
        ];

        // Update investor
        await tx.investor.update({
          where: { id: investorId },
          data: {
            totalProfitReceived: investor.totalProfitReceived + amount
          }
        });

      } else if (type === 'OWNER_PERSONAL') {
        // Get owner drawings account
        accountToDebit = await accountingService.getAccountByCode('3100', tenantId) ||
          await accountingService.getOrCreateAccount({
            code: '3100',
            name: 'Owner Drawings',
            type: 'EQUITY',
            tenantId,
            balance: 0
          });

        transactionLines = [
          {
            accountId: accountToDebit.id,
            debitAmount: amount,
            creditAmount: 0
          },
          {
            accountId: accountToCredit.id,
            debitAmount: 0,
            creditAmount: amount
          }
        ];

        // Update tenant
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId }
        });
        
        await tx.tenant.update({
          where: { id: tenantId },
          data: {
            ownerWithdrawals: (tenant.ownerWithdrawals || 0) + amount
          }
        });

      } else if (type === 'INVESTOR_CAPITAL') {
        if (!investorId) {
          throw new Error('Investor ID required for capital withdrawal');
        }

        const investor = await tx.investor.findFirst({
          where: {
            id: investorId,
            tenantId
          }
        });

        if (!investor) {
          throw new Error('Investor not found');
        }

        // Check available balance
        if (investor.currentBalance < amount) {
          throw new Error(`Insufficient capital balance. Available: ${investor.currentBalance}, Requested: ${amount}`);
        }

        // Get investor capital account
        const accountCode = `300${investor.id.slice(-1)}`;
        accountToDebit = await accountingService.getAccountByCode(accountCode, tenantId);
        
        if (!accountToDebit) {
          throw new Error('Investor capital account not found');
        }

        transactionLines = [
          {
            accountId: accountToDebit.id,
            debitAmount: amount,
            creditAmount: 0
          },
          {
            accountId: accountToCredit.id,
            debitAmount: 0,
            creditAmount: amount
          }
        ];

        // Update investor
        await tx.investor.update({
          where: { id: investorId },
          data: {
            currentBalance: investor.currentBalance - amount
          }
        });
      } else {
        throw new Error(`Invalid withdrawal type: ${type}`);
      }

      // Create accounting transaction
      const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      const transaction = await accountingService.createTransaction(
        {
          transactionNumber,
          date: new Date(date),
          description: `Withdrawal: ${withdrawalNumber} - ${description || type}`,
          tenantId
        },
        transactionLines
      );

      // Create withdrawal
      const withdrawal = await tx.withdrawal.create({
        data: {
          withdrawalNumber,
          date: new Date(date),
          amount,
          type,
          withdrawalMethod,
          description,
          tenantId,
          investorId,
          profitDistributionId,
          transactionId: transaction.id
        }
      });

      return {
        ...withdrawal,
        transaction
      };
    });
  }

  /**
   * Get withdrawals with filters
   * @param {Object} filters - Filter options
   * @returns {Object} Withdrawals with pagination
   */
  async getWithdrawals(filters = {}) {
    const {
      tenantId,
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'desc',
      type,
      investorId,
      fromDate,
      toDate
    } = filters;

    const skip = (page - 1) * limit;

    const where = {
      tenantId
    };

    if (type) where.type = type;
    if (investorId) where.investorId = investorId;
    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) where.date.gte = new Date(fromDate);
      if (toDate) where.date.lte = new Date(toDate);
    }

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        include: {
          investor: true,
          profitDistribution: true,
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
      prisma.withdrawal.count({ where })
    ]);

    return {
      data: withdrawals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = new WithdrawalService();

