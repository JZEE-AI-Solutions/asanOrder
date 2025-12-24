const prisma = require('../lib/db');

class AccountingService {
  /**
   * Create a double-entry transaction
   * @param {Object} transactionData - Transaction data
   * @param {Array} transactionLines - Array of {accountId, debitAmount, creditAmount}
   * @returns {Object} Created transaction
   */
  async createTransaction(transactionData, transactionLines) {
    // Validate that debits equal credits
    const totalDebits = transactionLines.reduce((sum, line) => sum + (line.debitAmount || 0), 0);
    const totalCredits = transactionLines.reduce((sum, line) => sum + (line.creditAmount || 0), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new Error(`Transaction is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
    }

    return await prisma.$transaction(async (tx) => {
      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          ...transactionData,
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
          // Calculate balance change based on account type
          // For ASSET and EXPENSE: Debit increases, Credit decreases
          // For LIABILITY, EQUITY, INCOME: Credit increases, Debit decreases
          const isDebitIncrease = account.type === 'ASSET' || account.type === 'EXPENSE';
          let balanceChange;
          
          if (isDebitIncrease) {
            // Asset/Expense: Debit increases, Credit decreases
            balanceChange = (line.debitAmount || 0) - (line.creditAmount || 0);
          } else {
            // Liability/Equity/Income: Credit increases, Debit decreases
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

      return transaction;
    });
  }

  /**
   * Get account by code and tenant
   * @param {string} code - Account code
   * @param {string} tenantId - Tenant ID
   * @returns {Object} Account
   */
  async getAccountByCode(code, tenantId) {
    return await prisma.account.findUnique({
      where: {
        code_tenantId: {
          code,
          tenantId
        }
      }
    });
  }

  /**
   * Get or create account
   * @param {Object} accountData - Account data
   * @returns {Object} Account
   */
  async getOrCreateAccount(accountData) {
    const { code, tenantId } = accountData;
    
    let account = await this.getAccountByCode(code, tenantId);
    
    if (!account) {
      account = await prisma.account.create({
        data: accountData
      });
    }
    
    return account;
  }

  /**
   * Initialize default chart of accounts for a tenant
   * @param {string} tenantId - Tenant ID
   * @returns {Array} Created accounts
   */
  /**
   * Get payment accounts (Cash or Bank) for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {string} subType - Optional: 'CASH', 'BANK', or null for all
   * @returns {Array} Payment accounts
   */
  async getPaymentAccounts(tenantId, subType = null) {
    const where = {
      tenantId,
      type: 'ASSET',
      accountSubType: subType ? subType : { not: null }
    };

    return await prisma.account.findMany({
      where,
      orderBy: [
        { accountSubType: 'asc' },
        { name: 'asc' }
      ]
    });
  }

  async initializeChartOfAccounts(tenantId) {
    const defaultAccounts = [
      // Assets
      { code: '1000', name: 'Cash', type: 'ASSET', accountSubType: 'CASH', balance: 0 },
      { code: '1100', name: 'Bank Account', type: 'ASSET', accountSubType: 'BANK', balance: 0 },
      { code: '1200', name: 'Accounts Receivable', type: 'ASSET', balance: 0 },
      { code: '1210', name: 'Customer Advance Balance', type: 'ASSET', balance: 0 },
      { code: '1230', name: 'Advance to Suppliers', type: 'ASSET', balance: 0 },
      { code: '1220', name: 'Supplier Advance Balance', type: 'LIABILITY', balance: 0 },
      { code: '1300', name: 'Inventory', type: 'ASSET', balance: 0 },
      
      // Liabilities
      { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', balance: 0 },
      { code: '2100', name: 'Accrued Expenses', type: 'LIABILITY', balance: 0 },
      { code: '2200', name: 'COD Fee Payable', type: 'LIABILITY', balance: 0 },
      
      // Income
      { code: '4000', name: 'Sales Revenue', type: 'INCOME', balance: 0 },
      { code: '4100', name: 'Sales Returns', type: 'INCOME', balance: 0 },
      { code: '4200', name: 'Shipping Revenue', type: 'INCOME', balance: 0 },
      { code: '4300', name: 'Shipping Variance Income', type: 'INCOME', balance: 0 },
      { code: '4400', name: 'Other Income', type: 'INCOME', balance: 0 },
      
      // Expenses
      { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE', balance: 0 },
      { code: '5100', name: 'Shipping Expense', type: 'EXPENSE', balance: 0 },
      { code: '5110', name: 'Shipping Variance Expense', type: 'EXPENSE', balance: 0 },
      { code: '5200', name: 'COD Fee Expense', type: 'EXPENSE', balance: 0 },
      { code: '5300', name: 'Petrol Expense', type: 'EXPENSE', balance: 0 },
      { code: '5400', name: 'Utility Expense', type: 'EXPENSE', balance: 0 },
      { code: '5500', name: 'Internet Expense', type: 'EXPENSE', balance: 0 },
      { code: '5600', name: 'Phone Expense', type: 'EXPENSE', balance: 0 },
      { code: '5700', name: 'Rent Expense', type: 'EXPENSE', balance: 0 },
      { code: '5800', name: 'Other Expenses', type: 'EXPENSE', balance: 0 },
      
      // Equity
      { code: '3000', name: 'Owner Capital', type: 'EQUITY', balance: 0 },
      { code: '3001', name: 'Opening Balance', type: 'EQUITY', balance: 0 },
      { code: '3100', name: 'Owner Drawings', type: 'EQUITY', balance: 0 },
      { code: '3200', name: 'Retained Earnings', type: 'EQUITY', balance: 0 }
    ];

    const createdAccounts = [];

    for (const accountData of defaultAccounts) {
      const account = await this.getOrCreateAccount({
        ...accountData,
        tenantId
      });
      createdAccounts.push(account);
    }

    return createdAccounts;
  }

  /**
   * Get transactions with filters
   * @param {Object} filters - Filter options
   * @returns {Array} Transactions
   */
  async getTransactions(filters = {}) {
    const {
      tenantId,
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'desc',
      fromDate,
      toDate,
      orderId,
      accountId
    } = filters;

    const skip = (page - 1) * limit;

    const where = {
      tenantId
    };

    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) where.date.gte = new Date(fromDate);
      if (toDate) where.date.lte = new Date(toDate);
    }

    if (orderId) where.orderId = orderId;
    if (accountId) {
      where.transactionLines = {
        some: {
          accountId
        }
      };
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          transactionLines: {
            include: {
              account: true
            }
          }
        },
        orderBy: {
          [sort]: order
        },
        skip,
        take: limit
      }),
      prisma.transaction.count({ where })
    ]);

    return {
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = new AccountingService();

