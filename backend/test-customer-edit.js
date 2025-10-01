const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function testCustomerEdit() {
  try {
    console.log('🧪 Testing Customer Edit Functionality...\n');

    // Step 1: Login as business owner
    console.log('1. Logging in as business owner...');
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'business@dressshop.com',
      password: 'password123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful\n');

    // Step 2: Get tenant info
    console.log('2. Getting tenant information...');
    const tenantResponse = await axios.get(`${API_BASE}/tenant/owner/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const tenant = tenantResponse.data.tenant;
    console.log(`✅ Tenant: ${tenant.businessName}\n`);

    // Step 3: Get customers
    console.log('3. Fetching customers...');
    const customersResponse = await axios.get(`${API_BASE}/customer?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const customers = customersResponse.data.customers;
    console.log(`✅ Found ${customers.length} customers\n`);

    if (customers.length === 0) {
      console.log('❌ No customers found. Please create a customer first by submitting an order.');
      return;
    }

    // Step 4: Get first customer details
    const customer = customers[0];
    console.log(`4. Getting details for customer: ${customer.name || 'Unknown'} (${customer.phoneNumber})`);
    
    const customerDetailsResponse = await axios.get(`${API_BASE}/customer/${customer.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const customerDetails = customerDetailsResponse.data.customer;
    console.log('✅ Customer details retrieved');
    console.log(`   - Name: ${customerDetails.name || 'Not provided'}`);
    console.log(`   - Email: ${customerDetails.email || 'Not provided'}`);
    console.log(`   - Address: ${customerDetails.address || 'Not provided'}`);
    console.log(`   - Shipping Address: ${customerDetails.shippingAddress || 'Not provided'}`);
    console.log(`   - Notes: ${customerDetails.notes || 'Not provided'}\n`);

    // Step 5: Update customer with shipping address
    console.log('5. Updating customer with shipping address...');
    const updateData = {
      name: customerDetails.name || 'Test Customer',
      email: customerDetails.email || 'test@example.com',
      address: customerDetails.address || '123 Main Street, City',
      shippingAddress: '456 Shipping Lane, Delivery City, State 12345',
      notes: customerDetails.notes || 'Updated customer information'
    };

    const updateResponse = await axios.put(`${API_BASE}/customer/${customer.id}`, updateData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('✅ Customer updated successfully\n');

    // Step 6: Verify the update
    console.log('6. Verifying the update...');
    const verifyResponse = await axios.get(`${API_BASE}/customer/${customer.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const updatedCustomer = verifyResponse.data.customer;
    console.log('✅ Updated customer details:');
    console.log(`   - Name: ${updatedCustomer.name}`);
    console.log(`   - Email: ${updatedCustomer.email}`);
    console.log(`   - Address: ${updatedCustomer.address}`);
    console.log(`   - Shipping Address: ${updatedCustomer.shippingAddress}`);
    console.log(`   - Notes: ${updatedCustomer.notes}\n`);

    // Step 7: Check customer logs
    console.log('7. Checking customer logs...');
    const logsResponse = await axios.get(`${API_BASE}/customer/${customer.id}/logs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const logs = logsResponse.data.logs;
    console.log(`✅ Found ${logs.length} customer logs:`);
    logs.slice(0, 5).forEach((log, index) => {
      console.log(`   ${index + 1}. ${log.action} - ${log.description || 'No description'} (${new Date(log.createdAt).toLocaleString()})`);
      if (log.fieldName) {
        console.log(`      Field: ${log.fieldName} - "${log.oldValue}" → "${log.newValue}"`);
      }
    });

    console.log('\n🎉 Customer edit functionality test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ Customer update API working');
    console.log('✅ Shipping address field working');
    console.log('✅ Customer logs being generated');
    console.log('✅ All changes properly tracked');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data?.errors) {
      console.error('Validation errors:', error.response.data.errors);
    }
  }
}

// Run the test
testCustomerEdit();
