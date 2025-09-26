const { PrismaClient } = require('@prisma/client');

// MS SQL Server Prisma client configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'sqlserver://localhost:1433;database=dressshop;user=sa;password=YourPassword123!;encrypt=true;trustServerCertificate=true'
    }
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// Test connection on startup
const testConnection = async () => {
  try {
    await prisma.$connect();
    console.log('✅ Connected to MS SQL Server successfully');
  } catch (error) {
    console.error('❌ Failed to connect to MS SQL Server:', error.message);
    console.log('📋 Please ensure:');
    console.log('   1. MS SQL Server is running');
    console.log('   2. Database "dressshop" exists');
    console.log('   3. User "sa" has proper permissions');
    console.log('   4. Connection string is correct in .env file');
  }
};

// Test connection
testConnection();

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
