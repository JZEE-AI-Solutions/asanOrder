const prisma = require('../lib/db');

async function countPurchaseInvoices() {
  try {
    console.log('🔍 Counting purchase invoices...\n');
    
    // Count all purchase invoices
    const totalCount = await prisma.purchaseInvoice.count({
      where: {
        isDeleted: false
      }
    });

    // Count deleted purchase invoices
    const deletedCount = await prisma.purchaseInvoice.count({
      where: {
        isDeleted: true
      }
    });

    // Get some details
    const invoices = await prisma.purchaseInvoice.findMany({
      where: {
        isDeleted: false
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        totalAmount: true,
        supplierName: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10 // Show last 10
    });

    console.log('📊 Purchase Invoice Statistics:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Active Purchase Invoices: ${totalCount}`);
    console.log(`🗑️  Deleted Purchase Invoices: ${deletedCount}`);
    console.log(`📦 Total Purchase Invoices: ${totalCount + deletedCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (invoices.length > 0) {
      console.log('📋 Recent Purchase Invoices (Last 10):');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      invoices.forEach((invoice, index) => {
        console.log(`${index + 1}. Invoice #${invoice.invoiceNumber || 'N/A'}`);
        console.log(`   Date: ${invoice.invoiceDate.toLocaleDateString()}`);
        console.log(`   Amount: Rs. ${invoice.totalAmount.toFixed(2)}`);
        console.log(`   Supplier: ${invoice.supplierName || 'N/A'}`);
        console.log(`   Created: ${invoice.createdAt.toLocaleString()}`);
        console.log('');
      });
    } else {
      console.log('ℹ️  No purchase invoices found.');
    }

  } catch (error) {
    console.error('❌ Error counting purchase invoices:', error);
  } finally {
    await prisma.$disconnect();
  }
}

countPurchaseInvoices();

