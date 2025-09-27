const { PrismaClient } = require('@prisma/client');

async function cleanProductionDB() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🧹 Cleaning production database migration state...');
    
    // Check current migration status
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, logs FROM _prisma_migrations 
      ORDER BY finished_at DESC
    `;
    
    console.log('Current migrations:', migrations);
    
    // Remove the failed migration record
    const result = await prisma.$executeRaw`
      DELETE FROM _prisma_migrations 
      WHERE migration_name = '20250925010446_add_soft_delete_to_purchase_invoices'
    `;
    
    console.log(`✅ Removed failed migration record (${result} rows affected)`);
    
    // Check if the constraint exists and drop it if it does
    try {
      const constraintCheck = await prisma.$queryRaw`
        SELECT name FROM sys.default_constraints 
        WHERE parent_object_id = OBJECT_ID('products') 
        AND name LIKE '%quantity%'
      `;
      
      console.log('Found constraints:', constraintCheck);
      
      if (constraintCheck.length > 0) {
        for (const constraint of constraintCheck) {
          await prisma.$executeRaw`
            ALTER TABLE [dbo].[products] DROP CONSTRAINT [${constraint.name}]
          `;
          console.log(`✅ Dropped constraint: ${constraint.name}`);
        }
      }
    } catch (error) {
      console.log('⚠️  No constraints to drop or already dropped');
    }
    
    console.log('🎉 Production database cleaned successfully!');
    console.log('You can now redeploy your application.');
    
  } catch (error) {
    console.error('❌ Error cleaning production database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanProductionDB();
