const axios = require('axios');

async function testCustomerEndpoint() {
  try {
    console.log('Testing customer endpoint fix...');
    
    // First, let's test the GET endpoint (should work)
    console.log('\n1. Testing GET /api/customer (should work):');
    try {
      const getResponse = await axios.get('http://localhost:3000/api/customer?page=1&limit=20&search=');
      console.log('✅ GET endpoint works:', getResponse.status);
    } catch (error) {
      console.log('❌ GET endpoint failed:', error.response?.status, error.response?.data);
    }

    // Test PUT endpoint with empty email (this was failing before)
    console.log('\n2. Testing PUT /api/customer/cmg8700x8000mzw5ikl0mh6vz with empty email:');
    try {
      const putResponse = await axios.put('http://localhost:3000/api/customer/cmg8700x8000mzw5ikl0mh6vz', {
        email: '', // Empty email that was causing the validation error
        name: 'Test Customer'
      });
      console.log('✅ PUT endpoint with empty email works:', putResponse.status);
    } catch (error) {
      console.log('❌ PUT endpoint with empty email failed:', error.response?.status, error.response?.data);
    }

    // Test PUT endpoint with valid email
    console.log('\n3. Testing PUT /api/customer/cmg8700x8000mzw5ikl0mh6vz with valid email:');
    try {
      const putResponse2 = await axios.put('http://localhost:3000/api/customer/cmg8700x8000mzw5ikl0mh6vz', {
        email: 'test@example.com',
        name: 'Test Customer'
      });
      console.log('✅ PUT endpoint with valid email works:', putResponse2.status);
    } catch (error) {
      console.log('❌ PUT endpoint with valid email failed:', error.response?.status, error.response?.data);
    }

    // Test PUT endpoint with invalid email
    console.log('\n4. Testing PUT /api/customer/cmg8700x8000mzw5ikl0mh6vz with invalid email:');
    try {
      const putResponse3 = await axios.put('http://localhost:3000/api/customer/cmg8700x8000mzw5ikl0mh6vz', {
        email: 'invalid-email',
        name: 'Test Customer'
      });
      console.log('❌ PUT endpoint with invalid email should fail:', putResponse3.status);
    } catch (error) {
      console.log('✅ PUT endpoint with invalid email correctly failed:', error.response?.status, error.response?.data?.details?.[0]?.msg);
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Wait a bit for server to start, then run test
setTimeout(() => {
  testCustomerEndpoint();
}, 3000);
