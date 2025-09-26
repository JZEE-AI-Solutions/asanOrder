const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const addSoftDeleteFields = async () => {
  console.log('🔧 Adding soft delete fields to purchase_invoices table...\n');

  try {
    // Check if the fields already exist
    const tableInfo = await prisma.$queryRaw`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'purchase_invoices' 
      AND COLUMN_NAME IN ('isDeleted', 'deletedAt', 'deletedBy', 'deleteReason')
    `;

    if (tableInfo.length > 0) {
      console.log('✅ Soft delete fields already exist in purchase_invoices table');
      console.log('Existing fields:', tableInfo.map(f => f.COLUMN_NAME));
      return;
    }

    // Add soft delete fields
    console.log('📝 Adding isDeleted field...');
    await prisma.$executeRaw`
      ALTER TABLE purchase_invoices 
      ADD isDeleted BIT NOT NULL DEFAULT 0
    `;

    console.log('📝 Adding deletedAt field...');
    await prisma.$executeRaw`
      ALTER TABLE purchase_invoices 
      ADD deletedAt DATETIME2 NULL
    `;

    console.log('📝 Adding deletedBy field...');
    await prisma.$executeRaw`
      ALTER TABLE purchase_invoices 
      ADD deletedBy NVARCHAR(255) NULL
    `;

    console.log('📝 Adding deleteReason field...');
    await prisma.$executeRaw`
      ALTER TABLE purchase_invoices 
      ADD deleteReason NVARCHAR(500) NULL
    `;

    console.log('✅ Successfully added soft delete fields to purchase_invoices table');

    // Verify the fields were added
    const newTableInfo = await prisma.$queryRaw`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'purchase_invoices' 
      AND COLUMN_NAME IN ('isDeleted', 'deletedAt', 'deletedBy', 'deleteReason')
      ORDER BY COLUMN_NAME
    `;

    console.log('\n📊 New fields added:');
    newTableInfo.forEach(field => {
      console.log(`   • ${field.COLUMN_NAME}: ${field.DATA_TYPE} (${field.IS_NULLABLE === 'YES' ? 'nullable' : 'not null'})`);
    });

  } catch (error) {
    console.error('❌ Error adding soft delete fields:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Run if called directly
if (require.main === module) {
  addSoftDeleteFields();
}

module.exports = addSoftDeleteFields;
