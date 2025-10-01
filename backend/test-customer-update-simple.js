const axios = require('axios');

async function testCustomerUpdate() {
  try {
    console.log('Testing customer update...');

    // First, let's try to login with a simple approach
    console.log('1. Testing login...');
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'jazey@test.com',
      password: 'password123'
    });
    
    console.log('Login successful!');
    const token = loginResponse.data.token;

    // Get customers
    console.log('2. Getting customers...');
    const customersResponse = await axios.get('http://localhost:5000/api/customer?page=1&limit=5', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const customers = customersResponse.data.customers;
    console.log(`Found ${customers.length} customers`);

    if (customers.length === 0) {
      console.log('No customers found');
      return;
    }

    // Get first customer
    const customer = customers[0];
    console.log(`3. Testing update for customer: ${customer.id}`);

    // Try to update with minimal data
    const updateData = {
      name: 'Test Name Updated',
      shippingAddress: 'Test Shipping Address Updated'
    };

    console.log('Update data:', updateData);

    try {
      const updateResponse = await axios.put(`http://localhost:5000/api/customer/${customer.id}`, updateData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Update successful!');
      console.log('Response:', updateResponse.data);
    } catch (updateError) {
      console.log('❌ Update failed');
      console.log('Status:', updateError.response?.status);
      console.log('Error data:', updateError.response?.data);
      console.log('Error message:', updateError.message);
    }

  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

testCustomerUpdate();
