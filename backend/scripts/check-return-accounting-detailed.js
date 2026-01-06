const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkReturnAccountingDetailed() {
  try {
    const returnNumber = '1003-JAN-26-005'
    
    console.log(`\n🔍 Detailed Check for Return: ${returnNumber}\n`)
    console.log('='.repeat(80))
    
    // Find the return record
    const returnRecord = await prisma.return.findFirst({
      where: { returnNumber: returnNumber },
      include: {
        returnItems: true,
        purchaseInvoice: {
          include: {
            purchaseItems: true
          }
        }
      }
    })
    
    if (!returnRecord) {
      console.log(`❌ Return not found!`)
      return
    }
    
    const invoiceId = returnRecord.purchaseInvoiceId
    
    // Get all transactions for this invoice
    const allTransactions = await prisma.transaction.findMany({
      where: {
        purchaseInvoiceId: invoiceId
      },
      include: {
        transactionLines: {
          include: {
            account: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    })
    
    console.log(`\n📄 Purchase Invoice: ${returnRecord.purchaseInvoice.invoiceNumber}`)
    console.log(`   Total Amount: Rs. ${returnRecord.purchaseInvoice.totalAmount.toLocaleString()}`)
    
    console.log(`\n📊 All Transactions for Invoice ${returnRecord.purchaseInvoice.invoiceNumber}:`)
    allTransactions.forEach((txn, index) => {
      console.log(`\n   ${index + 1}. ${txn.transactionNumber}`)
      console.log(`      Date: ${txn.date}`)
      console.log(`      Description: ${txn.description}`)
      console.log(`      Return ID: ${txn.orderReturnId || 'N/A'}`)
      
      const debits = txn.transactionLines.filter(l => l.debitAmount > 0)
      const credits = txn.transactionLines.filter(l => l.creditAmount > 0)
      
      console.log(`      Debits:`)
      debits.forEach(l => {
        console.log(`         - ${l.account.name} (${l.account.code}): Rs. ${l.debitAmount.toLocaleString()}`)
      })
      console.log(`      Credits:`)
      credits.forEach(l => {
        console.log(`         - ${l.account.name} (${l.account.code}): Rs. ${l.creditAmount.toLocaleString()}`)
      })
    })
    
    // Check AP account balance and all transactions affecting it
    const apAccount = await prisma.account.findFirst({
      where: {
        code: '2000',
        tenantId: returnRecord.tenantId
      },
      include: {
        transactionLines: {
          include: {
            transaction: {
              select: {
                id: true,
                transactionNumber: true,
                date: true,
                description: true,
                purchaseInvoiceId: true,
                orderReturnId: true
              }
            }
          },
          orderBy: {
            transaction: {
              date: 'desc'
            }
          }
        }
      }
    })
    
    if (apAccount) {
      console.log(`\n💳 Accounts Payable (2000) - Detailed Analysis:`)
      console.log(`   Current Balance: Rs. ${apAccount.balance.toLocaleString()}`)
      console.log(`   Total Transaction Lines: ${apAccount.transactionLines.length}`)
      
      // Calculate balance from transactions
      let calculatedBalance = 0
      apAccount.transactionLines.forEach(line => {
        // For LIABILITY: Credit increases, Debit decreases
        const change = (line.creditAmount || 0) - (line.debitAmount || 0)
        calculatedBalance += change
      })
      
      console.log(`   Calculated Balance from Transactions: Rs. ${calculatedBalance.toLocaleString()}`)
      
      if (Math.abs(apAccount.balance - calculatedBalance) < 0.01) {
        console.log(`   ✅ Balance matches calculated value`)
      } else {
        console.log(`   ⚠️ Balance mismatch! Difference: Rs. ${(apAccount.balance - calculatedBalance).toLocaleString()}`)
      }
      
      // Show recent transactions affecting AP
      console.log(`\n   Recent Transactions Affecting AP (last 10):`)
      const recentLines = apAccount.transactionLines.slice(0, 10)
      recentLines.forEach((line, index) => {
        const change = (line.creditAmount || 0) - (line.debitAmount || 0)
        const sign = change > 0 ? '+' : ''
        console.log(`   ${index + 1}. ${line.transaction.transactionNumber}`)
        console.log(`      Date: ${line.transaction.date}`)
        console.log(`      Description: ${line.transaction.description}`)
        if (line.debitAmount > 0) {
          console.log(`      Debit: Rs. ${line.debitAmount.toLocaleString()} (decreases AP)`)
        }
        if (line.creditAmount > 0) {
          console.log(`      Credit: Rs. ${line.creditAmount.toLocaleString()} (increases AP)`)
        }
        console.log(`      Net Change: ${sign}Rs. ${change.toLocaleString()}`)
        if (line.transaction.orderReturnId === returnRecord.id) {
          console.log(`      ✅ This is the return transaction we're checking`)
        }
      })
    }
    
    // Check Inventory account
    const inventoryAccount = await prisma.account.findFirst({
      where: {
        code: '1300',
        tenantId: returnRecord.tenantId
      }
    })
    
    if (inventoryAccount) {
      console.log(`\n📦 Inventory (1300):`)
      console.log(`   Current Balance: Rs. ${inventoryAccount.balance.toLocaleString()}`)
    }
    
    // Verify the return transaction specifically
    const returnTransaction = await prisma.transaction.findFirst({
      where: {
        orderReturnId: returnRecord.id
      },
      include: {
        transactionLines: {
          include: {
            account: true
          }
        }
      }
    })
    
    if (returnTransaction) {
      console.log(`\n✅ Return Transaction Verification:`)
      console.log(`   Transaction #: ${returnTransaction.transactionNumber}`)
      console.log(`   Date: ${returnTransaction.date}`)
      
      const totalDebits = returnTransaction.transactionLines.reduce((sum, l) => sum + (l.debitAmount || 0), 0)
      const totalCredits = returnTransaction.transactionLines.reduce((sum, l) => sum + (l.creditAmount || 0), 0)
      
      console.log(`   Total Debits: Rs. ${totalDebits.toLocaleString()}`)
      console.log(`   Total Credits: Rs. ${totalCredits.toLocaleString()}`)
      
      if (Math.abs(totalDebits - totalCredits) < 0.01) {
        console.log(`   ✅ Transaction is balanced`)
      } else {
        console.log(`   ❌ Transaction is NOT balanced!`)
      }
      
      // Check if AP was properly debited
      const apLine = returnTransaction.transactionLines.find(l => l.account.code === '2000')
      if (apLine && apLine.debitAmount > 0) {
        console.log(`   ✅ AP was debited by Rs. ${apLine.debitAmount.toLocaleString()}`)
        console.log(`   ✅ This correctly reduces the supplier balance (what we owe)`)
      } else {
        console.log(`   ❌ AP was not debited or was credited instead!`)
      }
      
      // Check if Inventory was properly credited
      const invLine = returnTransaction.transactionLines.find(l => l.account.code === '1300')
      if (invLine && invLine.creditAmount > 0) {
        console.log(`   ✅ Inventory was credited by Rs. ${invLine.creditAmount.toLocaleString()}`)
        console.log(`   ✅ This correctly decreases inventory (we returned goods)`)
      } else {
        console.log(`   ❌ Inventory was not credited or was debited instead!`)
      }
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ Detailed check completed!\n')
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

checkReturnAccountingDetailed()

