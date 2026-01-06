const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function removeDuplicateAdjustment() {
  try {
    const transactionNumber = 'TXN-ADJ-RETURN-2026-1767651353349'
    const invoiceNumber = '1003-JAN-26-002'
    
    console.log(`\n🔧 Removing Duplicate Adjustment Transaction\n`)
    console.log('='.repeat(80))
    
    // Find the transaction
    const transaction = await prisma.transaction.findFirst({
      where: { transactionNumber },
      include: {
        transactionLines: {
          include: {
            account: true
          }
        },
        purchaseInvoice: {
          select: {
            id: true,
            invoiceNumber: true
          }
        }
      }
    })
    
    if (!transaction) {
      console.log(`❌ Transaction not found!`)
      return
    }
    
    console.log(`✅ Transaction Found:`)
    console.log(`   ID: ${transaction.id}`)
    console.log(`   Date: ${transaction.date}`)
    console.log(`   Description: ${transaction.description}`)
    console.log(`   Invoice: ${transaction.purchaseInvoice?.invoiceNumber || 'N/A'}`)
    console.log(`   Lines:`)
    transaction.transactionLines.forEach((line, index) => {
      console.log(`      ${index + 1}. ${line.account.code} - ${line.account.name}`)
      if (line.debitAmount > 0) {
        console.log(`         Debit: Rs. ${line.debitAmount.toLocaleString()}`)
      }
      if (line.creditAmount > 0) {
        console.log(`         Credit: Rs. ${line.creditAmount.toLocaleString()}`)
      }
    })
    
    // Check if this is a duplicate of return 1003-JAN-26-004
    const return004 = await prisma.return.findFirst({
      where: { returnNumber: '1003-JAN-26-004' },
      include: {
        returnItems: true
      }
    })
    
    if (return004) {
      const return004Transaction = await prisma.transaction.findFirst({
        where: { orderReturnId: return004.id },
        include: {
          transactionLines: {
            include: {
              account: true
            }
          }
        }
      })
      
      const adjustmentAPLine = transaction.transactionLines.find(l => l.account.code === '2000')
      
      if (return004Transaction && adjustmentAPLine) {
        const returnAPLine = return004Transaction.transactionLines.find(l => l.account.code === '2000')
        
        console.log(`\n📋 Comparing with Return 1003-JAN-26-004:`)
        console.log(`   Return Transaction: ${return004Transaction.transactionNumber}`)
        if (returnAPLine) {
          console.log(`   Return AP Debit: Rs. ${returnAPLine.debitAmount.toLocaleString()}`)
        }
        console.log(`   Adjustment AP Debit: Rs. ${adjustmentAPLine.debitAmount.toLocaleString()}`)
        
        if (returnAPLine && 
            Math.abs(returnAPLine.debitAmount - adjustmentAPLine.debitAmount) < 0.01 &&
            Math.abs(returnAPLine.debitAmount - 1250) < 0.01) {
          console.log(`\n⚠️  This adjustment transaction appears to be a duplicate of return ${return004.returnNumber}`)
          console.log(`   Return transaction: ${return004Transaction.transactionNumber}`)
          console.log(`   Both debit AP by: Rs. ${adjustmentAPLine.debitAmount.toLocaleString()}`)
          console.log(`\n🗑️  Deleting duplicate adjustment transaction...`)
          
          // Delete transaction lines first
          await prisma.transactionLine.deleteMany({
            where: { transactionId: transaction.id }
          })
          
          // Delete the transaction
          await prisma.transaction.delete({
            where: { id: transaction.id }
          })
          
          console.log(`✅ Duplicate adjustment transaction deleted!`)
          
          // Verify the invoice balance now
          const invoice = await prisma.purchaseInvoice.findFirst({
            where: { invoiceNumber },
            include: {
              purchaseItems: true
            }
          })
          
          if (invoice) {
            const purchaseTotal = invoice.purchaseItems.reduce((sum, item) => {
              return sum + (item.purchasePrice * item.quantity)
            }, 0)
            
            const allReturns = await prisma.return.findMany({
              where: {
                purchaseInvoiceId: invoice.id,
                returnType: 'SUPPLIER',
                status: { not: 'REJECTED' }
              },
              include: {
                returnItems: true
              }
            })
            
            const totalReturned = allReturns.reduce((sum, ret) => {
              return sum + ret.returnItems.reduce((s, item) => s + (item.purchasePrice * item.quantity), 0)
            }, 0)
            
            const expectedBalance = purchaseTotal - totalReturned
            
            // Get AP balance for this invoice
            const apAccount = await prisma.account.findFirst({
              where: {
                code: '2000',
                tenantId: invoice.tenantId
              }
            })
            
            if (apAccount) {
              const invoiceTransactions = await prisma.transaction.findMany({
                where: {
                  purchaseInvoiceId: invoice.id
                },
                include: {
                  transactionLines: {
                    where: {
                      accountId: apAccount.id
                    }
                  }
                }
              })
              
              let invoiceAPBalance = 0
              invoiceTransactions.forEach(txn => {
                txn.transactionLines.forEach(line => {
                  invoiceAPBalance += (line.creditAmount || 0) - (line.debitAmount || 0)
                })
              })
              
              console.log(`\n📊 Updated Invoice Balance:`)
              console.log(`   Purchase Total: Rs. ${purchaseTotal.toLocaleString()}`)
              console.log(`   Total Returns: Rs. ${totalReturned.toLocaleString()}`)
              console.log(`   Expected Balance: Rs. ${expectedBalance.toLocaleString()}`)
              console.log(`   Actual AP Balance: Rs. ${invoiceAPBalance.toLocaleString()}`)
              
              if (Math.abs(invoiceAPBalance - expectedBalance) < 0.01) {
                console.log(`   ✅ Balance is now correct!`)
              } else {
                console.log(`   ⚠️  Balance still doesn't match`)
              }
            }
          }
        } else {
          console.log(`\n⚠️  This doesn't appear to be a duplicate. Skipping deletion.`)
        }
      } else {
        console.log(`\n⚠️  Return 1003-JAN-26-004 transaction not found. Skipping deletion.`)
      }
    } else {
      console.log(`\n⚠️  Could not verify if this is a duplicate. Skipping deletion.`)
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

removeDuplicateAdjustment()

