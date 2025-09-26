const { PrismaClient } = require('@prisma/client');

// Database configuration for MS SQL Server
const databaseConfig = {
  // Connection string format for MS SQL Server
  // sqlserver://server:port;database=dbname;user=username;password=password;encrypt=true;trustServerCertificate=true
  connectionString: process.env.DATABASE_URL || 'sqlserver://localhost:1433;database=dressshop;user=sa;password=YourPassword123!;encrypt=true;trustServerCertificate=true',
  
  // Prisma client configuration
  prisma: new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || 'sqlserver://localhost:1433;database=dressshop;user=sa;password=YourPassword123!;encrypt=true;trustServerCertificate=true'
      }
    },
    log: ['query', 'info', 'warn', 'error'],
  })
};

// Test database connection
const testConnection = async () => {
  try {
    await databaseConfig.prisma.$connect();
    console.log('✅ Connected to MS SQL Server successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to MS SQL Server:', error.message);
    return false;
  }
};

// Close database connection
const closeConnection = async () => {
  try {
    await databaseConfig.prisma.$disconnect();
    console.log('✅ Disconnected from MS SQL Server');
  } catch (error) {
    console.error('❌ Error disconnecting from MS SQL Server:', error.message);
  }
};

module.exports = {
  prisma: databaseConfig.prisma,
  testConnection,
  closeConnection,
  config: databaseConfig
};
