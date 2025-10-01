const axios = require('axios');

async function quickTest() {
  try {
    // Test login
    const login = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'jazey@test.com',
      password: 'password123'
    });
    console.log('✅ Login successful');
    
    const token = login.data.token;
    
    // Get customers
    const customers = await axios.get('http://localhost:5000/api/customer?page=1&limit=1', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (customers.data.customers.length === 0) {
      console.log('❌ No customers found');
      return;
    }
    
    const customer = customers.data.customers[0];
    console.log(`✅ Found customer: ${customer.id}`);
    
    // Test update
    const update = await axios.put(`http://localhost:5000/api/customer/${customer.id}`, {
      name: 'Test Update',
      shippingAddress: 'Test Shipping Address'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Update successful:', update.data);
    
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    }
  }
}

quickTest();
