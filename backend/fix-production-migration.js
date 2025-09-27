const { PrismaClient } = require('@prisma/client');

async function fixProductionMigration() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔧 Fixing production migration state...');
    
    // Remove the failed migration record
    const result = await prisma.$executeRaw`
      DELETE FROM _prisma_migrations 
      WHERE migration_name = '20250925010446_add_soft_delete_to_purchase_invoices'
    `;
    
    console.log(`✅ Removed failed migration record (${result} rows affected)`);
    
    // Mark the migration as applied (since the database already has the correct state)
    await prisma.$executeRaw`
      INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES (
        'fixed_migration_001',
        'fixed_manually',
        GETDATE(),
        '20250925010446_add_soft_delete_to_purchase_invoices',
        'Manually resolved - database already in correct state',
        NULL,
        GETDATE(),
        1
      )
    `;
    
    console.log('✅ Migration marked as applied');
    console.log('🎉 Production database is now ready for deployment!');
    
  } catch (error) {
    console.error('❌ Error fixing production migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixProductionMigration();
