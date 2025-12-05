require('dotenv').config()
const axios = require('axios')

const API_URL = process.env.API_URL || 'http://localhost:5000'

// You'll need to provide a valid JWT token from a successful login
const testAdminEndpoints = async (token) => {
  console.log('🧪 Testing Admin Dashboard API Endpoints\n')
  console.log('='.repeat(60))

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }

  const endpoints = [
    { name: 'Order Stats', url: '/api/order/stats/dashboard', method: 'GET' },
    { name: 'Tenants', url: '/api/tenant', method: 'GET' },
    { name: 'Forms', url: '/api/form', method: 'GET' },
    { name: 'Orders', url: '/api/order?limit=10', method: 'GET' }
  ]

  for (const endpoint of endpoints) {
    console.log(`\n📊 Testing: ${endpoint.name}`)
    console.log(`   ${endpoint.method} ${endpoint.url}`)
    console.log('-'.repeat(60))
    
    try {
      const response = await axios({
        method: endpoint.method,
        url: `${API_URL}${endpoint.url}`,
        headers,
        timeout: 10000
      })

      console.log(`✅ Status: ${response.status}`)
      console.log(`   Response keys: ${Object.keys(response.data).join(', ')}`)
      
      // Show sample data structure
      if (response.data.stats) {
        console.log(`   Stats: ${JSON.stringify(response.data.stats, null, 2).substring(0, 200)}...`)
      } else if (response.data.tenants) {
        console.log(`   Tenants count: ${response.data.tenants.length}`)
      } else if (response.data.forms) {
        console.log(`   Forms count: ${response.data.forms.length}`)
      } else if (response.data.orders) {
        console.log(`   Orders count: ${response.data.orders.length}`)
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`)
      if (error.response) {
        console.error(`   Status: ${error.response.status}`)
        console.error(`   Response: ${JSON.stringify(error.response.data, null, 2)}`)
      } else if (error.request) {
        console.error('   No response received')
      }
    }
  }
}

// If token is provided as command line argument
const token = process.argv[2]

if (!token) {
  console.log('⚠️  No token provided')
  console.log('Usage: node test-admin-endpoints.js <JWT_TOKEN>')
  console.log('\nTo get a token:')
  console.log('1. Login via the frontend or API')
  console.log('2. Copy the token from localStorage or API response')
  console.log('3. Run: node test-admin-endpoints.js <token>')
  process.exit(1)
}

testAdminEndpoints(token)
  .then(() => {
    console.log('\n✅ Testing complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message)
    process.exit(1)
  })

