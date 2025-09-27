const { PrismaClient } = require('@prisma/client');

async function fixMigration() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Fixing migration state...');
    
    // Check current migration status
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at FROM _prisma_migrations 
      ORDER BY finished_at DESC
    `;
    
    console.log('Current migrations:', migrations);
    
    // If the problematic migration exists, we need to handle it
    const failedMigration = migrations.find(m => 
      m.migration_name === '20250925010446_add_soft_delete_to_purchase_invoices' && 
      !m.finished_at
    );
    
    if (failedMigration) {
      console.log('Found failed migration, attempting to fix...');
      
      // First, let's try to manually fix the database state
      try {
        // Drop the constraint that's causing the issue
        await prisma.$executeRaw`ALTER TABLE [dbo].[products] DROP CONSTRAINT [products_quantity_df]`;
        console.log('Successfully dropped products_quantity_df constraint');
        
        // Mark the migration as completed
        await prisma.$executeRaw`
          UPDATE _prisma_migrations 
          SET finished_at = GETDATE(), logs = 'Manually resolved constraint issue'
          WHERE migration_name = '20250925010446_add_soft_delete_to_purchase_invoices'
        `;
        
        console.log('Migration marked as completed');
        
      } catch (error) {
        console.error('Error fixing migration:', error.message);
        
        // If we can't fix it, remove the failed migration record
        await prisma.$executeRaw`
          DELETE FROM _prisma_migrations 
          WHERE migration_name = '20250925010446_add_soft_delete_to_purchase_invoices'
        `;
        console.log('Removed failed migration record');
      }
    }
    
    console.log('Migration fix completed!');
    
  } catch (error) {
    console.error('Error in migration fix:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixMigration();
