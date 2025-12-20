const axios = require('axios');

async function testAPIWithLogin() {
  try {
    console.log('🔐 Step 1: Logging in as jazeyone@test.com...\n');
    
    // Login
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'jazeyone@test.com',
      password: 'password123' // Try common password
    });
    
    if (!loginResponse.data.token) {
      console.log('❌ Login failed - no token received');
      console.log('Response:', loginResponse.data);
      return;
    }
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    console.log('   User:', loginResponse.data.user?.email);
    console.log('   Role:', loginResponse.data.user?.role);
    console.log('   Token:', token.substring(0, 20) + '...\n');
    
    console.log('📊 Step 2: Calling /api/order/stats/dashboard...\n');
    
    // Call stats API
    const statsResponse = await axios.get('http://localhost:5000/api/order/stats/dashboard', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ API Response Status:', statsResponse.status);
    console.log('📦 Full Response Data:');
    console.log(JSON.stringify(statsResponse.data, null, 2));
    
    if (statsResponse.data.stats) {
      console.log('\n📈 Stats Breakdown:');
      console.log('  - totalOrders:', statsResponse.data.stats.totalOrders);
      console.log('  - pendingOrders:', statsResponse.data.stats.pendingOrders);
      console.log('  - confirmedOrders:', statsResponse.data.stats.confirmedOrders);
      console.log('  - dispatchedOrders:', statsResponse.data.stats.dispatchedOrders);
      console.log('  - completedOrders:', statsResponse.data.stats.completedOrders);
      console.log('  - totalRevenue:', statsResponse.data.stats.totalRevenue);
      console.log('  - averageOrderValue:', statsResponse.data.stats.averageOrderValue);
      console.log('  - ordersToday:', statsResponse.data.stats.ordersToday);
      console.log('  - ordersThisWeek:', statsResponse.data.stats.ordersThisWeek);
      console.log('  - ordersThisMonth:', statsResponse.data.stats.ordersThisMonth);
    } else {
      console.log('⚠️  No stats object in response!');
      console.log('   Response keys:', Object.keys(statsResponse.data));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('   No response received. Is the server running?');
    }
  }
}

testAPIWithLogin();

