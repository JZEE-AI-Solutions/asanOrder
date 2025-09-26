const fs = require('fs');
const path = require('path');

// Setup environment file for MS SQL Server
const setupEnv = () => {
  console.log('🔧 Setting up environment file for MS SQL Server...\n');

  const envContent = `# MS SQL Server Configuration
DATABASE_URL="sqlserver://mssql-185523-0.cloudclusters.net:19401;database=asanOrder;user=zeesoft;password=Pass@word1;encrypt=true;trustServerCertificate=true"
JWT_SECRET="your-super-secret-jwt-key-here"
PORT=5000

# Twilio WhatsApp API (optional for now)
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_WHATSAPP_NUMBER=""

# Upload settings
UPLOAD_DIR="uploads"
MAX_FILE_SIZE=5242880

# OpenAI API Key (for invoice processing)
OPENAI_API_KEY="your-openai-api-key-here"

# Image storage mode (database or filesystem)
IMAGE_STORAGE_MODE="database"
`;

  const envPath = path.join(__dirname, '../.env');
  
  try {
    // Check if .env already exists
    if (fs.existsSync(envPath)) {
      console.log('⚠️  .env file already exists');
      console.log('📋 Current .env content:');
      console.log(fs.readFileSync(envPath, 'utf8'));
      console.log('\n🔄 Updating with MS SQL Server configuration...');
    }

    // Write the new .env file
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env file created/updated successfully!');
    
    console.log('\n📋 Configuration:');
    console.log('   - Database: MS SQL Server (CloudClusters)');
    console.log('   - Database Name: asanOrder');
    console.log('   - Image Storage: Database BLOB');
    console.log('   - Port: 5000');
    
    console.log('\n🚀 Next steps:');
    console.log('   1. Run: npx prisma migrate dev --name init-mssql');
    console.log('   2. Run: npm start');
    console.log('   3. Your app will be ready!');

  } catch (error) {
    console.error('❌ Error setting up .env file:', error.message);
  }
};

// Run setup if called directly
if (require.main === module) {
  setupEnv();
}

module.exports = setupEnv;
