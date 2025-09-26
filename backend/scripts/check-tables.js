const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const checkTables = async () => {
  console.log('🔍 Checking database tables...\n');

  try {
    // Check what tables exist
    const tables = await prisma.$queryRaw`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE' 
      AND TABLE_NAME IN ('products', 'purchase_items', 'product_logs', 'purchase_invoices', 'tenants')
      ORDER BY TABLE_NAME
    `;

    console.log('📋 Existing tables:');
    tables.forEach(table => {
      console.log(`   • ${table.TABLE_NAME}`);
    });

    // Check products table structure
    const productColumns = await prisma.$queryRaw`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'products'
      ORDER BY ORDINAL_POSITION
    `;

    console.log('\n📦 Products table columns:');
    productColumns.forEach(col => {
      console.log(`   • ${col.COLUMN_NAME} (${col.DATA_TYPE}) ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // Check purchase_items table if it exists
    const purchaseItemColumns = await prisma.$queryRaw`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'purchase_items'
      ORDER BY ORDINAL_POSITION
    `;

    if (purchaseItemColumns.length > 0) {
      console.log('\n🛒 Purchase_items table columns:');
      purchaseItemColumns.forEach(col => {
        console.log(`   • ${col.COLUMN_NAME} (${col.DATA_TYPE}) ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
    }

    // Check data counts
    const productCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM [dbo].[products]`;
    console.log(`\n📊 Products count: ${productCount[0].count}`);

    if (purchaseItemColumns.length > 0) {
      const purchaseItemCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM [dbo].[purchase_items]`;
      console.log(`📊 Purchase_items count: ${purchaseItemCount[0].count}`);
    }

  } catch (error) {
    console.error('❌ Error checking tables:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Run check if called directly
if (require.main === module) {
  checkTables();
}

module.exports = checkTables;
