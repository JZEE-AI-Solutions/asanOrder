const { PrismaClient } = require('@prisma/client');

async function resetMigration() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Resetting migration state...');
    
    // Mark the failed migration as rolled back
    await prisma.$executeRaw`
      DELETE FROM _prisma_migrations 
      WHERE migration_name = '20250925010446_add_soft_delete_to_purchase_invoices'
    `;
    
    console.log('Migration state reset successfully!');
    console.log('You can now run: npx prisma migrate deploy');
    
  } catch (error) {
    console.error('Error resetting migration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetMigration();
