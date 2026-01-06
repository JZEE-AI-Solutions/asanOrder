const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkReturnAccounting() {
  try {
    const returnNumber = '1003-JAN-26-005'
    
    console.log(`\n🔍 Checking Return: ${returnNumber}\n`)
    console.log('='.repeat(80))
    
    // 1. Find the return record
    const returnRecord = await prisma.return.findFirst({
      where: {
        returnNumber: returnNumber
      },
      include: {
        returnItems: true,
        purchaseInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            supplierName: true,
            supplierId: true
          }
        },
        tenant: {
          select: {
            id: true,
            businessName: true
          }
        }
      }
    })
    
    if (!returnRecord) {
      console.log(`❌ Return ${returnNumber} not found!`)
      return
    }
    
    console.log('\n📋 Return Record:')
    console.log(`   ID: ${returnRecord.id}`)
    console.log(`   Return Number: ${returnRecord.returnNumber}`)
    console.log(`   Status: ${returnRecord.status}`)
    console.log(`   Return Date: ${returnRecord.returnDate}`)
    console.log(`   Total Amount: Rs. ${returnRecord.totalAmount}`)
    console.log(`   Return Type: ${returnRecord.returnType}`)
    console.log(`   Purchase Invoice: ${returnRecord.purchaseInvoice?.invoiceNumber || 'N/A'}`)
    console.log(`   Tenant: ${returnRecord.tenant.businessName}`)
    
    console.log('\n📦 Return Items:')
    returnRecord.returnItems.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.productName}`)
      console.log(`      Quantity: ${item.quantity}`)
      console.log(`      Price: Rs. ${item.purchasePrice}`)
      console.log(`      Total: Rs. ${item.quantity * item.purchasePrice}`)
      if (item.reason) {
        console.log(`      Reason: ${item.reason}`)
      }
    })
    
    // 2. Find the accounting transaction
    const transaction = await prisma.transaction.findFirst({
      where: {
        orderReturnId: returnRecord.id
      },
      include: {
        transactionLines: {
          include: {
            account: true
          },
          orderBy: [
            { debitAmount: 'desc' },
            { creditAmount: 'desc' }
          ]
        }
      }
    })
    
    if (!transaction) {
      console.log('\n❌ No accounting transaction found for this return!')
      console.log('   This means accounting entries were not created.')
      return
    }
    
    console.log('\n💰 Accounting Transaction:')
    console.log(`   Transaction #: ${transaction.transactionNumber}`)
    console.log(`   Date: ${transaction.date}`)
    console.log(`   Description: ${transaction.description}`)
    console.log(`   Purchase Invoice ID: ${transaction.purchaseInvoiceId || 'N/A'}`)
    
    console.log('\n📊 Transaction Lines:')
    let totalDebits = 0
    let totalCredits = 0
    
    transaction.transactionLines.forEach((line, index) => {
      console.log(`   ${index + 1}. ${line.account.name} (${line.account.code})`)
      if (line.debitAmount > 0) {
        console.log(`      Debit: Rs. ${line.debitAmount.toLocaleString()}`)
        totalDebits += line.debitAmount
      }
      if (line.creditAmount > 0) {
        console.log(`      Credit: Rs. ${line.creditAmount.toLocaleString()}`)
        totalCredits += line.creditAmount
      }
      console.log(`      Account Type: ${line.account.type}`)
      if (line.account.accountSubType) {
        console.log(`      Account Sub-Type: ${line.account.accountSubType}`)
      }
    })
    
    console.log('\n⚖️ Transaction Balance:')
    console.log(`   Total Debits: Rs. ${totalDebits.toLocaleString()}`)
    console.log(`   Total Credits: Rs. ${totalCredits.toLocaleString()}`)
    const balance = totalDebits - totalCredits
    if (Math.abs(balance) < 0.01) {
      console.log(`   ✅ Transaction is BALANCED`)
    } else {
      console.log(`   ❌ Transaction is NOT BALANCED (Difference: Rs. ${balance.toLocaleString()})`)
    }
    
    // 3. Check account balances
    console.log('\n💳 Account Balances:')
    const accountIds = [...new Set(transaction.transactionLines.map(line => line.accountId))]
    
    for (const accountId of accountIds) {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        include: {
          _count: {
            select: {
              transactionLines: true
            }
          }
        }
      })
      
      if (account) {
        const line = transaction.transactionLines.find(l => l.accountId === accountId)
        const change = (line.debitAmount || 0) - (line.creditAmount || 0)
        
        console.log(`\n   ${account.name} (${account.code}):`)
        console.log(`      Current Balance: Rs. ${account.balance.toLocaleString()}`)
        console.log(`      Change from this transaction: Rs. ${change.toLocaleString()}`)
        console.log(`      Account Type: ${account.type}`)
        if (account.accountSubType) {
          console.log(`      Account Sub-Type: ${account.accountSubType}`)
        }
        
        // For AP account, check if it was reduced correctly
        if (account.code === '2000') {
          console.log(`      ✅ This is the Accounts Payable account`)
          if (change > 0) {
            console.log(`      ✅ AP was debited (reduced) by Rs. ${change.toLocaleString()}`)
          } else {
            console.log(`      ⚠️ AP was credited (increased) by Rs. ${Math.abs(change).toLocaleString()}`)
          }
        }
        
        // For Inventory account
        if (account.code === '1300') {
          console.log(`      ✅ This is the Inventory account`)
          if (change < 0) {
            console.log(`      ✅ Inventory was credited (decreased) by Rs. ${Math.abs(change).toLocaleString()}`)
          } else {
            console.log(`      ⚠️ Inventory was debited (increased) by Rs. ${change.toLocaleString()}`)
          }
        }
      }
    }
    
    // 4. Check if return handling method matches transaction
    console.log('\n🔍 Return Handling Method Check:')
    const inventoryCredit = transaction.transactionLines.find(
      line => line.account.code === '1300' && line.creditAmount > 0
    )
    const apDebit = transaction.transactionLines.find(
      line => line.account.code === '2000' && line.debitAmount > 0
    )
    const cashBankDebit = transaction.transactionLines.find(
      line => (line.account.accountSubType === 'CASH' || line.account.accountSubType === 'BANK') && 
              line.debitAmount > 0
    )
    
    if (apDebit && !cashBankDebit) {
      console.log(`   ✅ Method: REDUCE_AP (Accounts Payable was debited)`)
      console.log(`      AP Debit: Rs. ${apDebit.debitAmount.toLocaleString()}`)
    } else if (cashBankDebit) {
      console.log(`   ✅ Method: REFUND (Cash/Bank account was debited)`)
      console.log(`      ${cashBankDebit.account.name} Debit: Rs. ${cashBankDebit.debitAmount.toLocaleString()}`)
      if (apDebit) {
        console.log(`      AP Debit: Rs. ${apDebit.debitAmount.toLocaleString()}`)
      }
    } else {
      console.log(`   ⚠️ Could not determine return handling method from transaction`)
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ Check completed!\n')
    
  } catch (error) {
    console.error('❌ Error checking return accounting:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

checkReturnAccounting()

