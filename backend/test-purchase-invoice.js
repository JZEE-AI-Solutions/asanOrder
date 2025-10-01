const axios = require('axios');

async function testPurchaseInvoice() {
  try {
    console.log('🧪 Testing Purchase Invoice with Products...\n');

    // Step 1: Login as business owner
    console.log('1. Logging in as business owner...');
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'business@dressshop.com',
      password: 'business123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful\n');

    // Step 2: Test the new route
    console.log('2. Testing purchase invoice creation with products...');
    const testData = {
      invoiceNumber: `TEST-INV-${Date.now()}`,
      invoiceDate: new Date().toISOString(),
      totalAmount: 1000.00,
      products: [
        {
          name: 'Test Product 1',
          purchasePrice: 500.00,
          quantity: 2,
          description: 'Test description',
          category: 'Test Category'
        }
      ],
      supplierName: 'Test Supplier',
      notes: 'Test invoice'
    };

    console.log('Sending data:', JSON.stringify(testData, null, 2));

    const response = await axios.post('http://localhost:5000/api/purchase-invoice/with-products', testData, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('✅ Purchase invoice created successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.response?.status) {
      console.error('Response status:', error.response.status);
    }
  }
}

testPurchaseInvoice();
