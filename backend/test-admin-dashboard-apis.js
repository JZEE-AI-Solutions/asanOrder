require('dotenv').config()
const axios = require('axios')

const API_URL = process.env.API_URL || 'http://localhost:5000'

// Test credentials - update these if needed
const TEST_EMAIL = 'admin@orderms.com'
const TEST_PASSWORD = 'admin123'

async function testAdminDashboardAPIs() {
  console.log('🧪 Testing Admin Dashboard APIs\n')
  console.log('='.repeat(70))

  // Step 0: Check server health
  console.log('\n🏥 Step 0: Server Health Check')
  console.log('-'.repeat(70))
  try {
    const healthResponse = await axios.get(`${API_URL}/api/health`, {
      timeout: 5000
    })
    console.log('✅ Server is running')
    console.log(`   Status: ${healthResponse.data.status}`)
  } catch (error) {
    console.error('❌ Server is not reachable!')
    console.error(`   URL: ${API_URL}`)
    if (error.code === 'ECONNREFUSED') {
      console.error('   Error: Connection refused - Server is not running')
    } else if (error.code === 'ETIMEDOUT') {
      console.error('   Error: Connection timeout')
    } else {
      console.error(`   Error: ${error.message}`)
    }
    console.error('\n💡 Please start the backend server first:')
    console.error('   cd backend')
    console.error('   node server.js')
    return false
  }

  let token = null
  let allTestsPassed = true

  // Step 1: Login
  console.log('\n📝 Step 1: Login')
  console.log('-'.repeat(70))
  try {
    console.log(`   Attempting login with: ${TEST_EMAIL}`)
    const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    }, {
      timeout: 10000
    })

    if (loginResponse.data.token) {
      token = loginResponse.data.token
      console.log('✅ Login successful')
      console.log(`   User: ${loginResponse.data.user.name} (${loginResponse.data.user.role})`)
      console.log(`   Token: ${token.substring(0, 20)}...`)
    } else {
      console.error('❌ Login failed: No token received')
      return false
    }
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data?.error || error.message)
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error(`   Cannot connect to server at ${API_URL}`)
      console.error('   Make sure the backend server is running!')
    } else if (error.response?.status === 401) {
      console.error('   Invalid credentials. Please check TEST_EMAIL and TEST_PASSWORD in the script.')
    } else if (error.response) {
      console.error(`   Status: ${error.response.status}`)
      console.error(`   Response: ${JSON.stringify(error.response.data, null, 2)}`)
    }
    return false
  }

  if (!token) {
    console.error('❌ Cannot proceed without authentication token')
    return false
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }

  // Step 2: Test Order Stats Endpoint
  console.log('\n📊 Step 2: Order Stats Dashboard')
  console.log('-'.repeat(70))
  try {
    const response = await axios.get(`${API_URL}/api/order/stats/dashboard`, {
      headers,
      timeout: 10000
    })

    console.log('✅ Stats endpoint successful')
    console.log(`   Status Code: ${response.status}`)
    if (response.data.stats) {
      console.log(`   Total Orders: ${response.data.stats.totalOrders || 0}`)
      console.log(`   Pending Orders: ${response.data.stats.pendingOrders || 0}`)
      console.log(`   Confirmed Orders: ${response.data.stats.confirmedOrders || 0}`)
      console.log(`   Dispatched Orders: ${response.data.stats.dispatchedOrders || 0}`)
    }
    if (response.data.recentOrders) {
      console.log(`   Recent Orders Count: ${response.data.recentOrders.length || 0}`)
    }
  } catch (error) {
    console.error('❌ Stats endpoint failed:', error.response?.data?.error || error.message)
    if (error.response?.data?.message) {
      console.error(`   Details: ${error.response.data.message}`)
    }
    allTestsPassed = false
  }

  // Step 3: Test Tenants Endpoint
  console.log('\n👥 Step 3: Tenants List')
  console.log('-'.repeat(70))
  try {
    const response = await axios.get(`${API_URL}/api/tenant`, {
      headers,
      timeout: 10000
    })

    console.log('✅ Tenants endpoint successful')
    console.log(`   Status Code: ${response.status}`)
    if (response.data.tenants) {
      console.log(`   Tenants Count: ${response.data.tenants.length}`)
      if (response.data.tenants.length > 0) {
        console.log(`   First Tenant: ${response.data.tenants[0].businessName}`)
        console.log(`   Has Owner: ${!!response.data.tenants[0].owner}`)
        console.log(`   Forms Count: ${response.data.tenants[0]._count?.forms || 0}`)
        console.log(`   Orders Count: ${response.data.tenants[0]._count?.orders || 0}`)
      }
    }
  } catch (error) {
    console.error('❌ Tenants endpoint failed:', error.response?.data?.error || error.message)
    if (error.response?.data?.message) {
      console.error(`   Details: ${error.response.data.message}`)
    }
    allTestsPassed = false
  }

  // Step 4: Test Forms Endpoint
  console.log('\n📋 Step 4: Forms List')
  console.log('-'.repeat(70))
  try {
    const response = await axios.get(`${API_URL}/api/form`, {
      headers,
      timeout: 10000
    })

    console.log('✅ Forms endpoint successful')
    console.log(`   Status Code: ${response.status}`)
    if (response.data.forms) {
      console.log(`   Forms Count: ${response.data.forms.length}`)
      if (response.data.forms.length > 0) {
        const firstForm = response.data.forms[0]
        console.log(`   First Form: ${firstForm.name}`)
        console.log(`   Has Tenant: ${!!firstForm.tenant}`)
        console.log(`   Fields Count: ${firstForm.fields?.length || 0}`)
        console.log(`   Orders Count: ${firstForm._count?.orders || 0}`)
        console.log(`   Is Published: ${firstForm.isPublished}`)
        console.log(`   Is Hidden: ${firstForm.isHidden}`)
      }
    }
  } catch (error) {
    console.error('❌ Forms endpoint failed:', error.response?.data?.error || error.message)
    if (error.response?.data?.message) {
      console.error(`   Details: ${error.response.data.message}`)
    }
    if (error.response?.status === 500) {
      console.error('   This is a server error. Check server logs for details.')
    }
    allTestsPassed = false
  }

  // Step 5: Test Orders Endpoint
  console.log('\n📦 Step 5: Orders List')
  console.log('-'.repeat(70))
  try {
    const response = await axios.get(`${API_URL}/api/order?limit=10`, {
      headers,
      timeout: 10000
    })

    console.log('✅ Orders endpoint successful')
    console.log(`   Status Code: ${response.status}`)
    if (response.data.orders) {
      console.log(`   Orders Count: ${response.data.orders.length}`)
      if (response.data.orders.length > 0) {
        const firstOrder = response.data.orders[0]
        console.log(`   First Order: ${firstOrder.orderNumber}`)
        console.log(`   Status: ${firstOrder.status}`)
        console.log(`   Has Form: ${!!firstOrder.form}`)
        console.log(`   Has Tenant: ${!!firstOrder.tenant}`)
        if (firstOrder.form) {
          console.log(`   Form Name: ${firstOrder.form.name}`)
        }
        if (firstOrder.tenant) {
          console.log(`   Tenant: ${firstOrder.tenant.businessName}`)
        }
      }
    }
    if (response.data.pagination) {
      console.log(`   Total: ${response.data.pagination.total}`)
      console.log(`   Page: ${response.data.pagination.page}`)
      console.log(`   Pages: ${response.data.pagination.pages}`)
    }
  } catch (error) {
    console.error('❌ Orders endpoint failed:', error.response?.data?.error || error.message)
    if (error.response?.data?.message) {
      console.error(`   Details: ${error.response.data.message}`)
    }
    if (error.response?.status === 500) {
      console.error('   This is a server error. Check server logs for details.')
    }
    allTestsPassed = false
  }

  // Step 6: Test Auth Me Endpoint (verify token still works)
  console.log('\n🔐 Step 6: Verify Authentication')
  console.log('-'.repeat(70))
  try {
    const response = await axios.get(`${API_URL}/api/auth/me`, {
      headers,
      timeout: 10000
    })

    console.log('✅ Auth verification successful')
    console.log(`   Status Code: ${response.status}`)
    if (response.data.user) {
      console.log(`   User: ${response.data.user.name}`)
      console.log(`   Role: ${response.data.user.role}`)
      console.log(`   Email: ${response.data.user.email}`)
    }
  } catch (error) {
    console.error('❌ Auth verification failed:', error.response?.data?.error || error.message)
    allTestsPassed = false
  }

  // Summary
  console.log('\n' + '='.repeat(70))
  console.log('\n📋 Test Summary')
  console.log('-'.repeat(70))
  
  if (allTestsPassed) {
    console.log('✅ All admin dashboard APIs are working correctly!')
    console.log('\n💡 The dashboard should load without errors.')
  } else {
    console.log('❌ Some API tests failed. Please review the errors above.')
    console.log('\n💡 Check:')
    console.log('   1. Backend server is running')
    console.log('   2. Database connection is working')
    console.log('   3. Server logs for detailed error messages')
  }

  return allTestsPassed
}

// Run tests
testAdminDashboardAPIs()
  .then((success) => {
    process.exit(success ? 0 : 1)
  })
  .catch((error) => {
    console.error('\n❌ Test script error:', error.message)
    process.exit(1)
  })

