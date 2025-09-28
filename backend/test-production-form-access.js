const axios = require('axios');

const testProductionFormAccess = async () => {
  console.log('🔍 Testing Production Form Access...\n');

  const formLink = '86631e9c24ac5c490706f1b2e36ad81f';
  const baseUrl = 'https://asanorder.onrender.com';
  
  try {
    // Test 1: Check if the form exists in production database
    console.log('📋 Step 1: Testing form API endpoint...');
    const formResponse = await axios.get(`${baseUrl}/api/form/public/${formLink}`, {
      timeout: 15000
    });

    if (formResponse.status === 200) {
      console.log('✅ Form API is working');
      console.log('   Form Name:', formResponse.data.form.name);
      console.log('   Form ID:', formResponse.data.form.id);
      console.log('   Fields Count:', formResponse.data.form.fields.length);
      console.log('   Published:', formResponse.data.form.isPublished);
      console.log('   Form Link:', formResponse.data.form.formLink);
      
      // Display fields
      console.log('\n📋 Form Fields:');
      formResponse.data.form.fields.forEach((field, index) => {
        console.log(`   ${index + 1}. ${field.label} (${field.fieldType}) - Required: ${field.isRequired}`);
      });
    } else {
      console.log('❌ Form API failed');
      console.log('   Status:', formResponse.status);
      console.log('   Response:', formResponse.data);
    }

  } catch (error) {
    console.log('❌ Form API Error:');
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Error:', error.response.data);
    } else {
      console.log('   Error:', error.message);
    }
  }

  try {
    // Test 2: Check if the frontend URL is accessible
    console.log('\n📋 Step 2: Testing frontend URL...');
    const frontendUrl = `https://order-l98r.onrender.com/form/${formLink}`;
    console.log('   Frontend URL:', frontendUrl);
    
    const frontendResponse = await axios.get(frontendUrl, {
      timeout: 15000,
      validateStatus: function (status) {
        return status < 500; // Accept any status less than 500
      }
    });

    console.log('   Frontend Status:', frontendResponse.status);
    if (frontendResponse.status === 200) {
      console.log('✅ Frontend is accessible');
    } else if (frontendResponse.status === 404) {
      console.log('❌ Frontend returned 404 - Form not found or routing issue');
    } else {
      console.log('⚠️ Frontend returned unexpected status');
    }

  } catch (error) {
    console.log('❌ Frontend Error:');
    console.log('   Error:', error.message);
  }

  try {
    // Test 3: Check if the form exists in production database
    console.log('\n📋 Step 3: Checking production database...');
    const { PrismaClient } = require('@prisma/client');
    
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: "sqlserver://mssql-185523-0.cloudclusters.net:19401;database=asanOrder;user=zeesoft;password=Pass@word1;encrypt=true;trustServerCertificate=true"
        }
      }
    });

    const form = await prisma.form.findUnique({
      where: { formLink: formLink },
      include: {
        fields: {
          orderBy: { order: 'asc' }
        },
        tenant: {
          select: {
            businessName: true,
            businessType: true
          }
        }
      }
    });

    if (form) {
      console.log('✅ Form found in production database');
      console.log('   Form Name:', form.name);
      console.log('   Published:', form.isPublished);
      console.log('   Hidden:', form.isHidden);
      console.log('   Fields Count:', form.fields.length);
      console.log('   Tenant:', form.tenant.businessName);
    } else {
      console.log('❌ Form not found in production database');
    }

    await prisma.$disconnect();

  } catch (error) {
    console.log('❌ Database Error:');
    console.log('   Error:', error.message);
  }
};

// Run if called directly
if (require.main === module) {
  testProductionFormAccess();
}

module.exports = testProductionFormAccess;
