const prisma = require('../lib/db');
const accountingService = require('./accountingService');

class ExpenseService {
  /**
   * Create expense entry
   * @param {Object} expenseData - Expense data
   * @returns {Object} Created expense
   */
  async createExpense(expenseData) {
    const {
      tenantId,
      date,
      category,
      amount,
      description,
      accountId,
      paymentAccountId,
      receipt,
      receiptData,
      receiptType
    } = expenseData;

    // Generate expense number
    const expenseCount = await prisma.expense.count({
      where: { tenantId }
    });
    const expenseNumber = `EXP-${new Date().getFullYear()}-${String(expenseCount + 1).padStart(4, '0')}`;

    // Get or create expense account
    let expenseAccount = accountId ? 
      await prisma.account.findUnique({ where: { id: accountId } }) :
      null;

    if (!expenseAccount) {
      // Map category to account code
      const accountMap = {
        'PETROL': '5300',
        'UTILITY': '5400',
        'OTHER': '5800'
      };
      const accountCode = accountMap[category] || '5800';
      expenseAccount = await accountingService.getAccountByCode(accountCode, tenantId);
      
      if (!expenseAccount) {
        // Create account if doesn't exist
        expenseAccount = await accountingService.getOrCreateAccount({
          code: accountCode,
          name: `${category} Expense`,
          type: 'EXPENSE',
          tenantId,
          balance: 0
        });
      }
    }

    return await prisma.$transaction(async (tx) => {
      // Create expense
      const expense = await tx.expense.create({
        data: {
          expenseNumber,
          date: new Date(date),
          category,
          amount,
          description,
          receipt,
          receiptData,
          receiptType,
          tenantId,
          accountId: expenseAccount.id
        }
      });

      // Create accounting transaction
      const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      
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

      const transaction = await accountingService.createTransaction(
        {
          transactionNumber,
          date: new Date(date),
          description: `Expense: ${description || category}`,
          tenantId
        },
        [
          {
            accountId: expenseAccount.id,
            debitAmount: amount,
            creditAmount: 0
          },
          {
            accountId: paymentAccount.id,
            debitAmount: 0,
            creditAmount: amount
          }
        ]
      );

      // Link transaction to expense
      await tx.expense.update({
        where: { id: expense.id },
        data: { transactionId: transaction.id }
      });

      return {
        ...expense,
        transaction
      };
    });
  }

  /**
   * Get expenses with filters
   * @param {Object} filters - Filter options
   * @returns {Object} Expenses with pagination
   */
  async getExpenses(filters = {}) {
    const {
      tenantId,
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'desc',
      category,
      fromDate,
      toDate
    } = filters;

    const skip = (page - 1) * limit;

    const where = {
      tenantId
    };

    if (category) where.category = category;
    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) where.date.gte = new Date(fromDate);
      if (toDate) where.date.lte = new Date(toDate);
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          account: true
        },
        orderBy: {
          [sort]: order
        },
        skip,
        take: limit
      }),
      prisma.expense.count({ where })
    ]);

    return {
      data: expenses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get expense by ID
   * @param {string} expenseId - Expense ID
   * @param {string} tenantId - Tenant ID
   * @returns {Object} Expense
   */
  async getExpenseById(expenseId, tenantId) {
    return await prisma.expense.findFirst({
      where: {
        id: expenseId,
        tenantId
      },
      include: {
        account: true,
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
}

module.exports = new ExpenseService();

