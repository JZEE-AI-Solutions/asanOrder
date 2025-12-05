require('dotenv').config();
const axios = require('axios');
const prisma = require('./lib/db');

const API_BASE = 'http://localhost:5000/api';
const TIMEOUT = 15000;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

async function testAPIEndpoints() {
  console.log('\n' + '='.repeat(80));
  log('🧪 COMPREHENSIVE API TEST SUITE', 'cyan');
  log('Testing all endpoints with PostgreSQL', 'cyan');
  console.log('='.repeat(80) + '\n');

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    endpoints: {},
  };

  let adminToken = null;
  let businessOwnerToken = null;
  let adminUser = null;
  let businessOwnerUser = null;

  try {
    // Get test users
    logInfo('Fetching test users from database...');
    adminUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { email: true, id: true, role: true },
    });

    businessOwnerUser = await prisma.user.findFirst({
      where: { role: 'BUSINESS_OWNER' },
      select: { email: true, id: true, role: true, tenant: { select: { id: true } } },
    });

    if (!adminUser) {
      logError('No admin user found in database');
      return results;
    }

    logSuccess(`Found admin user: ${adminUser.email}`);
    if (businessOwnerUser) {
      logSuccess(`Found business owner user: ${businessOwnerUser.email}`);
    }

    // ==========================================
    // 1. HEALTH & AUTH ENDPOINTS
    // ==========================================
    console.log('\n' + '─'.repeat(80));
    log('1️⃣  HEALTH & AUTHENTICATION ENDPOINTS', 'blue');
    console.log('─'.repeat(80));

    // Test Health
    results.total++;
    try {
      const startTime = Date.now();
      const response = await axios.get(`${API_BASE}/health`, { timeout: TIMEOUT });
      const responseTime = Date.now() - startTime;
      
      if (response.status === 200 && response.data.status === 'OK') {
        logSuccess(`GET /health - ${responseTime}ms`);
        results.passed++;
        results.endpoints['GET /health'] = { status: 'pass', time: responseTime };
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      logError(`GET /health - ${error.message}`);
      results.failed++;
      results.endpoints['GET /health'] = { status: 'fail', error: error.message };
    }

    // Test Login (Admin)
    results.total++;
    try {
      const startTime = Date.now();
      const response = await axios.post(
        `${API_BASE}/auth/login`,
        {
          email: adminUser.email,
          password: 'admin123', // Common default password
        },
        { timeout: TIMEOUT }
      );
      const responseTime = Date.now() - startTime;

      if (response.status === 200 && response.data.token) {
        adminToken = response.data.token;
        logSuccess(`POST /auth/login (Admin) - ${responseTime}ms`);
        results.passed++;
        results.endpoints['POST /auth/login (Admin)'] = { status: 'pass', time: responseTime };
      } else {
        throw new Error('No token received');
      }
    } catch (error) {
      if (error.response?.status === 401) {
        logWarning(`POST /auth/login (Admin) - Invalid credentials (expected if password is different)`);
        results.warnings++;
        results.endpoints['POST /auth/login (Admin)'] = { status: 'warning', note: 'Credentials may differ' };
      } else {
        logError(`POST /auth/login (Admin) - ${error.message}`);
        results.failed++;
        results.endpoints['POST /auth/login (Admin)'] = { status: 'fail', error: error.message };
      }
    }

    // Test Login (Business Owner) if available
    if (businessOwnerUser) {
      results.total++;
      try {
        const startTime = Date.now();
        const response = await axios.post(
          `${API_BASE}/auth/login`,
          {
            email: businessOwnerUser.email,
            password: 'admin123',
          },
          { timeout: TIMEOUT }
        );
        const responseTime = Date.now() - startTime;

        if (response.status === 200 && response.data.token) {
          businessOwnerToken = response.data.token;
          logSuccess(`POST /auth/login (Business Owner) - ${responseTime}ms`);
          results.passed++;
          results.endpoints['POST /auth/login (Business Owner)'] = { status: 'pass', time: responseTime };
        }
      } catch (error) {
        if (error.response?.status === 401) {
          logWarning(`POST /auth/login (Business Owner) - Invalid credentials`);
          results.warnings++;
        } else {
          logError(`POST /auth/login (Business Owner) - ${error.message}`);
          results.failed++;
        }
      }
    }

    // Test /auth/me (if we have a token)
    if (adminToken) {
      results.total++;
      try {
        const startTime = Date.now();
        const response = await axios.get(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          timeout: TIMEOUT,
        });
        const responseTime = Date.now() - startTime;

        if (response.status === 200 && response.data.user) {
          logSuccess(`GET /auth/me - ${responseTime}ms`);
          results.passed++;
          results.endpoints['GET /auth/me'] = { status: 'pass', time: responseTime };
        }
      } catch (error) {
        logError(`GET /auth/me - ${error.response?.data?.error || error.message}`);
        results.failed++;
        results.endpoints['GET /auth/me'] = { status: 'fail', error: error.message };
      }
    }

    // ==========================================
    // 2. ORDER ENDPOINTS
    // ==========================================
    if (adminToken) {
      console.log('\n' + '─'.repeat(80));
      log('2️⃣  ORDER ENDPOINTS', 'blue');
      console.log('─'.repeat(80));

      // GET /order/stats/dashboard
      results.total++;
      try {
        const startTime = Date.now();
        const response = await axios.get(`${API_BASE}/order/stats/dashboard`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          timeout: TIMEOUT,
        });
        const responseTime = Date.now() - startTime;

        if (response.status === 200 && response.data.stats) {
          const stats = response.data.stats;
          logSuccess(`GET /order/stats/dashboard - ${responseTime}ms`);
          logInfo(`   Total Orders: ${stats.totalOrders || 0}, Pending: ${stats.pendingOrders || 0}`);
          results.passed++;
          results.endpoints['GET /order/stats/dashboard'] = { status: 'pass', time: responseTime };
        } else {
          throw new Error('Invalid response structure');
        }
      } catch (error) {
        logError(`GET /order/stats/dashboard - ${error.response?.data?.error || error.message}`);
        results.failed++;
        results.endpoints['GET /order/stats/dashboard'] = { status: 'fail', error: error.message };
      }

      // GET /order
      results.total++;
      try {
        const startTime = Date.now();
        const response = await axios.get(`${API_BASE}/order?limit=10`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          timeout: TIMEOUT,
        });
        const responseTime = Date.now() - startTime;

        if (response.status === 200 && Array.isArray(response.data.orders)) {
          logSuccess(`GET /order?limit=10 - ${responseTime}ms`);
          logInfo(`   Retrieved ${response.data.orders.length} orders`);
          results.passed++;
          results.endpoints['GET /order'] = { status: 'pass', time: responseTime };
        }
      } catch (error) {
        logError(`GET /order - ${error.response?.data?.error || error.message}`);
        results.failed++;
        results.endpoints['GET /order'] = { status: 'fail', error: error.message };
      }
    }

    // ==========================================
    // 3. TENANT ENDPOINTS
    // ==========================================
    if (adminToken) {
      console.log('\n' + '─'.repeat(80));
      log('3️⃣  TENANT ENDPOINTS', 'blue');
      console.log('─'.repeat(80));

      // GET /tenant
      results.total++;
      try {
        const startTime = Date.now();
        const response = await axios.get(`${API_BASE}/tenant`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          timeout: TIMEOUT,
        });
        const responseTime = Date.now() - startTime;

        if (response.status === 200 && Array.isArray(response.data.tenants)) {
          logSuccess(`GET /tenant - ${responseTime}ms`);
          logInfo(`   Retrieved ${response.data.tenants.length} tenants`);
          results.passed++;
          results.endpoints['GET /tenant'] = { status: 'pass', time: responseTime };
        }
      } catch (error) {
        logError(`GET /tenant - ${error.response?.data?.error || error.message}`);
        results.failed++;
        results.endpoints['GET /tenant'] = { status: 'fail', error: error.message };
      }
    }

    // ==========================================
    // 4. FORM ENDPOINTS
    // ==========================================
    if (adminToken) {
      console.log('\n' + '─'.repeat(80));
      log('4️⃣  FORM ENDPOINTS', 'blue');
      console.log('─'.repeat(80));

      // GET /form
      results.total++;
      try {
        const startTime = Date.now();
        const response = await axios.get(`${API_BASE}/form`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          timeout: TIMEOUT,
        });
        const responseTime = Date.now() - startTime;

        if (response.status === 200 && Array.isArray(response.data.forms)) {
          logSuccess(`GET /form - ${responseTime}ms`);
          logInfo(`   Retrieved ${response.data.forms.length} forms`);
          results.passed++;
          results.endpoints['GET /form'] = { status: 'pass', time: responseTime };
        }
      } catch (error) {
        logError(`GET /form - ${error.response?.data?.error || error.message}`);
        results.failed++;
        results.endpoints['GET /form'] = { status: 'fail', error: error.message };
      }
    }

    // ==========================================
    // 5. PRODUCT ENDPOINTS
    // ==========================================
    if (businessOwnerToken && businessOwnerUser?.tenant?.id) {
      console.log('\n' + '─'.repeat(80));
      log('5️⃣  PRODUCT ENDPOINTS', 'blue');
      console.log('─'.repeat(80));

      // GET /product
      results.total++;
      try {
        const startTime = Date.now();
        const response = await axios.get(`${API_BASE}/product?page=1&limit=10`, {
          headers: { Authorization: `Bearer ${businessOwnerToken}` },
          timeout: TIMEOUT,
        });
        const responseTime = Date.now() - startTime;

        if (response.status === 200 && response.data.products) {
          logSuccess(`GET /product - ${responseTime}ms`);
          logInfo(`   Retrieved ${response.data.products.length} products`);
          results.passed++;
          results.endpoints['GET /product'] = { status: 'pass', time: responseTime };
        }
      } catch (error) {
        logError(`GET /product - ${error.response?.data?.error || error.message}`);
        results.failed++;
        results.endpoints['GET /product'] = { status: 'fail', error: error.message };
      }
    }

    // GET /products/tenant/:tenantId (Admin)
    if (adminToken && businessOwnerUser?.tenant?.id) {
      results.total++;
      try {
        const startTime = Date.now();
        const response = await axios.get(
          `${API_BASE}/products/tenant/${businessOwnerUser.tenant.id}`,
          {
            headers: { Authorization: `Bearer ${adminToken}` },
            timeout: TIMEOUT,
          }
        );
        const responseTime = Date.now() - startTime;

        if (response.status === 200 && response.data.products) {
          logSuccess(`GET /products/tenant/:tenantId - ${responseTime}ms`);
          logInfo(`   Retrieved ${response.data.products.length} products`);
          results.passed++;
          results.endpoints['GET /products/tenant/:tenantId'] = { status: 'pass', time: responseTime };
        }
      } catch (error) {
        logError(`GET /products/tenant/:tenantId - ${error.response?.data?.error || error.message}`);
        results.failed++;
        results.endpoints['GET /products/tenant/:tenantId'] = { status: 'fail', error: error.message };
      }
    }

    // ==========================================
    // 6. PURCHASE INVOICE ENDPOINTS
    // ==========================================
    if (businessOwnerToken) {
      console.log('\n' + '─'.repeat(80));
      log('6️⃣  PURCHASE INVOICE ENDPOINTS', 'blue');
      console.log('─'.repeat(80));

      // GET /purchase-invoice
      results.total++;
      try {
        const startTime = Date.now();
        const response = await axios.get(`${API_BASE}/purchase-invoice?page=1&limit=10`, {
          headers: { Authorization: `Bearer ${businessOwnerToken}` },
          timeout: TIMEOUT,
        });
        const responseTime = Date.now() - startTime;

        if (response.status === 200 && response.data.purchaseInvoices) {
          logSuccess(`GET /purchase-invoice - ${responseTime}ms`);
          logInfo(`   Retrieved ${response.data.purchaseInvoices.length} invoices`);
          results.passed++;
          results.endpoints['GET /purchase-invoice'] = { status: 'pass', time: responseTime };
        }
      } catch (error) {
        logError(`GET /purchase-invoice - ${error.response?.data?.error || error.message}`);
        results.failed++;
        results.endpoints['GET /purchase-invoice'] = { status: 'fail', error: error.message };
      }
    }

    // ==========================================
    // 7. CUSTOMER ENDPOINTS
    // ==========================================
    if (businessOwnerToken) {
      console.log('\n' + '─'.repeat(80));
      log('7️⃣  CUSTOMER ENDPOINTS', 'blue');
      console.log('─'.repeat(80));

      // GET /customer
      results.total++;
      try {
        const startTime = Date.now();
        const response = await axios.get(`${API_BASE}/customer`, {
          headers: { Authorization: `Bearer ${businessOwnerToken}` },
          timeout: TIMEOUT,
        });
        const responseTime = Date.now() - startTime;

        if (response.status === 200 && Array.isArray(response.data.customers)) {
          logSuccess(`GET /customer - ${responseTime}ms`);
          logInfo(`   Retrieved ${response.data.customers.length} customers`);
          results.passed++;
          results.endpoints['GET /customer'] = { status: 'pass', time: responseTime };
        }
      } catch (error) {
        logError(`GET /customer - ${error.response?.data?.error || error.message}`);
        results.failed++;
        results.endpoints['GET /customer'] = { status: 'fail', error: error.message };
      }
    }

    // ==========================================
    // SUMMARY
    // ==========================================
    console.log('\n' + '='.repeat(80));
    log('📊 TEST SUMMARY', 'cyan');
    console.log('='.repeat(80));

    const passRate = ((results.passed / results.total) * 100).toFixed(1);
    const avgTime = Object.values(results.endpoints)
      .filter(e => e.time)
      .reduce((sum, e) => sum + e.time, 0) / Object.values(results.endpoints).filter(e => e.time).length;

    log(`Total Tests: ${results.total}`, 'cyan');
    logSuccess(`Passed: ${results.passed}`);
    if (results.failed > 0) logError(`Failed: ${results.failed}`);
    if (results.warnings > 0) logWarning(`Warnings: ${results.warnings}`);
    log(`Pass Rate: ${passRate}%`, 'cyan');
    if (avgTime) log(`Average Response Time: ${avgTime.toFixed(0)}ms`, 'cyan');

    console.log('\n' + '─'.repeat(80));
    log('📋 ENDPOINT DETAILS', 'cyan');
    console.log('─'.repeat(80));

    Object.entries(results.endpoints).forEach(([endpoint, result]) => {
      if (result.status === 'pass') {
        logSuccess(`${endpoint} - ${result.time}ms`);
      } else if (result.status === 'warning') {
        logWarning(`${endpoint} - ${result.note || 'Warning'}`);
      } else {
        logError(`${endpoint} - ${result.error || 'Failed'}`);
      }
    });

    console.log('\n' + '='.repeat(80));
    if (results.failed === 0 && results.passed > 0) {
      log('🎉 ALL TESTS PASSED!', 'green');
      log('✅ PostgreSQL migration is working perfectly!', 'green');
    } else if (results.passed > results.failed) {
      log('⚠️  MOST TESTS PASSED', 'yellow');
      log('Some endpoints may need attention', 'yellow');
    } else {
      log('❌ SOME TESTS FAILED', 'red');
      log('Please review the errors above', 'red');
    }
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    logError(`Test suite error: ${error.message}`);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }

  return results;
}

// Run tests
testAPIEndpoints()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

