const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const FRONTEND_URL = 'http://localhost:5173';

// Test data
const testData = {
  businessOwner: {
    email: 'test@dressshop.com',
    password: 'test123',
    name: 'Test Business Owner',
    businessName: 'Test Dress Shop',
    whatsappNumber: '+923001234567',
    businessType: 'DRESS_SHOP'
  },
  purchaseInvoice: {
    invoiceNumber: 'INV-TEST-001',
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
  },
  form: {
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
  }
};

class ComprehensiveTest {
  constructor() {
    this.authToken = null;
    this.tenantId = null;
    this.formId = null;
    this.formLink = null;
    this.orderId = null;
    this.testResults = [];
  }

  async log(step, message, success = true) {
    const status = success ? '✅' : '❌';
    const timestamp = new Date().toISOString();
    console.log(`${status} [${timestamp}] ${step}: ${message}`);
    this.testResults.push({ step, message, success, timestamp });
  }

  async testBusinessRegistration() {
    try {
      console.log('\n🚀 Starting Business Registration Test...');
      
      const response = await axios.post(`${BASE_URL}/auth/register`, {
        email: testData.businessOwner.email,
        password: testData.businessOwner.password,
        name: testData.businessOwner.name,
        businessName: testData.businessOwner.businessName,
        whatsappNumber: testData.businessOwner.whatsappNumber,
        businessType: testData.businessOwner.businessType
      });

      if (response.data.success) {
        await this.log('Business Registration', 'Business owner account created successfully');
        return true;
      } else {
        await this.log('Business Registration', 'Failed to create business owner account', false);
        return false;
      }
    } catch (error) {
      if (error.response?.status === 400 && error.response.data.error.includes('already exists')) {
        await this.log('Business Registration', 'Business owner account already exists (expected)');
        return true;
      } else {
        await this.log('Business Registration', `Error: ${error.response?.data?.error || error.message}`, false);
        return false;
      }
    }
  }

  async testLogin() {
    try {
      console.log('\n🔐 Testing Login...');
      
      const response = await axios.post(`${BASE_URL}/auth/login`, {
        email: testData.businessOwner.email,
        password: testData.businessOwner.password
      });

      if (response.data.success && response.data.token) {
        this.authToken = response.data.token;
        this.tenantId = response.data.user.tenant?.id;
        await this.log('Login', 'Successfully logged in and obtained auth token');
        return true;
      } else {
        await this.log('Login', 'Failed to login', false);
        return false;
      }
    } catch (error) {
      await this.log('Login', `Error: ${error.response?.data?.error || error.message}`, false);
      return false;
    }
  }

  async testPurchaseInvoiceCreation() {
    try {
      console.log('\n📄 Testing Purchase Invoice Creation...');
      
      const response = await axios.post(`${BASE_URL}/purchase-invoice`, {
        invoiceNumber: testData.purchaseInvoice.invoiceNumber,
        supplierName: testData.purchaseInvoice.supplierName,
        invoiceDate: testData.purchaseInvoice.invoiceDate,
        totalAmount: testData.purchaseInvoice.totalAmount,
        items: testData.purchaseInvoice.items
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.data.success) {
        await this.log('Purchase Invoice Creation', 'Purchase invoice created successfully');
        return true;
      } else {
        await this.log('Purchase Invoice Creation', 'Failed to create purchase invoice', false);
        return false;
      }
    } catch (error) {
      await this.log('Purchase Invoice Creation', `Error: ${error.response?.data?.error || error.message}`, false);
      return false;
    }
  }

  async testProductManagement() {
    try {
      console.log('\n📦 Testing Product Management...');
      
      const response = await axios.get(`${BASE_URL}/products/tenant/${this.tenantId}`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.data.success && response.data.products.length > 0) {
        await this.log('Product Management', `Found ${response.data.products.length} products`);
        return true;
      } else {
        await this.log('Product Management', 'No products found', false);
        return false;
      }
    } catch (error) {
      await this.log('Product Management', `Error: ${error.response?.data?.error || error.message}`, false);
      return false;
    }
  }

  async testFormCreation() {
    try {
      console.log('\n📝 Testing Form Creation...');
      
      const response = await axios.post(`${BASE_URL}/form`, {
        name: testData.form.name,
        description: testData.form.description,
        fields: testData.form.fields
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.data.success) {
        this.formId = response.data.form.id;
        await this.log('Form Creation', 'Form created successfully');
        return true;
      } else {
        await this.log('Form Creation', 'Failed to create form', false);
        return false;
      }
    } catch (error) {
      await this.log('Form Creation', `Error: ${error.response?.data?.error || error.message}`, false);
      return false;
    }
  }

  async testFormPublishing() {
    try {
      console.log('\n🌐 Testing Form Publishing...');
      
      const response = await axios.put(`${BASE_URL}/form/${this.formId}`, {
        isPublished: true
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.data.success) {
        this.formLink = response.data.form.formLink;
        await this.log('Form Publishing', `Form published with link: ${this.formLink}`);
        return true;
      } else {
        await this.log('Form Publishing', 'Failed to publish form', false);
        return false;
      }
    } catch (error) {
      await this.log('Form Publishing', `Error: ${error.response?.data?.error || error.message}`, false);
      return false;
    }
  }

  async testPublicFormAccess() {
    try {
      console.log('\n🔗 Testing Public Form Access...');
      
      const response = await axios.get(`${BASE_URL}/form/public/${this.formLink}`);

      if (response.data.success && response.data.form) {
        await this.log('Public Form Access', 'Successfully accessed public form');
        return true;
      } else {
        await this.log('Public Form Access', 'Failed to access public form', false);
        return false;
      }
    } catch (error) {
      await this.log('Public Form Access', `Error: ${error.response?.data?.error || error.message}`, false);
      return false;
    }
  }

  async testOrderSubmission() {
    try {
      console.log('\n🛒 Testing Order Submission...');
      
      // First, get the form to get product data
      const formResponse = await axios.get(`${BASE_URL}/form/public/${this.formLink}`);
      const form = formResponse.data.form;
      
      // Get products for the tenant
      const productsResponse = await axios.post(`${BASE_URL}/products/by-ids`, {
        productIds: ['test-product-1', 'test-product-2'], // Mock product IDs
        tenantId: this.tenantId
      });

      const orderData = {
        formLink: this.formLink,
        formData: {
          'Customer Name': 'Test Customer',
          'Phone Number': '+923001234567'
        },
        selectedProducts: productsResponse.data.products || [],
        productQuantities: {
          'test-product-1': 2,
          'test-product-2': 1
        },
        images: [],
        paymentReceipt: null
      };

      const response = await axios.post(`${BASE_URL}/order/submit`, orderData);

      if (response.data.success) {
        this.orderId = response.data.order.id;
        await this.log('Order Submission', `Order submitted successfully with ID: ${this.orderId}`);
        return true;
      } else {
        await this.log('Order Submission', 'Failed to submit order', false);
        return false;
      }
    } catch (error) {
      await this.log('Order Submission', `Error: ${error.response?.data?.error || error.message}`, false);
      return false;
    }
  }

  async testOrderReceipt() {
    try {
      console.log('\n📋 Testing Order Receipt...');
      
      const response = await axios.get(`${BASE_URL}/order/receipt/${this.orderId}`);

      if (response.data.success && response.data.order) {
        const order = response.data.order;
        await this.log('Order Receipt', `Order receipt retrieved successfully`);
        await this.log('Order Receipt', `Order Number: ${order.orderNumber}`);
        await this.log('Order Receipt', `Status: ${order.status}`);
        return true;
      } else {
        await this.log('Order Receipt', 'Failed to retrieve order receipt', false);
        return false;
      }
    } catch (error) {
      await this.log('Order Receipt', `Error: ${error.response?.data?.error || error.message}`, false);
      return false;
    }
  }

  async runComprehensiveTest() {
    console.log('🧪 Starting Comprehensive End-to-End Test');
    console.log('=' .repeat(60));

    const steps = [
      { name: 'Business Registration', fn: () => this.testBusinessRegistration() },
      { name: 'Login', fn: () => this.testLogin() },
      { name: 'Purchase Invoice Creation', fn: () => this.testPurchaseInvoiceCreation() },
      { name: 'Product Management', fn: () => this.testProductManagement() },
      { name: 'Form Creation', fn: () => this.testFormCreation() },
      { name: 'Form Publishing', fn: () => this.testFormPublishing() },
      { name: 'Public Form Access', fn: () => this.testPublicFormAccess() },
      { name: 'Order Submission', fn: () => this.testOrderSubmission() },
      { name: 'Order Receipt', fn: () => this.testOrderReceipt() }
    ];

    let allPassed = true;

    for (const step of steps) {
      try {
        const result = await step.fn();
        if (!result) {
          allPassed = false;
          console.log(`\n❌ Test failed at step: ${step.name}`);
          break;
        }
      } catch (error) {
        console.log(`\n💥 Unexpected error in step ${step.name}:`, error.message);
        allPassed = false;
        break;
      }
    }

    console.log('\n' + '=' .repeat(60));
    if (allPassed) {
      console.log('🎉 ALL TESTS PASSED! Comprehensive test completed successfully.');
    } else {
      console.log('❌ SOME TESTS FAILED! Check the logs above for details.');
    }

    console.log('\n📊 Test Summary:');
    this.testResults.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.step}: ${result.message}`);
    });

    return allPassed;
  }
}

// Run the test
const test = new ComprehensiveTest();
test.runComprehensiveTest().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Test runner error:', error);
  process.exit(1);
});
