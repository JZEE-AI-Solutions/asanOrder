const { PrismaClient } = require('@prisma/client');

// Test MS SQL Server connection
const testConnection = async () => {
  console.log('🔍 Testing MS SQL Server connection...\n');

  // Your corrected connection string
  const connectionString = "sqlserver://mssql-185523-0.cloudclusters.net:19401;database=asanOrder;user=zeesoft;password=Pass@word1;encrypt=true;trustServerCertificate=true";
  
  console.log('📡 Connection String:');
  console.log(connectionString.replace(/password=[^;]+/, 'password=***'));
  console.log('');

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: connectionString
      }
    }
  });

  try {
    // Test basic connection
    console.log('🔄 Testing basic connection...');
    await prisma.$connect();
    console.log('✅ Connected to MS SQL Server successfully!\n');

    // Test database operations
    console.log('🧪 Testing database operations...');
    
    // Test a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Raw query test passed:', result);

    // Test if tables exist
    const tables = await prisma.$queryRaw`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
    `;
    console.log('📋 Existing tables:', tables);

    console.log('\n🎉 Connection test completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Update your .env file with the corrected connection string');
    console.log('   2. Run: npx prisma migrate dev --name init-mssql');
    console.log('   3. Run: npm start');

  } catch (error) {
    console.error('\n❌ Connection test failed:', error.message);
    
    if (error.message.includes("Can't reach database server")) {
      console.log('\n🔧 Troubleshooting:');
      console.log('   1. Check if the server is running');
      console.log('   2. Verify the host and port are correct');
      console.log('   3. Check firewall settings');
      console.log('   4. Ensure the database exists');
    } else if (error.message.includes("Login failed")) {
      console.log('\n🔧 Authentication issues:');
      console.log('   1. Verify username and password');
      console.log('   2. Check if the user has proper permissions');
      console.log('   3. Ensure SQL Server authentication is enabled');
    } else if (error.message.includes("database")) {
      console.log('\n🔧 Database issues:');
      console.log('   1. Ensure the database "asanOrder" exists');
      console.log('   2. Check if the user has access to the database');
    }
  } finally {
    await prisma.$disconnect();
  }
};

// Run test if called directly
if (require.main === module) {
  testConnection();
}

module.exports = testConnection;
