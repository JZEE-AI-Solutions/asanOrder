const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// MS SQL Server setup script
const setupMSSQL = async () => {
  console.log('🚀 Setting up MS SQL Server for Dress Shop...\n');

  // Test connection
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'sqlserver://localhost:1433;database=dressshop;user=sa;password=YourPassword123!;encrypt=true;trustServerCertificate=true'
      }
    }
  });

  try {
    // Test connection
    console.log('📡 Testing database connection...');
    await prisma.$connect();
    console.log('✅ Connected to MS SQL Server successfully\n');

    // Run migrations
    console.log('🔄 Running database migrations...');
    const { execSync } = require('child_process');
    
    try {
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      console.log('✅ Database migrations completed successfully\n');
    } catch (migrationError) {
      console.log('⚠️  Migration failed, trying to reset...');
      try {
        execSync('npx prisma migrate reset --force', { stdio: 'inherit' });
        console.log('✅ Database reset and migrations completed\n');
      } catch (resetError) {
        console.error('❌ Migration reset failed:', resetError.message);
        throw resetError;
      }
    }

    // Generate Prisma client
    console.log('🔧 Generating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Prisma client generated successfully\n');

    // Test basic operations
    console.log('🧪 Testing basic database operations...');
    
    // Test user creation
    const testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        password: 'hashedpassword',
        name: 'Test User',
        role: 'ADMIN'
      }
    });
    console.log('✅ User creation test passed');

    // Test tenant creation
    const testTenant = await prisma.tenant.create({
      data: {
        businessName: 'Test Business',
        contactPerson: 'Test Person',
        whatsappNumber: '+1234567890',
        businessType: 'DRESS_SHOP',
        businessCode: '9999',
        ownerId: testUser.id
      }
    });
    console.log('✅ Tenant creation test passed');

    // Test product creation with image data
    const testProduct = await prisma.product.create({
      data: {
        name: 'Test Product',
        description: 'Test product description',
        purchasePrice: 100.00,
        sellingPrice: 150.00,
        quantity: 10,
        category: 'Test Category',
        sku: 'TEST-001',
        imageData: Buffer.from('test-image-data'),
        imageType: 'image/jpeg',
        tenantId: testTenant.id
      }
    });
    console.log('✅ Product creation with image data test passed');

    // Clean up test data
    await prisma.product.delete({ where: { id: testProduct.id } });
    await prisma.tenant.delete({ where: { id: testTenant.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 MS SQL Server setup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Update your .env file with correct database credentials');
    console.log('   2. Run: npm start');
    console.log('   3. Your application is ready to use MS SQL Server!');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Ensure MS SQL Server is running');
    console.log('   2. Create database "dressshop"');
    console.log('   3. Update connection string in .env file');
    console.log('   4. Check user permissions');
  } finally {
    await prisma.$disconnect();
  }
};

// Run setup if called directly
if (require.main === module) {
  setupMSSQL();
}

module.exports = setupMSSQL;
