require('dotenv').config()
const fs = require('fs')
const path = require('path')
const prisma = require('./lib/db')

async function runMigration() {
  console.log('🔄 Running migration to add missing columns...\n')
  
  const migrationPath = path.join(__dirname, 'prisma', 'migrations', 'add_missing_columns', 'migration.sql')
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
  
  try {
    // Split by GO statements if present, otherwise execute as single statement
    const statements = migrationSQL
      .split(/^\s*GO\s*$/gim)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing statement...')
        await prisma.$executeRawUnsafe(statement)
      }
    }
    
    console.log('\n✅ Migration completed successfully!')
    console.log('   - Added formCategory column to forms table')
    console.log('   - Added productPrices column to orders table')
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    if (error.meta) {
      console.error('Error details:', error.meta)
    }
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runMigration()

