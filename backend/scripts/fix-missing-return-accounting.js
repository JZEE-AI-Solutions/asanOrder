const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const accountingService = require('../services/accountingService')

async function fixMissingReturnAccounting() {
  try {
    const returnNumber = '1003-JAN-26-004'
    
    console.log(`\n🔧 Fixing Missing Accounting for Return: ${returnNumber}\n`)
    console.log('='.repeat(80))
    
    // Find the return
    const returnRecord = await prisma.return.findFirst({
      where: { returnNumber },
      include: {
        returnItems: true,
        purchaseInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            tenantId: true
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
      console.log(`❌ Return not found!`)
      return
    }
    
    console.log(`✅ Return Found:`)
    console.log(`   ID: ${returnRecord.id}`)
    console.log(`   Status: ${returnRecord.status}`)
    console.log(`   Amount: Rs. ${returnRecord.totalAmount.toLocaleString()}`)
    console.log(`   Invoice: ${returnRecord.purchaseInvoice.invoiceNumber}`)
    
    // Check if transaction already exists
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        orderReturnId: returnRecord.id
      }
    })
    
    if (existingTransaction) {
      console.log(`\n✅ Accounting transaction already exists:`)
      console.log(`   Transaction #: ${existingTransaction.transactionNumber}`)
      return
    }
    
    console.log(`\n❌ No accounting transaction found - creating one...`)
    
    // Calculate total from return items
    const totalAmount = returnRecord.returnItems.reduce((sum, item) => {
      return sum + (item.purchasePrice * item.quantity)
    }, 0)
    
    console.log(`   Total Amount: Rs. ${totalAmount.toLocaleString()}`)
    
    // Get accounts
    const inventoryAccount = await accountingService.getAccountByCode('1300', returnRecord.tenantId) ||
      await accountingService.getOrCreateAccount({
        code: '1300',
        name: 'Inventory',
        type: 'ASSET',
        tenantId: returnRecord.tenantId,
        balance: 0
      })
    
    const apAccount = await accountingService.getAccountByCode('2000', returnRecord.tenantId) ||
      await accountingService.getOrCreateAccount({
        code: '2000',
        name: 'Accounts Payable',
        type: 'LIABILITY',
        tenantId: returnRecord.tenantId,
        balance: 0
      })
    
    // Create transaction lines (REDUCE_AP method)
    const transactionLines = [
      {
        accountId: inventoryAccount.id,
        debitAmount: 0,
        creditAmount: totalAmount
      },
      {
        accountId: apAccount.id,
        debitAmount: totalAmount,
        creditAmount: 0
      }
    ]
    
    // Create the transaction
    const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`
    const transaction = await accountingService.createTransaction(
      {
        transactionNumber,
        date: new Date(returnRecord.returnDate),
        description: `Supplier Return: ${returnRecord.returnNumber} (Invoice: ${returnRecord.purchaseInvoice.invoiceNumber})`,
        tenantId: returnRecord.tenantId,
        purchaseInvoiceId: returnRecord.purchaseInvoiceId,
        orderReturnId: returnRecord.id
      },
      transactionLines
    )
    
    console.log(`\n✅ Accounting Transaction Created:`)
    console.log(`   Transaction #: ${transaction.transactionNumber}`)
    console.log(`   Date: ${transaction.date}`)
    console.log(`   Description: ${transaction.description}`)
    
    // Update return status to APPROVED if it's not already
    if (returnRecord.status !== 'APPROVED') {
      await prisma.return.update({
        where: { id: returnRecord.id },
        data: { status: 'APPROVED' }
      })
      console.log(`\n✅ Return status updated to APPROVED`)
    }
    
    // Verify the transaction
    const verifyTransaction = await prisma.transaction.findFirst({
      where: { orderReturnId: returnRecord.id },
      include: {
        transactionLines: {
          include: {
            account: true
          }
        }
      }
    })
    
    if (verifyTransaction) {
      const totalDebits = verifyTransaction.transactionLines.reduce((sum, l) => sum + (l.debitAmount || 0), 0)
      const totalCredits = verifyTransaction.transactionLines.reduce((sum, l) => sum + (l.creditAmount || 0), 0)
      
      console.log(`\n✅ Verification:`)
      console.log(`   Total Debits: Rs. ${totalDebits.toLocaleString()}`)
      console.log(`   Total Credits: Rs. ${totalCredits.toLocaleString()}`)
      
      if (Math.abs(totalDebits - totalCredits) < 0.01) {
        console.log(`   ✅ Transaction is balanced`)
      } else {
        console.log(`   ❌ Transaction is NOT balanced!`)
      }
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ Fix completed!\n')
    
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

fixMissingReturnAccounting()

