require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// Create PostgreSQL database if it doesn't exist
async function createDatabase() {
  console.log('🔄 Creating PostgreSQL database...\n');
  
  // Connect to default postgres database first
  const defaultUrl = process.env.DATABASE_URL.replace(/\/[^/]+(\?|$)/, '/postgres$1');
  const prismaDefault = new PrismaClient({
    datasources: {
      db: {
        url: defaultUrl
      }
    }
  });

  try {
    // Check if database exists
    const dbName = process.env.DATABASE_URL.match(/\/([^/?]+)(\?|$)/)?.[1];
    console.log(`Checking if database '${dbName}' exists...`);
    
    const result = await prismaDefault.$queryRaw`
      SELECT 1 FROM pg_database WHERE datname = ${dbName}
    `;
    
    if (result && result.length > 0) {
      console.log(`✅ Database '${dbName}' already exists`);
    } else {
      console.log(`Creating database '${dbName}'...`);
      await prismaDefault.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ Database '${dbName}' created successfully`);
    }
    
  } catch (error) {
    // If database already exists, that's fine
    if (error.message.includes('already exists') || error.code === '42P04') {
      console.log(`✅ Database already exists`);
    } else {
      console.error('❌ Error creating database:', error.message);
      throw error;
    }
  } finally {
    await prismaDefault.$disconnect();
  }
}

createDatabase();

