const { PrismaClient } = require('@prisma/client');

async function deleteAllMigrations() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🗑️  Deleting all migrations from live database...');
    
    // Check current migration status
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, logs FROM _prisma_migrations 
      ORDER BY finished_at DESC
    `;
    
    console.log('Current migrations in database:', migrations);
    
    if (migrations.length === 0) {
      console.log('✅ No migrations found in database');
      return;
    }
    
    // Delete all migration records
    const result = await prisma.$executeRaw`
      DELETE FROM _prisma_migrations
    `;
    
    console.log(`✅ Deleted ${result} migration records from database`);
    
    // Verify deletion
    const remainingMigrations = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM _prisma_migrations
    `;
    
    console.log(`✅ Verification: ${remainingMigrations[0].count} migrations remaining`);
    
    console.log('🎉 All migrations deleted successfully!');
    console.log('');
    console.log('⚠️  IMPORTANT NOTES:');
    console.log('1. Your database schema is still intact');
    console.log('2. You can now run migrations from scratch');
    console.log('3. Use "npx prisma migrate deploy" to apply migrations');
    console.log('4. Or use "npx prisma migrate resolve --applied <migration_name>" to mark specific migrations as applied');
    
  } catch (error) {
    console.error('❌ Error deleting migrations:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllMigrations();
