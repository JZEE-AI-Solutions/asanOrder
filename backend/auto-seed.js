const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function autoSeed() {
  try {
    // Check if any users exist
    const userCount = await prisma.user.count();
    
    if (userCount > 0) {
      console.log(`✅ Database already has ${userCount} user(s). Skipping seed.`);
      return;
    }

    console.log('🌱 No users found. Seeding database...');

    // Create Admin user
    const adminPassword = await bcrypt.hash('admin123', 12);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@orderms.com' },
      update: {},
      create: {
        email: 'admin@orderms.com',
        password: adminPassword,
        name: 'System Administrator',
        role: 'ADMIN'
      }
    });
    console.log('✅ Admin user created:', admin.email);

    // Create Stock Keeper user
    const stockKeeperPassword = await bcrypt.hash('stock123', 12);
    const stockKeeper = await prisma.user.upsert({
      where: { email: 'stock@orderms.com' },
      update: {},
      create: {
        email: 'stock@orderms.com',
        password: stockKeeperPassword,
        name: 'Stock Keeper',
        role: 'STOCK_KEEPER'
      }
    });
    console.log('✅ Stock Keeper user created:', stockKeeper.email);

    // Create Business Owner user
    const businessOwnerPassword = await bcrypt.hash('business123', 12);
    const businessOwner = await prisma.user.upsert({
      where: { email: 'business@dressshop.com' },
      update: {},
      create: {
        email: 'business@dressshop.com',
        password: businessOwnerPassword,
        name: 'Sarah Ahmed',
        role: 'BUSINESS_OWNER'
      }
    });
    console.log('✅ Business Owner user created:', businessOwner.email);

    // Create Tenant
    const tenant = await prisma.tenant.upsert({
      where: { ownerId: businessOwner.id },
      update: {},
      create: {
        businessName: 'Elegant Dress Orders',
        contactPerson: 'Sarah Ahmed',
        whatsappNumber: '+923001234567',
        businessType: 'DRESS_SHOP',
        businessCode: '1001',
        ownerId: businessOwner.id
      }
    });
    console.log('✅ Tenant created:', tenant.businessName);

    console.log('🎉 Database seeded successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('Admin: admin@orderms.com / admin123');
    console.log('Business Owner: business@dressshop.com / business123');
    console.log('Stock Keeper: stock@orderms.com / stock123');
  } catch (error) {
    console.error('❌ Auto-seed failed:', error.message);
    // Don't throw - allow server to start even if seed fails
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  autoSeed()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = autoSeed;

