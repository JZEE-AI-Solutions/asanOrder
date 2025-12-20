const prisma = require('../lib/db');
const axios = require('axios');

// Test the dashboard stats API by directly querying the database
async function testDashboardStats() {
  try {
    console.log('🔍 Testing Dashboard Stats...\n');
    
    // First, get a business owner user to test with
    const user = await prisma.user.findFirst({
      where: {
        role: 'BUSINESS_OWNER'
      },
      include: {
        tenant: true
      }
    });

    if (!user) {
      console.log('❌ No business owner found in database');
      await prisma.$disconnect();
      return;
    }

    console.log('👤 Found user:', user.email);
    console.log('🏢 Tenant ID:', user.tenant?.id);
    console.log('');

    // Query orders directly from database
    const whereClause = {
      tenantId: user.tenant?.id
    };

    const [
      totalOrders,
      pendingOrders,
      confirmedOrders,
      dispatchedOrders,
      completedOrders
    ] = await Promise.all([
      prisma.order.count({ where: whereClause }),
      prisma.order.count({ where: { ...whereClause, status: 'PENDING' } }),
      prisma.order.count({ where: { ...whereClause, status: 'CONFIRMED' } }),
      prisma.order.count({ where: { ...whereClause, status: 'DISPATCHED' } }),
      prisma.order.count({ where: { ...whereClause, status: 'COMPLETED' } })
    ]);

    // Calculate date ranges
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now);
    monthStart.setDate(now.getDate() - 30);

    const [ordersToday, ordersThisWeek, ordersThisMonth] = await Promise.all([
      prisma.order.count({
        where: {
          ...whereClause,
          createdAt: { gte: todayStart }
        }
      }),
      prisma.order.count({
        where: {
          ...whereClause,
          createdAt: { gte: weekStart }
        }
      }),
      prisma.order.count({
        where: {
          ...whereClause,
          createdAt: { gte: monthStart }
        }
      })
    ]);

    // Get all orders for revenue calculation
    const allOrdersForRevenue = await prisma.order.findMany({
      where: whereClause,
      select: {
        selectedProducts: true,
        productQuantities: true,
        productPrices: true,
        shippingCharges: true
      }
    });

    // Calculate total revenue
    let totalRevenue = 0;
    let totalOrderValue = 0;
    let orderCount = 0;

    for (const order of allOrdersForRevenue) {
      try {
        let selectedProducts = [];
        let productQuantities = {};
        let productPrices = {};

        selectedProducts = typeof order.selectedProducts === 'string' 
          ? JSON.parse(order.selectedProducts) 
          : (order.selectedProducts || []);
        productQuantities = typeof order.productQuantities === 'string'
          ? JSON.parse(order.productQuantities)
          : (order.productQuantities || {});
        productPrices = typeof order.productPrices === 'string'
          ? JSON.parse(order.productPrices)
          : (order.productPrices || {});

        let orderTotal = 0;
        if (Array.isArray(selectedProducts)) {
          selectedProducts.forEach(product => {
            const quantity = productQuantities[product.id] || product.quantity || 1;
            const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
            orderTotal += price * quantity;
          });
        }
        orderTotal += order.shippingCharges || 0;
        
        totalRevenue += orderTotal;
        if (orderTotal > 0) {
          totalOrderValue += orderTotal;
          orderCount++;
        }
      } catch (e) {
        console.error(`Error parsing order for revenue calculation:`, e);
      }
    }

    const averageOrderValue = orderCount > 0 ? totalOrderValue / orderCount : 0;

    console.log('📊 Database Query Results:');
    console.log('  - totalOrders:', totalOrders);
    console.log('  - pendingOrders:', pendingOrders);
    console.log('  - confirmedOrders:', confirmedOrders);
    console.log('  - dispatchedOrders:', dispatchedOrders);
    console.log('  - completedOrders:', completedOrders);
    console.log('  - ordersToday:', ordersToday);
    console.log('  - ordersThisWeek:', ordersThisWeek);
    console.log('  - ordersThisMonth:', ordersThisMonth);
    console.log('  - totalRevenue:', totalRevenue);
    console.log('  - averageOrderValue:', averageOrderValue);
    console.log('');

    // Now test the actual API endpoint
    console.log('🌐 Testing API Endpoint...');
    
    // Try to login first
    let token = null;
    try {
      // Try common test credentials
      const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
        email: user.email,
        password: 'password123' // Common default password
      });
      
      if (loginResponse.data.token) {
        token = loginResponse.data.token;
        console.log('✅ Login successful');
      }
    } catch (loginError) {
      console.log('⚠️  Could not login automatically. Trying with existing token...');
      token = process.env.TEST_TOKEN || null;
    }
    
    if (!token) {
      console.log('⚠️  Skipping API test - No token available.');
      console.log('   Set TEST_TOKEN environment variable or ensure login works.');
      await prisma.$disconnect();
      return;
    }

    try {
      const response = await axios.get('http://localhost:5000/api/order/stats/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('✅ API Response Status:', response.status);
      console.log('📊 API Response Data:');
      console.log(JSON.stringify(response.data, null, 2));
      
      if (response.data.stats) {
        console.log('\n📈 API Stats Breakdown:');
        console.log('  - totalOrders:', response.data.stats.totalOrders);
        console.log('  - pendingOrders:', response.data.stats.pendingOrders);
        console.log('  - confirmedOrders:', response.data.stats.confirmedOrders);
        console.log('  - dispatchedOrders:', response.data.stats.dispatchedOrders);
        console.log('  - completedOrders:', response.data.stats.completedOrders);
        console.log('  - totalRevenue:', response.data.stats.totalRevenue);
        console.log('  - averageOrderValue:', response.data.stats.averageOrderValue);
        console.log('  - ordersToday:', response.data.stats.ordersToday);
        console.log('  - ordersThisWeek:', response.data.stats.ordersThisWeek);
        console.log('  - ordersThisMonth:', response.data.stats.ordersThisMonth);
        
        console.log('\n🔍 Comparison:');
        console.log('  Database vs API:');
        console.log(`    totalOrders: ${totalOrders} vs ${response.data.stats.totalOrders} ${totalOrders === response.data.stats.totalOrders ? '✅' : '❌'}`);
        console.log(`    totalRevenue: ${totalRevenue} vs ${response.data.stats.totalRevenue} ${Math.abs(totalRevenue - response.data.stats.totalRevenue) < 0.01 ? '✅' : '❌'}`);
        console.log(`    pendingOrders: ${pendingOrders} vs ${response.data.stats.pendingOrders} ${pendingOrders === response.data.stats.pendingOrders ? '✅' : '❌'}`);
      } else {
        console.log('⚠️  No stats object in API response!');
        console.log('   Response keys:', Object.keys(response.data));
      }
    } catch (apiError) {
      console.error('❌ API Error:', apiError.message);
      if (apiError.response) {
        console.error('   Status:', apiError.response.status);
        console.error('   Data:', apiError.response.data);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testDashboardStats();
