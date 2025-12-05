require('dotenv').config()
const prisma = require('./lib/db')

async function addMissingColumns() {
  console.log('🔄 Adding missing columns directly...\n')
  
  try {
    // Add formCategory to forms table
    console.log('Adding formCategory column to forms table...')
    try {
      await prisma.$executeRawUnsafe(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('forms') AND name = 'formCategory')
        BEGIN
          ALTER TABLE [dbo].[forms] ADD [formCategory] NVARCHAR(1000) NOT NULL DEFAULT 'SIMPLE_CART';
          PRINT 'Added formCategory column';
        END
      `)
      console.log('✅ formCategory column added/verified')
    } catch (error) {
      console.error('❌ Error adding formCategory:', error.message)
    }

    // Add productPrices to orders table
    console.log('Adding productPrices column to orders table...')
    try {
      await prisma.$executeRawUnsafe(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('orders') AND name = 'productPrices')
        BEGIN
          ALTER TABLE [dbo].[orders] ADD [productPrices] NVARCHAR(4000);
          PRINT 'Added productPrices column';
        END
      `)
      console.log('✅ productPrices column added/verified')
    } catch (error) {
      console.error('❌ Error adding productPrices:', error.message)
    }

    // Verify columns exist
    console.log('\n🔍 Verifying columns...')
    const formsColumns = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'forms' AND COLUMN_NAME = 'formCategory'
    `)
    const ordersColumns = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'orders' AND COLUMN_NAME = 'productPrices'
    `)
    
    console.log('formCategory exists:', formsColumns.length > 0)
    console.log('productPrices exists:', ordersColumns.length > 0)
    
    if (formsColumns.length > 0 && ordersColumns.length > 0) {
      console.log('\n✅ All columns added successfully!')
    } else {
      console.log('\n⚠️  Some columns may still be missing')
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    if (error.meta) {
      console.error('Details:', error.meta)
    }
  } finally {
    await prisma.$disconnect()
  }
}

addMissingColumns()

