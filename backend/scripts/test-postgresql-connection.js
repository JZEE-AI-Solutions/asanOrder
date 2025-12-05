require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function testConnection() {
  console.log('🧪 Testing PostgreSQL Connection...\n');
  
  const prisma = new PrismaClient();

  try {
    // Test 1: Basic connection
    console.log('1. Testing basic connection...');
    await prisma.$connect();
    console.log('✅ Connected to PostgreSQL successfully');

    // Test 2: Query database
    console.log('\n2. Testing database query...');
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database query successful:', result);

    // Test 3: Check tables exist
    console.log('\n3. Checking tables...');
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    console.log(`✅ Found ${tables.length} tables:`);
    tables.forEach(table => {
      console.log(`   - ${table.table_name}`);
    });

    // Test 4: Test a simple query
    console.log('\n4. Testing simple query...');
    const userCount = await prisma.user.count();
    console.log(`✅ Users table accessible: ${userCount} users`);

    // Test 5: Test transaction
    console.log('\n5. Testing transaction...');
    await prisma.$transaction(async (tx) => {
      const count = await tx.user.count();
      console.log(`✅ Transaction test successful: ${count} users`);
    });

    console.log('\n✅ All connection tests passed!');
    console.log('🎉 PostgreSQL is ready to use!');

  } catch (error) {
    console.error('\n❌ Connection test failed:', error.message);
    console.error('\n📋 Troubleshooting:');
    console.error('   1. Check PostgreSQL is running');
    console.error('   2. Verify DATABASE_URL in .env file');
    console.error('   3. Check database exists');
    console.error('   4. Verify user permissions');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();

