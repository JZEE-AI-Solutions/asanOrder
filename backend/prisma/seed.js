const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

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

  // Create a sample form
  const form = await prisma.form.create({
    data: {
      name: 'Custom Dress Order Form',
      description: 'Order form for custom dress designs',
      tenantId: tenant.id,
      isPublished: false
    }
  });
  console.log('✅ Sample form created:', form.name);

  // Create form fields
  const formFields = [
    {
      label: 'Customer Name',
      fieldType: 'TEXT',
      isRequired: true,
      placeholder: 'Enter customer name',
      order: 0,
      formId: form.id
    },
    {
      label: 'Mobile Number',
      fieldType: 'PHONE',
      isRequired: true,
      placeholder: 'Enter mobile number',
      order: 1,
      formId: form.id
    },
    {
      label: 'Shipping Address',
      fieldType: 'ADDRESS',
      isRequired: true,
      placeholder: 'Enter complete shipping address',
      order: 2,
      formId: form.id
    },
    {
      label: 'Dress Images & Quantities',
      fieldType: 'FILE_UPLOAD',
      isRequired: true,
      placeholder: 'Upload dress images',
      order: 3,
      formId: form.id
    },
    {
      label: 'Payment Amount',
      fieldType: 'AMOUNT',
      isRequired: true,
      placeholder: 'Enter payment amount',
      order: 4,
      formId: form.id
    },
    {
      label: 'Payment Receipt',
      fieldType: 'FILE_UPLOAD',
      isRequired: false,
      placeholder: 'Upload payment receipt (optional)',
      order: 5,
      formId: form.id
    }
  ];

  for (const fieldData of formFields) {
    await prisma.formField.create({ data: fieldData });
  }
  console.log('✅ Form fields created');

  console.log('🎉 Database seeded successfully!');
  console.log('\n📋 Login Credentials:');
  console.log('Admin: admin@orderms.com / admin123');
  console.log('Business Owner: business@dressshop.com / business123');
  console.log('Stock Keeper: stock@orderms.com / stock123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
