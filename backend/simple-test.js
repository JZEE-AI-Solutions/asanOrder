const axios = require('axios');

async function simpleTest() {
  try {
    console.log('Testing basic API...');
    
    // Test health endpoint
    const healthResponse = await axios.get('http://localhost:5000/api/health');
    console.log('Health check:', healthResponse.data);
    
    // Test login
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'business@dressshop.com',
      password: 'business123'
    });
    console.log('Login successful, token length:', loginResponse.data.token.length);
    
    const token = loginResponse.data.token;
    
    // Test tenant endpoint
    const tenantResponse = await axios.get('http://localhost:5000/api/tenant/owner/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Tenant info:', tenantResponse.data.tenant.businessName);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

simpleTest();
