const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

async function testMigrations() {
  console.log('🧪 Testing migrations from scratch...');
  
  try {
    // Step 1: Reset database
    console.log('1. Resetting database...');
    try {
      execSync('npx prisma migrate reset --force', { stdio: 'inherit' });
      console.log('✅ Database reset successful');
    } catch (error) {
      console.log('⚠️  Database reset failed, continuing...');
    }
    
    // Step 2: Generate Prisma client
    console.log('2. Generating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Prisma client generated');
    
    // Step 3: Apply migrations
    console.log('3. Applying migrations...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('✅ Migrations applied successfully');
    
    // Step 4: Test database connection
    console.log('4. Testing database connection...');
    const prisma = new PrismaClient();
    
    // Test basic queries
    const userCount = await prisma.user.count();
    const tenantCount = await prisma.tenant.count();
    
    console.log(`✅ Database connection successful`);
    console.log(`   - Users: ${userCount}`);
    console.log(`   - Tenants: ${tenantCount}`);
    
    await prisma.$disconnect();
    
    console.log('🎉 All migrations tested successfully!');
    
  } catch (error) {
    console.error('❌ Migration test failed:', error.message);
    process.exit(1);
  }
}

testMigrations();
