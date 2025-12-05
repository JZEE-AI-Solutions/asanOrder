require('dotenv').config();
const { Client } = require('pg');

async function testConnection() {
  console.log('🧪 Testing PostgreSQL Connection Directly...\n');
  
  // Parse connection string
  const url = process.env.DATABASE_URL;
  console.log('Connection URL:', url.replace(/:[^:@]+@/, ':****@')); // Hide password
  
  const client = new Client({
    connectionString: url
  });

  try {
    console.log('1. Attempting to connect...');
    await client.connect();
    console.log('✅ Connected successfully!');

    console.log('\n2. Testing query...');
    const result = await client.query('SELECT version()');
    console.log('✅ Query successful!');
    console.log('PostgreSQL version:', result.rows[0].version.split(',')[0]);

    console.log('\n3. Checking if database exists...');
    const dbResult = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'asanOrder'"
    );
    
    if (dbResult.rows.length > 0) {
      console.log('✅ Database "asanOrder" exists');
    } else {
      console.log('⚠️  Database "asanOrder" does not exist');
      console.log('Creating database...');
      await client.query('CREATE DATABASE asanOrder');
      console.log('✅ Database created!');
    }

    console.log('\n✅ All connection tests passed!');
    
  } catch (error) {
    console.error('\n❌ Connection test failed:', error.message);
    
    if (error.message.includes('password authentication')) {
      console.error('\n📋 Password Authentication Failed!');
      console.error('The password in your .env file might be incorrect.');
      console.error('\nTo fix:');
      console.error('1. Check your PostgreSQL password');
      console.error('2. Update backend/.env with correct password');
      console.error('3. Format: DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/asanOrder?schema=public"');
    } else if (error.message.includes('does not exist')) {
      console.error('\n📋 Database does not exist');
      console.error('The database will be created automatically by Prisma migrate');
    } else {
      console.error('\n📋 Error details:', error);
    }
  } finally {
    await client.end();
  }
}

testConnection();

