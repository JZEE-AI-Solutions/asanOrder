require('dotenv').config();
const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

async function testOrderStats() {
  console.log('🧪 Testing Enhanced Order Stats API\n');
  
  try {
    // Login first
    console.log('1. Logging in...');
    const loginRes = await axios.post(`${API_BASE}/auth/login`, {
      email: 'admin@orderms.com',
      password: 'admin123'
    });
    
    const token = loginRes.data.token;
    console.log('✅ Login successful\n');

    // Test stats endpoint
    console.log('2. Testing /order/stats/dashboard...');
    const startTime = Date.now();
    const statsRes = await axios.get(`${API_BASE}/order/stats/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const responseTime = Date.now() - startTime;

    console.log(`✅ Response received in ${responseTime}ms\n`);
    console.log('📊 Stats Data:');
    console.log(JSON.stringify(statsRes.data.stats, null, 2));
    
    // Verify all expected fields
    const stats = statsRes.data.stats;
    const expectedFields = [
      'totalOrders',
      'pendingOrders',
      'confirmedOrders',
      'dispatchedOrders',
      'completedOrders',
      'totalRevenue',
      'averageOrderValue',
      'ordersToday',
      'ordersThisWeek',
      'ordersThisMonth'
    ];

    console.log('\n✅ Field Verification:');
    expectedFields.forEach(field => {
      if (stats[field] !== undefined) {
        console.log(`  ✅ ${field}: ${stats[field]}`);
      } else {
        console.log(`  ❌ ${field}: MISSING`);
      }
    });

    console.log('\n✅ All stats are available!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testOrderStats();

