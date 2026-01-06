const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkSupplierBalance() {
  try {
    const invoiceNumber = '1003-JAN-26-002'
    const returnNumbers = ['1003-JAN-26-004', '1003-JAN-26-005']
    
    console.log(`\n🔍 Checking Supplier Balance for Invoice: ${invoiceNumber}\n`)
    console.log('='.repeat(80))
    
    // Find the purchase invoice
    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { invoiceNumber },
      include: {
        purchaseItems: true,
        returns: {
          where: {
            returnType: 'SUPPLIER',
            status: { not: 'REJECTED' }
          },
          include: {
            returnItems: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        supplier: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })
    
    if (!invoice) {
      console.log(`❌ Invoice not found!`)
      return
    }
    
    console.log(`\n📄 Purchase Invoice: ${invoice.invoiceNumber}`)
    console.log(`   Invoice Date: ${invoice.invoiceDate}`)
    console.log(`   Total Amount: Rs. ${invoice.totalAmount.toLocaleString()}`)
    console.log(`   Supplier: ${invoice.supplierName || invoice.supplier?.name || 'N/A'}`)
    
    // Calculate purchase total
    const purchaseTotal = invoice.purchaseItems.reduce((sum, item) => {
      return sum + (item.purchasePrice * item.quantity)
    }, 0)
    console.log(`   Purchase Total (sum of items): Rs. ${purchaseTotal.toLocaleString()}`)
    
    // Check returns
    console.log(`\n📦 Returns for this Invoice:`)
    console.log(`   Total Returns: ${invoice.returns.length}`)
    
    let totalReturned = 0
    invoice.returns.forEach((ret, index) => {
      const returnTotal = ret.returnItems.reduce((sum, item) => {
        return sum + (item.purchasePrice * item.quantity)
      }, 0)
      totalReturned += returnTotal
      
      console.log(`\n   ${index + 1}. ${ret.returnNumber}`)
      console.log(`      Status: ${ret.status}`)
      console.log(`      Return Date: ${ret.returnDate}`)
      console.log(`      Total Amount: Rs. ${returnTotal.toLocaleString()}`)
      console.log(`      Items:`)
      ret.returnItems.forEach(item => {
        console.log(`         - ${item.productName}: ${item.quantity} units @ Rs. ${item.purchasePrice}`)
      })
    })
    
    console.log(`\n   Total Returned Amount: Rs. ${totalReturned.toLocaleString()}`)
    
    // Expected supplier balance
    const expectedBalance = purchaseTotal - totalReturned
    console.log(`\n💰 Expected Supplier Balance Calculation:`)
    console.log(`   Purchase Total: Rs. ${purchaseTotal.toLocaleString()}`)
    console.log(`   Total Returns: Rs. ${totalReturned.toLocaleString()}`)
    console.log(`   Expected Balance: Rs. ${expectedBalance.toLocaleString()}`)
    
    // Get all transactions for this invoice
    const allTransactions = await prisma.transaction.findMany({
      where: {
        purchaseInvoiceId: invoice.id
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
    
    console.log(`\n📊 All Accounting Transactions for Invoice:`)
    console.log(`   Total Transactions: ${allTransactions.length}`)
    
    // Calculate AP balance from transactions
    const apAccount = await prisma.account.findFirst({
      where: {
        code: '2000',
        tenantId: invoice.tenantId
      }
    })
    
    if (apAccount) {
      console.log(`\n💳 Accounts Payable (2000) Account:`)
      console.log(`   Current Balance in DB: Rs. ${apAccount.balance.toLocaleString()}`)
      
      // Get all AP transaction lines
      const apLines = await prisma.transactionLine.findMany({
        where: {
          accountId: apAccount.id
        },
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
      })
      
      // Calculate balance from all transactions
      let calculatedBalance = 0
      const invoiceRelatedLines = []
      
      apLines.forEach(line => {
        // For LIABILITY: Credit increases, Debit decreases
        const change = (line.creditAmount || 0) - (line.debitAmount || 0)
        calculatedBalance += change
        
        // Check if this transaction is related to our invoice
        if (line.transaction.purchaseInvoiceId === invoice.id) {
          invoiceRelatedLines.push({
            transaction: line.transaction,
            change: change,
            debit: line.debitAmount,
            credit: line.creditAmount
          })
        }
      })
      
      console.log(`   Calculated Balance (from all transactions): Rs. ${calculatedBalance.toLocaleString()}`)
      
      if (Math.abs(apAccount.balance - calculatedBalance) < 0.01) {
        console.log(`   ✅ Balance matches calculated value`)
      } else {
        console.log(`   ⚠️ Balance mismatch! Difference: Rs. ${(apAccount.balance - calculatedBalance).toLocaleString()}`)
      }
      
      console.log(`\n   Transactions Related to Invoice ${invoice.invoiceNumber}:`)
      let invoiceAPBalance = 0
      invoiceRelatedLines.forEach((lineInfo, index) => {
        const isReturn = lineInfo.transaction.orderReturnId !== null
        const type = isReturn ? 'RETURN' : 'PURCHASE'
        console.log(`\n   ${index + 1}. ${lineInfo.transaction.transactionNumber} (${type})`)
        console.log(`      Date: ${lineInfo.transaction.date}`)
        console.log(`      Description: ${lineInfo.transaction.description}`)
        if (lineInfo.debit > 0) {
          console.log(`      Debit: Rs. ${lineInfo.debit.toLocaleString()} (decreases AP)`)
          invoiceAPBalance -= lineInfo.debit
        }
        if (lineInfo.credit > 0) {
          console.log(`      Credit: Rs. ${lineInfo.credit.toLocaleString()} (increases AP)`)
          invoiceAPBalance += lineInfo.credit
        }
        console.log(`      Net Change: ${lineInfo.change > 0 ? '+' : ''}Rs. ${lineInfo.change.toLocaleString()}`)
      })
      
      console.log(`\n   Net AP Balance for this Invoice: Rs. ${invoiceAPBalance.toLocaleString()}`)
      console.log(`   Expected Balance: Rs. ${expectedBalance.toLocaleString()}`)
      
      if (Math.abs(invoiceAPBalance - expectedBalance) < 0.01) {
        console.log(`   ✅ Invoice AP balance matches expected value!`)
      } else {
        console.log(`   ❌ Invoice AP balance does NOT match expected value!`)
        console.log(`      Difference: Rs. ${(invoiceAPBalance - expectedBalance).toLocaleString()}`)
      }
    }
    
    // Check payments
    const payments = await prisma.payment.findMany({
      where: {
        purchaseInvoiceId: invoice.id,
        type: 'SUPPLIER_PAYMENT'
      },
      orderBy: {
        date: 'desc'
      }
    })
    
    if (payments.length > 0) {
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
      console.log(`\n💵 Payments Made:`)
      console.log(`   Total Payments: ${payments.length}`)
      payments.forEach((payment, index) => {
        console.log(`   ${index + 1}. ${payment.paymentNumber}: Rs. ${payment.amount.toLocaleString()} on ${payment.date}`)
      })
      console.log(`   Total Paid: Rs. ${totalPaid.toLocaleString()}`)
      
      const finalBalance = expectedBalance - totalPaid
      console.log(`\n   Final Expected Balance: Rs. ${finalBalance.toLocaleString()}`)
      console.log(`   (Purchase - Returns - Payments)`)
    } else {
      console.log(`\n💵 No payments recorded for this invoice`)
    }
    
    // Check specific returns
    console.log(`\n🔍 Checking Specific Returns:`)
    for (const returnNum of returnNumbers) {
      const ret = await prisma.return.findFirst({
        where: { returnNumber: returnNum },
        include: {
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
      })
      
      if (ret) {
        const retTotal = ret.returnItems.reduce((sum, item) => sum + (item.purchasePrice * item.quantity), 0)
        console.log(`\n   ${returnNum}:`)
        console.log(`      Status: ${ret.status}`)
        console.log(`      Amount: Rs. ${retTotal.toLocaleString()}`)
        console.log(`      Has Transaction: ${ret.transactions.length > 0 ? 'Yes' : 'No'}`)
        if (ret.transactions.length > 0) {
          const txn = ret.transactions[0]
          const apLine = txn.transactionLines.find(l => l.account.code === '2000')
          if (apLine) {
            console.log(`      AP Entry: ${apLine.debitAmount > 0 ? 'Debit' : 'Credit'} Rs. ${(apLine.debitAmount || apLine.creditAmount).toLocaleString()}`)
          }
        }
      } else {
        console.log(`\n   ${returnNum}: ❌ Not found`)
      }
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ Check completed!\n')
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

checkSupplierBalance()

