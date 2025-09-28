const axios = require('axios');

const testFormRouting = async () => {
  console.log('🔍 Testing Form Routing Issue...\n');

  const formLink = '86631e9c24ac5c490706f1b2e36ad81f';
  const frontendUrl = 'https://order-l98r.onrender.com';
  const apiUrl = 'https://asanorder.onrender.com';
  
  try {
    // Test 1: Check if the form API is working
    console.log('📋 Step 1: Testing form API...');
    const apiResponse = await axios.get(`${apiUrl}/api/form/public/${formLink}`, {
      timeout: 15000
    });

    if (apiResponse.status === 200) {
      console.log('✅ Form API is working');
      console.log('   Form Name:', apiResponse.data.form.name);
      console.log('   Published:', apiResponse.data.form.isPublished);
      console.log('   Fields Count:', apiResponse.data.form.fields.length);
    } else {
      console.log('❌ Form API failed');
      return;
    }

  } catch (error) {
    console.log('❌ Form API Error:');
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Error:', error.response.data);
    } else {
      console.log('   Error:', error.message);
    }
    return;
  }

  try {
    // Test 2: Check frontend accessibility
    console.log('\n📋 Step 2: Testing frontend accessibility...');
    const frontendResponse = await axios.get(frontendUrl, {
      timeout: 15000,
      validateStatus: function (status) {
        return status < 500; // Accept any status less than 500
      }
    });

    console.log('   Frontend Status:', frontendResponse.status);
    if (frontendResponse.status === 200) {
      console.log('✅ Frontend is accessible');
    } else {
      console.log('❌ Frontend not accessible');
      return;
    }

  } catch (error) {
    console.log('❌ Frontend Error:', error.message);
    return;
  }

  try {
    // Test 3: Check specific form route
    console.log('\n📋 Step 3: Testing specific form route...');
    const formUrl = `${frontendUrl}/form/${formLink}`;
    console.log('   Testing URL:', formUrl);
    
    const formResponse = await axios.get(formUrl, {
      timeout: 15000,
      validateStatus: function (status) {
        return status < 500; // Accept any status less than 500
      }
    });

    console.log('   Form Route Status:', formResponse.status);
    
    if (formResponse.status === 200) {
      console.log('✅ Form route is working');
      // Check if the response contains the form or an error
      if (formResponse.data.includes('Form Not Found') || formResponse.data.includes('Not Found')) {
        console.log('❌ Form route returns "Not Found" content');
      } else {
        console.log('✅ Form route returns valid content');
      }
    } else if (formResponse.status === 404) {
      console.log('❌ Form route returns 404 - Routing issue');
    } else {
      console.log('⚠️ Form route returns unexpected status:', formResponse.status);
    }

  } catch (error) {
    console.log('❌ Form Route Error:');
    console.log('   Error:', error.message);
  }

  try {
    // Test 4: Check if frontend is making API calls correctly
    console.log('\n📋 Step 4: Testing API call from frontend perspective...');
    
    // Simulate what the frontend should be doing
    const frontendApiCall = await axios.get(`${frontendUrl}/api/form/public/${formLink}`, {
      timeout: 15000,
      validateStatus: function (status) {
        return status < 500;
      }
    });

    console.log('   Frontend API Call Status:', frontendApiCall.status);
    
    if (frontendApiCall.status === 200) {
      console.log('✅ Frontend can access API through proxy');
    } else if (frontendApiCall.status === 404) {
      console.log('❌ Frontend API proxy not working - 404');
    } else {
      console.log('⚠️ Frontend API call returned:', frontendApiCall.status);
    }

  } catch (error) {
    console.log('❌ Frontend API Call Error:');
    console.log('   Error:', error.message);
  }

  console.log('\n📊 Diagnosis Summary:');
  console.log('1. Check if Render.com has redeployed the frontend');
  console.log('2. Check if the frontend is using the correct API URL');
  console.log('3. Check if there are any console errors in the browser');
  console.log('4. The form exists in the database and API works');
};

// Run if called directly
if (require.main === module) {
  testFormRouting();
}

module.exports = testFormRouting;
