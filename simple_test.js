const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function runTest() {
  console.log('🧪 Starting Simple End-to-End Test');
  console.log('=' .repeat(50));

  let token, tenantId;

  try {
    // Step 1: Login
    console.log('\n1. 🔐 Testing Login...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'business@dressshop.com',
      password: 'business123'
    });
    
    if (loginResponse.data.token) {
      console.log('✅ Login successful');
      token = loginResponse.data.token;
      tenantId = loginResponse.data.user.tenant?.id;
      console.log(`   Tenant ID: ${tenantId}`);
    } else {
      console.log('❌ Login failed');
      return;
    }

    // Step 2: Create Purchase Invoice
    console.log('\n2. 📄 Testing Purchase Invoice Creation...');
    try {
      const invoiceResponse = await axios.post(`${BASE_URL}/purchase-invoice`, {
        invoiceNumber: 'INV-TEST-' + Date.now(),
        supplierName: 'Test Supplier',
        invoiceDate: new Date().toISOString(),
        totalAmount: 50000,
        items: [
          {
            name: 'Elegant Red Dress',
            description: 'Beautiful red evening dress',
            purchasePrice: 15000,
            quantity: 2,
            category: 'Evening Wear',
            sku: 'RED-DRESS-001'
          },
          {
            name: 'Blue Casual Dress',
            description: 'Comfortable blue casual dress',
            purchasePrice: 10000,
            quantity: 3,
            category: 'Casual Wear',
            sku: 'BLUE-DRESS-002'
          }
        ]
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (invoiceResponse.data.purchaseInvoice) {
        console.log('✅ Purchase invoice created successfully');
        console.log(`   Invoice ID: ${invoiceResponse.data.purchaseInvoice.id}`);
        console.log(`   Invoice Number: ${invoiceResponse.data.purchaseInvoice.invoiceNumber}`);
      } else {
        console.log('❌ Purchase invoice creation failed');
        console.log('   Error:', invoiceResponse.data);
        return;
      }
    } catch (error) {
      console.log('❌ Purchase invoice creation failed with error');
      console.log('   Status:', error.response?.status);
      console.log('   Error:', error.response?.data);
      return;
    }

    // Step 3: Check Products
    console.log('\n3. 📦 Testing Product Management...');
    const productsResponse = await axios.get(`${BASE_URL}/products/tenant/${tenantId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (productsResponse.data.success) {
      console.log(`✅ Found ${productsResponse.data.products.length} products`);
      console.log('   Products:', productsResponse.data.products.map(p => p.name));
    } else {
      console.log('❌ No products found');
      return;
    }

    // Step 4: Create Form
    console.log('\n4. 📝 Testing Form Creation...');
    const formResponse = await axios.post(`${BASE_URL}/form`, {
      name: 'Test Order Form',
      description: 'Test form for comprehensive testing',
      fields: [
        {
          label: 'Customer Name',
          fieldType: 'TEXT',
          isRequired: true,
          placeholder: 'Enter your full name',
          order: 0
        },
        {
          label: 'Phone Number',
          fieldType: 'PHONE',
          isRequired: true,
          placeholder: 'Enter your phone number',
          order: 1
        },
        {
          label: 'Select Products',
          fieldType: 'PRODUCT_SELECTOR',
          isRequired: false,
          placeholder: 'Choose your products',
          order: 2
        }
      ]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (formResponse.data.form) {
      console.log('✅ Form created successfully');
      const formId = formResponse.data.form.id;
      console.log(`   Form ID: ${formId}`);
    } else {
      console.log('❌ Form creation failed');
      console.log('   Error:', formResponse.data);
      return;
    }

    // Step 5: Publish Form
    console.log('\n5. 🌐 Testing Form Publishing...');
    const publishResponse = await axios.put(`${BASE_URL}/form/${formResponse.data.form.id}`, {
      isPublished: true
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (publishResponse.data.form) {
      console.log('✅ Form published successfully');
      const formLink = publishResponse.data.form.formLink;
      console.log(`   Form Link: ${formLink}`);
    } else {
      console.log('❌ Form publishing failed');
      console.log('   Error:', publishResponse.data);
      return;
    }

    // Step 6: Test Public Form Access
    console.log('\n6. 🔗 Testing Public Form Access...');
    const publicFormResponse = await axios.get(`${BASE_URL}/form/public/${publishResponse.data.form.formLink}`);

    if (publicFormResponse.data.form) {
      console.log('✅ Public form accessed successfully');
      console.log(`   Form Name: ${publicFormResponse.data.form.name}`);
    } else {
      console.log('❌ Public form access failed');
      console.log('   Error:', publicFormResponse.data);
      return;
    }

    // Step 7: Test Order Submission
    console.log('\n7. 🛒 Testing Order Submission...');
    const orderData = {
      formLink: publishResponse.data.form.formLink,
      formData: {
        'Customer Name': 'Test Customer',
        'Phone Number': '+923001234567'
      },
      selectedProducts: productsResponse.data.products.slice(0, 2), // Take first 2 products
      productQuantities: {
        [productsResponse.data.products[0]?.id]: 2,
        [productsResponse.data.products[1]?.id]: 1
      },
      images: [],
      paymentReceipt: null
    };

    const orderResponse = await axios.post(`${BASE_URL}/order/submit`, orderData);

    if (orderResponse.data.order) {
      console.log('✅ Order submitted successfully');
      const orderId = orderResponse.data.order.id;
      console.log(`   Order ID: ${orderId}`);
      console.log(`   Order Number: ${orderResponse.data.order.orderNumber}`);
    } else {
      console.log('❌ Order submission failed');
      console.log('   Error:', orderResponse.data);
      return;
    }

    // Step 8: Test Order Receipt
    console.log('\n8. 📋 Testing Order Receipt...');
    const receiptResponse = await axios.get(`${BASE_URL}/order/receipt/${orderResponse.data.order.id}`);

    if (receiptResponse.data.order) {
      console.log('✅ Order receipt retrieved successfully');
      const order = receiptResponse.data.order;
      console.log(`   Order Number: ${order.orderNumber}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Selected Products: ${order.selectedProducts ? 'Yes' : 'No'}`);
      console.log(`   Product Quantities: ${order.productQuantities ? 'Yes' : 'No'}`);
    } else {
      console.log('❌ Order receipt retrieval failed');
      console.log('   Error:', receiptResponse.data);
      return;
    }

    console.log('\n' + '=' .repeat(50));
    console.log('🎉 ALL TESTS PASSED! Comprehensive test completed successfully.');
    console.log('\n📊 Test Summary:');
    console.log('✅ Business Login');
    console.log('✅ Purchase Invoice Creation');
    console.log('✅ Product Management');
    console.log('✅ Form Creation');
    console.log('✅ Form Publishing');
    console.log('✅ Public Form Access');
    console.log('✅ Order Submission with Quantities');
    console.log('✅ Order Receipt with Product Details');

  } catch (error) {
    console.log('\n❌ Test failed with error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.log('   Full error response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

runTest();
