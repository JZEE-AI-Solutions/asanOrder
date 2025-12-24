const prisma = require('../lib/db');
const accountingService = require('../services/accountingService');

async function validateAccounting() {
  try {
    console.log('🔍 Validating Accounting Entries...\n');

    // Find the purchase invoice
    const purchaseInvoice = await prisma.purchaseInvoice.findFirst({
      where: {
        invoiceNumber: '1002-DEC-25-001'
      },
      include: {
        supplier: {
          include: {
            payments: {
              where: {
                type: 'SUPPLIER_PAYMENT'
              },
              orderBy: {
                date: 'asc'
              }
            }
          }
        },
        purchaseItems: true
      }
    });

    if (!purchaseInvoice) {
      console.log('❌ Purchase invoice 1002-DEC-25-001 not found');
      process.exit(1);
    }

    console.log('📋 Purchase Invoice Details:');
    console.log(`   Invoice Number: ${purchaseInvoice.invoiceNumber}`);
    console.log(`   Supplier: ${purchaseInvoice.supplierName || purchaseInvoice.supplier?.name || 'N/A'}`);
    console.log(`   Total Amount: Rs. ${purchaseInvoice.totalAmount}`);
    console.log(`   Payment Amount (at creation): Rs. ${purchaseInvoice.paymentAmount || 0}`);
    console.log(`   Payment Method: ${purchaseInvoice.paymentMethod || 'N/A'}`);
    console.log(`   Supplier ID: ${purchaseInvoice.supplierId || 'N/A'}`);

    // Get payments
    const payments = purchaseInvoice.supplier?.payments || [];
    console.log(`\n💳 Payments (${payments.length}):`);
    let totalPaid = 0;
    payments.forEach((payment, index) => {
      console.log(`   Payment ${index + 1}:`);
      console.log(`     Date: ${new Date(payment.date).toLocaleDateString()}`);
      console.log(`     Amount: Rs. ${payment.amount}`);
      console.log(`     Method: ${payment.paymentMethod}`);
      console.log(`     Payment #: ${payment.paymentNumber}`);
      totalPaid += payment.amount;
    });
    console.log(`   Total Paid: Rs. ${totalPaid}`);
    console.log(`   Remaining: Rs. ${purchaseInvoice.totalAmount - totalPaid}`);

    // Get all transactions related to this purchase
    // First get transaction for the purchase invoice
    const purchaseTransaction = await prisma.transaction.findFirst({
      where: {
        purchaseInvoiceId: purchaseInvoice.id
      },
      include: {
        transactionLines: {
          include: {
            account: true
          }
        }
      }
    });

    // Get payment transactions - need to find payments linked to this supplier
    const paymentIds = payments.map(p => p.id);
    const paymentTransactions = paymentIds.length > 0 ? await prisma.transaction.findMany({
      where: {
        payment: {
          id: {
            in: paymentIds
          }
        }
      },
      include: {
        transactionLines: {
          include: {
            account: true
          }
        },
        payment: {
          select: {
            id: true,
            paymentNumber: true,
            amount: true,
            paymentMethod: true
          }
        }
      },
      orderBy: {
        date: 'asc'
      }
    }) : [];

    // Combine all transactions
    const transactions = [];
    if (purchaseTransaction) {
      transactions.push(purchaseTransaction);
    }
    if (paymentTransactions.length > 0) {
      transactions.push(...paymentTransactions);
    }

    console.log(`\n📊 Accounting Transactions (${transactions.length}):`);
    transactions.forEach((txn, index) => {
      console.log(`\n   Transaction ${index + 1}:`);
      console.log(`     Number: ${txn.transactionNumber}`);
      console.log(`     Date: ${new Date(txn.date).toLocaleDateString()}`);
      console.log(`     Description: ${txn.description}`);
      console.log(`     Lines:`);
      txn.transactionLines.forEach(line => {
        const debit = line.debitAmount > 0 ? `Dr. Rs. ${line.debitAmount}` : '';
        const credit = line.creditAmount > 0 ? `Cr. Rs. ${line.creditAmount}` : '';
        console.log(`       ${line.account.code} - ${line.account.name}: ${debit} ${credit}`);
      });
    });

    // Get account balances
    const tenantId = purchaseInvoice.tenantId;
    const accounts = await prisma.account.findMany({
      where: {
        tenantId,
        code: {
          in: ['1000', '1100', '1300', '2000', '3001'] // Cash, Bank, Inventory, AP, Opening Balance
        }
      },
      orderBy: {
        code: 'asc'
      }
    });

    console.log(`\n💰 Account Balances:`);
    accounts.forEach(account => {
      console.log(`   ${account.code} - ${account.name}: Rs. ${account.balance.toLocaleString()}`);
    });

    // Validate balances
    console.log(`\n✅ Validation Summary:`);
    
    // Check if purchase transaction exists
    const purchaseTxn = transactions.find(t => t.purchaseInvoiceId === purchaseInvoice.id);
    if (purchaseTxn) {
      console.log(`   ✓ Purchase transaction found`);
      
      // Check Inventory debit
      const inventoryLine = purchaseTxn.transactionLines.find(l => l.account.code === '1300');
      if (inventoryLine && inventoryLine.debitAmount === purchaseInvoice.totalAmount) {
        console.log(`   ✓ Inventory debited correctly: Rs. ${inventoryLine.debitAmount}`);
      } else {
        console.log(`   ✗ Inventory debit issue`);
      }

      // Check AP credit (if unpaid portion exists)
      const unpaidAmount = purchaseInvoice.totalAmount - (purchaseInvoice.paymentAmount || 0);
      if (unpaidAmount > 0) {
        const apLine = purchaseTxn.transactionLines.find(l => l.account.code === '2000');
        if (apLine && apLine.creditAmount === unpaidAmount) {
          console.log(`   ✓ AP credited correctly for unpaid portion: Rs. ${apLine.creditAmount}`);
        } else {
          console.log(`   ✗ AP credit issue`);
        }
      }

      // Check Cash/Bank credit (if paid at creation)
      if (purchaseInvoice.paymentAmount > 0) {
        const paymentAccountCode = purchaseInvoice.paymentMethod === 'Cash' ? '1000' : '1100';
        const paymentLine = purchaseTxn.transactionLines.find(l => l.account.code === paymentAccountCode);
        if (paymentLine && paymentLine.creditAmount === purchaseInvoice.paymentAmount) {
          console.log(`   ✓ ${paymentAccountCode === '1000' ? 'Cash' : 'Bank'} credited correctly: Rs. ${paymentLine.creditAmount}`);
        } else {
          console.log(`   ✗ Payment account credit issue`);
        }
      }
    } else {
      console.log(`   ✗ Purchase transaction not found`);
    }

    // Check payment transactions
    if (payments.length > 0) {
      console.log(`   ✓ ${payments.length} payment(s) found`);
      
      payments.forEach((payment, index) => {
        const paymentTransaction = transactions.find(t => t.payment?.id === payment.id);
        if (paymentTransaction) {
          console.log(`   ✓ Payment ${index + 1} transaction found`);
          
          // Check AP debit
          const apDebitLine = paymentTransaction.transactionLines.find(l => 
            l.account.code === '2000' && l.debitAmount > 0
          );
          if (apDebitLine && apDebitLine.debitAmount === payment.amount) {
            console.log(`     ✓ AP debited correctly: Rs. ${apDebitLine.debitAmount}`);
          } else {
            console.log(`     ✗ AP debit issue for payment ${index + 1}`);
          }

          // Check Cash/Bank credit
          const paymentAccountCode = payment.paymentMethod === 'Cash' ? '1000' : '1100';
          const paymentCreditLine = paymentTransaction.transactionLines.find(l => 
            l.account.code === paymentAccountCode && l.creditAmount > 0
          );
          if (paymentCreditLine && paymentCreditLine.creditAmount === payment.amount) {
            console.log(`     ✓ ${paymentAccountCode === '1000' ? 'Cash' : 'Bank'} credited correctly: Rs. ${paymentCreditLine.creditAmount}`);
          } else {
            console.log(`     ✗ Payment account credit issue for payment ${index + 1}`);
          }
        } else {
          console.log(`   ✗ Payment ${index + 1} transaction not found`);
        }
      });
    }

    // Check account balance consistency
    console.log(`\n📈 Balance Consistency Check:`);
    const inventoryAccount = accounts.find(a => a.code === '1300');
    const apAccount = accounts.find(a => a.code === '2000');
    const cashAccount = accounts.find(a => a.code === '1000');
    const bankAccount = accounts.find(a => a.code === '1100');

    if (inventoryAccount) {
      console.log(`   Inventory (1300): Rs. ${inventoryAccount.balance.toLocaleString()}`);
    }
    if (apAccount) {
      console.log(`   Accounts Payable (2000): Rs. ${apAccount.balance.toLocaleString()}`);
      
      // Calculate expected AP: Total invoice - all payments (including initial payment)
      const initialPayment = purchaseInvoice.paymentAmount || 0;
      const allPayments = initialPayment + totalPaid;
      const expectedAP = purchaseInvoice.totalAmount - allPayments;
      
      console.log(`   Expected AP calculation:`);
      console.log(`     Invoice Total: Rs. ${purchaseInvoice.totalAmount}`);
      console.log(`     Initial Payment: Rs. ${initialPayment}`);
      console.log(`     Additional Payments: Rs. ${totalPaid}`);
      console.log(`     Total Paid: Rs. ${allPayments}`);
      console.log(`     Expected AP: Rs. ${expectedAP}`);
      
      if (Math.abs(apAccount.balance - expectedAP) < 0.01) {
        console.log(`   ✓ AP balance matches expected: Rs. ${expectedAP.toLocaleString()}`);
      } else {
        console.log(`   ✗ AP balance mismatch. Expected: Rs. ${expectedAP.toLocaleString()}, Actual: Rs. ${apAccount.balance.toLocaleString()}`);
        console.log(`   ⚠️  Difference: Rs. ${(apAccount.balance - expectedAP).toLocaleString()}`);
      }
    }
    if (cashAccount) {
      console.log(`   Cash (1000): Rs. ${cashAccount.balance.toLocaleString()}`);
    }
    if (bankAccount) {
      console.log(`   Bank (1100): Rs. ${bankAccount.balance.toLocaleString()}`);
    }

    console.log(`\n✅ Validation complete!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

validateAccounting();

