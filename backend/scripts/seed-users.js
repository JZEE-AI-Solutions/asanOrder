const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// Sample users data
const sampleUsers = [
  {
    email: 'admin@orderms.com',
    password: 'admin123',
    name: 'System Administrator',
    role: 'ADMIN'
  },
  {
    email: 'business@dressshop.com',
    password: 'business123',
    name: 'Sarah Ahmed',
    role: 'BUSINESS_OWNER',
    tenant: {
      businessName: 'Elegant Dress Orders',
      contactPerson: 'Sarah Ahmed',
      whatsappNumber: '+923001234567',
      businessType: 'DRESS_SHOP',
      businessCode: '1001'
    }
  },
  {
    email: 'j.shop1@yopmail.com',
    password: 'jazey123',
    name: 'Jazey',
    role: 'BUSINESS_OWNER',
    tenant: {
      businessName: 'Shope 1',
      contactPerson: 'Jazey',
      whatsappNumber: '+923456491425',
      businessType: 'DRESS_SHOP',
      businessCode: '1002'
    }
  },
  {
    email: 'stock@orderms.com',
    password: 'stock123',
    name: 'Stock Manager',
    role: 'STOCK_KEEPER'
  },
  {
    email: 'demo@dressshop.com',
    password: 'demo123',
    name: 'Demo User',
    role: 'BUSINESS_OWNER',
    tenant: {
      businessName: 'Demo Dress Shop',
      contactPerson: 'Demo User',
      whatsappNumber: '+923009999999',
      businessType: 'DRESS_SHOP',
      businessCode: '9999'
    }
  }
];

const seedUsers = async () => {
  console.log('🌱 Seeding sample users...\n');

  try {
    // Clear existing users (optional - comment out if you want to keep existing data)
    console.log('🧹 Cleaning existing users...');
    await prisma.tenant.deleteMany({});
    await prisma.user.deleteMany({});
    console.log('✅ Existing users cleaned\n');

    for (const userData of sampleUsers) {
      console.log(`👤 Creating user: ${userData.email}`);
      
      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      
      // Create user
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          password: hashedPassword,
          name: userData.name,
          role: userData.role
        }
      });

      console.log(`   ✅ User created with ID: ${user.id}`);

      // Create tenant if user is a business owner
      if (userData.tenant) {
        const tenant = await prisma.tenant.create({
          data: {
            ...userData.tenant,
            ownerId: user.id
          }
        });
        console.log(`   🏢 Tenant created: ${tenant.businessName} (${tenant.businessCode})`);
      }

      console.log('');
    }

    console.log('🎉 Sample users seeded successfully!\n');
    
    console.log('📋 Login Credentials:');
    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log('│                    DEMO CREDENTIALS                     │');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log('│ Admin:        admin@orderms.com / admin123              │');
    console.log('│ Business:     business@dressshop.com / business123      │');
    console.log('│ Business:     j.shop1@yopmail.com / jazey123            │');
    console.log('│ Business:     demo@dressshop.com / demo123              │');
    console.log('│ Stock:        stock@orderms.com / stock123              │');
    console.log('└─────────────────────────────────────────────────────────┘');
    
    console.log('\n🚀 You can now login with any of these credentials!');

  } catch (error) {
    console.error('❌ Error seeding users:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Run seeding if called directly
if (require.main === module) {
  seedUsers();
}

module.exports = seedUsers;
