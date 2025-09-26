const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const checkDatabaseStructure = async () => {
  console.log('🔍 Checking current database structure...\n');

  try {
    // Check if products table exists and has data
    const productCount = await prisma.product.count();
    console.log(`📦 Products table: ${productCount} records`);

    if (productCount > 0) {
      const sampleProducts = await prisma.product.findMany({
        take: 3,
        include: {
          purchaseInvoice: true
        }
      });

      console.log('\n📋 Sample products:');
      sampleProducts.forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name} - Qty: ${product.quantity}, Price: ${product.purchasePrice}`);
        console.log(`      Invoice: ${product.purchaseInvoice?.invoiceNumber || 'N/A'}`);
      });
    }

    // Check other tables
    const tenantCount = await prisma.tenant.count();
    const invoiceCount = await prisma.purchaseInvoice.count();
    
    console.log(`\n🏢 Tenants: ${tenantCount}`);
    console.log(`📄 Purchase Invoices: ${invoiceCount}`);

  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Run check if called directly
if (require.main === module) {
  checkDatabaseStructure();
}

module.exports = checkDatabaseStructure;
