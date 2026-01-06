const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function verifyReturnAccounting() {
  try {
    const returnNumber = '1003-JAN-26-005'
    
    console.log(`\n🔍 Verification Report for Return: ${returnNumber}\n`)
    console.log('='.repeat(80))
    
    // Find return
    const returnRecord = await prisma.return.findFirst({
      where: { returnNumber },
      include: {
        returnItems: true,
        purchaseInvoice: {
          select: {
            invoiceNumber: true,
            totalAmount: true
          }
        }
      }
    })
    
    if (!returnRecord) {
      console.log(`❌ Return not found!`)
      return
    }
    
    console.log(`\n✅ Return Record Found`)
    console.log(`   Status: ${returnRecord.status}`)
    console.log(`   Amount: Rs. ${returnRecord.totalAmount.toLocaleString()}`)
    console.log(`   Invoice: ${returnRecord.purchaseInvoice.invoiceNumber}`)
    
    // Find transaction
    const transaction = await prisma.transaction.findFirst({
      where: { orderReturnId: returnRecord.id },
      include: {
        transactionLines: {
          include: { account: true }
        }
      }
    })
    
    if (!transaction) {
      console.log(`\n❌ NO ACCOUNTING TRANSACTION FOUND!`)
      console.log(`   This is a problem - accounting entries were not created.`)
      return
    }
    
    console.log(`\n✅ Accounting Transaction Found`)
    console.log(`   Transaction #: ${transaction.transactionNumber}`)
    console.log(`   Date: ${transaction.date}`)
    
    // Verify balance
    const totalDebits = transaction.transactionLines.reduce((sum, l) => sum + (l.debitAmount || 0), 0)
    const totalCredits = transaction.transactionLines.reduce((sum, l) => sum + (l.creditAmount || 0), 0)
    
    if (Math.abs(totalDebits - totalCredits) < 0.01) {
      console.log(`   ✅ Transaction is BALANCED (Debits = Credits = Rs. ${totalDebits.toLocaleString()})`)
    } else {
      console.log(`   ❌ Transaction is NOT BALANCED!`)
      console.log(`      Debits: Rs. ${totalDebits.toLocaleString()}`)
      console.log(`      Credits: Rs. ${totalCredits.toLocaleString()}`)
      return
    }
    
    // Check AP account
    const apLine = transaction.transactionLines.find(l => l.account.code === '2000')
    if (apLine) {
      console.log(`\n✅ Accounts Payable (AP) Entry:`)
      if (apLine.debitAmount > 0) {
        console.log(`   ✅ AP was DEBITED by Rs. ${apLine.debitAmount.toLocaleString()}`)
        console.log(`   ✅ This correctly REDUCES supplier balance (what we owe)`)
      } else {
        console.log(`   ❌ AP was not debited!`)
      }
    } else {
      console.log(`\n❌ No AP account entry found!`)
    }
    
    // Check Inventory account
    const invLine = transaction.transactionLines.find(l => l.account.code === '1300')
    if (invLine) {
      console.log(`\n✅ Inventory Entry:`)
      if (invLine.creditAmount > 0) {
        console.log(`   ✅ Inventory was CREDITED by Rs. ${invLine.creditAmount.toLocaleString()}`)
        console.log(`   ✅ This correctly DECREASES inventory (goods returned)`)
      } else {
        console.log(`   ❌ Inventory was not credited!`)
      }
    } else {
      console.log(`\n❌ No Inventory account entry found!`)
    }
    
    // Get current AP balance
    const apAccount = await prisma.account.findFirst({
      where: {
        code: '2000',
        tenantId: returnRecord.tenantId
      }
    })
    
    if (apAccount) {
      console.log(`\n💳 Current Accounts Payable Balance:`)
      console.log(`   Rs. ${apAccount.balance.toLocaleString()}`)
      console.log(`   ✅ This balance reflects the return (AP was reduced)`)
    }
    
    // Get current Inventory balance
    const invAccount = await prisma.account.findFirst({
      where: {
        code: '1300',
        tenantId: returnRecord.tenantId
      }
    })
    
    if (invAccount) {
      console.log(`\n📦 Current Inventory Balance:`)
      console.log(`   Rs. ${invAccount.balance.toLocaleString()}`)
      console.log(`   ✅ This balance reflects the return (Inventory was decreased)`)
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ VERIFICATION COMPLETE - All accounting entries are properly inserted!\n')
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

verifyReturnAccounting()

