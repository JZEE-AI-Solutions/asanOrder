const axios = require('axios');

async function debugStepByStep() {
  try {
    console.log('🔍 Step 1: Testing login...');
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'jazey@test.com',
      password: 'password'
    });
    console.log('✅ Login successful');
    const token = loginResponse.data.token;
    
    console.log('🔍 Step 2: Getting customers...');
    const customersResponse = await axios.get('http://localhost:5000/api/customer?page=1&limit=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Customers retrieved:', customersResponse.data.customers.length);
    
    if (customersResponse.data.customers.length === 0) {
      console.log('❌ No customers found');
      return;
    }
    
    const customer = customersResponse.data.customers[0];
    console.log('🔍 Step 3: Testing customer update...');
    console.log('Customer ID:', customer.id);
    console.log('Customer name:', customer.name);
    console.log('Customer shipping address:', customer.shippingAddress);
    
    const updateData = {
      name: 'Test Update ' + Date.now(),
      shippingAddress: 'Test Shipping Address ' + Date.now()
    };
    
    console.log('Update data:', updateData);
    
    const updateResponse = await axios.put(`http://localhost:5000/api/customer/${customer.id}`, updateData, {
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Update successful!');
    console.log('Response:', updateResponse.data);
    
  } catch (error) {
    console.log('❌ Error occurred:');
    console.log('Message:', error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Status Text:', error.response.statusText);
      console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
      console.log('Response Headers:', error.response.headers);
    }
    if (error.request) {
      console.log('Request:', error.request);
    }
  }
}

debugStepByStep();
