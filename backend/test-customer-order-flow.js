const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

// Configure axios with timeout
axios.defaults.timeout = 10000;

async function testCustomerOrderFlow() {
  try {
    console.log('🧪 Testing Customer Order Flow...\n');

    // Step 1: Login as business owner
    console.log('1. Logging in as business owner...');
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'business@dressshop.com',
      password: 'business123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful\n');

    // Step 2: Get tenant info
    console.log('2. Getting tenant information...');
    const tenantResponse = await axios.get(`${API_BASE}/tenant/owner/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const tenant = tenantResponse.data.tenant;
    console.log(`✅ Tenant found: ${tenant.businessName}\n`);

    // Step 3: Create a test form
    console.log('3. Creating a test form...');
    const formResponse = await axios.post(`${API_BASE}/form`, {
      name: 'Test Customer Form',
      description: 'Testing customer creation flow',
      fields: [
        {
          label: 'Customer Name',
          fieldType: 'TEXT',
          isRequired: true,
          placeholder: 'Enter your name',
          order: 1
        },
        {
          label: 'Phone Number',
          fieldType: 'PHONE',
          isRequired: true,
          placeholder: 'Enter your phone number',
          order: 2
        },
        {
          label: 'Email',
          fieldType: 'EMAIL',
          isRequired: false,
          placeholder: 'Enter your email',
          order: 3
        },
        {
          label: 'Address',
          fieldType: 'TEXTAREA',
          isRequired: true,
          placeholder: 'Enter your address',
          order: 4
        }
      ]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const form = formResponse.data.form;
    console.log(`✅ Form created: ${form.name} (ID: ${form.id})\n`);

    // Step 4: Publish the form
    console.log('4. Publishing the form...');
    const publishResponse = await axios.put(`${API_BASE}/form/${form.id}/publish`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const publishedForm = publishResponse.data.form;
    console.log(`✅ Form published with link: ${publishedForm.formLink}\n`);

    // Step 5: Submit an order (simulating customer submission)
    console.log('5. Submitting an order...');
    const orderData = {
      formLink: publishedForm.formLink,
      formData: {
        'Customer Name': 'John Doe',
        'Phone Number': '+1234567890',
        'Email': 'john.doe@example.com',
        'Address': '123 Main Street, City, State'
      },
      paymentAmount: 150.00,
      images: [],
      selectedProducts: [],
      productQuantities: []
    };

    const orderResponse = await axios.post(`${API_BASE}/order/submit`, orderData);
    console.log(`✅ Order submitted successfully (ID: ${orderResponse.data.order.id})\n`);

    // Step 6: Check if customer was created
    console.log('6. Checking if customer was created...');
    const customersResponse = await axios.get(`${API_BASE}/customer`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const customers = customersResponse.data.customers;
    console.log(`✅ Found ${customers.length} customers`);
    
    if (customers.length > 0) {
      const customer = customers[0];
      console.log(`   - Customer ID: ${customer.id}`);
      console.log(`   - Name: ${customer.name}`);
      console.log(`   - Phone: ${customer.phoneNumber}`);
      console.log(`   - Email: ${customer.email}`);
      console.log(`   - Total Orders: ${customer.totalOrders}`);
      console.log(`   - Total Spent: $${customer.totalSpent}\n`);

      // Step 7: Check customer logs
      console.log('7. Checking customer logs...');
      const logsResponse = await axios.get(`${API_BASE}/customer/${customer.id}/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const logs = logsResponse.data.logs;
      console.log(`✅ Found ${logs.length} customer logs`);
      logs.forEach((log, index) => {
        console.log(`   ${index + 1}. ${log.action} - ${log.description} (${new Date(log.createdAt).toLocaleString()})`);
      });
      console.log('');

      // Step 8: Check if order is associated with customer
      console.log('8. Checking order-customer association...');
      const ordersResponse = await axios.get(`${API_BASE}/order`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const orders = ordersResponse.data.orders;
      if (orders.length > 0) {
        const order = orders[0];
        console.log(`✅ Order found (ID: ${order.id})`);
        console.log(`   - Order Number: ${order.orderNumber}`);
        console.log(`   - Customer ID: ${order.customerId || 'NOT ASSOCIATED'}`);
        console.log(`   - Status: ${order.status}`);
        
        if (order.customerId) {
          console.log('✅ Order is properly associated with customer!');
        } else {
          console.log('❌ Order is NOT associated with customer!');
        }
      }
    } else {
      console.log('❌ No customers found - customer creation failed!');
    }

    console.log('\n🎉 Test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data?.error) {
      console.error('Error details:', error.response.data.error);
    }
    if (error.response?.data) {
      console.error('Full response:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testCustomerOrderFlow();
