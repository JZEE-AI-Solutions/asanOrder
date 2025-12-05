const { PrismaClient } = require('@prisma/client');

// MS SQL Server Prisma client configuration with performance optimizations
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'sqlserver://localhost:1433;database=dressshop;user=sa;password=YourPassword123!;encrypt=true;trustServerCertificate=true'
    }
  },
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'], // Reduced logging for performance
  // Connection pool configuration for optimal performance
  // These settings optimize for local database connections
  __internal: {
    engine: {
      connectTimeout: 10000, // 10 seconds
      queryTimeout: 30000, // 30 seconds
    }
  }
});

    // Test connection on startup
    const testConnection = async () => {
      try {
        await prisma.$connect();
        const dbUrl = process.env.DATABASE_URL || '';
        if (dbUrl.includes('postgresql')) {
          console.log('✅ Connected to PostgreSQL successfully');
        } else if (dbUrl.includes('sqlserver')) {
          console.log('✅ Connected to MS SQL Server successfully');
        } else {
          console.log('✅ Connected to database successfully');
        }
      } catch (error) {
        console.error('❌ Failed to connect to database:', error.message);
        const dbUrl = process.env.DATABASE_URL || '';
        if (dbUrl.includes('postgresql')) {
          console.log('📋 Please ensure:');
          console.log('   1. PostgreSQL is running');
          console.log('   2. Database exists');
          console.log('   3. User has proper permissions');
          console.log('   4. Connection string is correct in .env file');
        } else {
          console.log('📋 Please ensure:');
          console.log('   1. Database server is running');
          console.log('   2. Database exists');
          console.log('   3. User has proper permissions');
          console.log('   4. Connection string is correct in .env file');
        }
      }
    };

// Test connection
testConnection();

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
