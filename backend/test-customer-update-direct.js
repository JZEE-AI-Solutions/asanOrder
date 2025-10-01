const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function testCustomerUpdate() {
  try {
    console.log('🧪 Testing Customer Update Directly...\n');

    // Step 1: Login as business owner
    console.log('1. Logging in as business owner...');
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'jazey@test.com',
      password: 'password123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful\n');

    // Step 2: Get customers
    console.log('2. Fetching customers...');
    const customersResponse = await axios.get(`${API_BASE}/customer?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const customers = customersResponse.data.customers;
    console.log(`✅ Found ${customers.length} customers\n`);

    if (customers.length === 0) {
      console.log('❌ No customers found. Please create a customer first by submitting an order.');
      return;
    }

    // Step 3: Get first customer details
    const customer = customers[0];
    console.log(`3. Getting details for customer: ${customer.name || 'Unknown'} (${customer.phoneNumber})`);
    
    const customerDetailsResponse = await axios.get(`${API_BASE}/customer/${customer.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const customerDetails = customerDetailsResponse.data.customer;
    console.log('✅ Customer details retrieved');
    console.log(`   - Name: ${customerDetails.name || 'Not provided'}`);
    console.log(`   - Email: ${customerDetails.email || 'Not provided'}`);
    console.log(`   - Address: ${customerDetails.address || 'Not provided'}`);
    console.log(`   - Shipping Address: ${customerDetails.shippingAddress || 'Not provided'}\n`);

    // Step 4: Update customer with shipping address
    console.log('4. Updating customer with shipping address...');
    const updateData = {
      name: customerDetails.name || 'Test Customer Updated',
      shippingAddress: '456 Shipping Lane, Delivery City, State 12345 - Updated via API Test'
    };

    console.log('Update data:', updateData);

    const updateResponse = await axios.put(`${API_BASE}/customer/${customer.id}`, updateData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Customer updated successfully');
    console.log('Response:', updateResponse.data);

    // Step 5: Verify the update
    console.log('\n5. Verifying the update...');
    const verifyResponse = await axios.get(`${API_BASE}/customer/${customer.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const updatedCustomer = verifyResponse.data.customer;
    console.log('✅ Updated customer details:');
    console.log(`   - Name: ${updatedCustomer.name}`);
    console.log(`   - Shipping Address: ${updatedCustomer.shippingAddress}\n`);

    console.log('🎉 Customer update test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data?.errors) {
      console.error('Validation errors:', error.response.data.errors);
    }
    console.error('Full error:', error);
  }
}

// Run the test
testCustomerUpdate();
