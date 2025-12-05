require('dotenv').config({ path: './env.production' })
const axios = require('axios')
const prisma = require('./lib/db')

const API_URL = process.env.API_URL || 'http://localhost:5000'

async function validateLoginFlow() {
  console.log('🔍 Validating Login Flow with New Server Connection\n')
  console.log('=' .repeat(60))

  let allTestsPassed = true

  // Test 1: Database Connection
  console.log('\n📊 Test 1: Database Connection')
  console.log('-'.repeat(60))
  try {
    await prisma.$connect()
    console.log('✅ Database connection successful')
    
    // Test a simple query
    const userCount = await prisma.user.count()
    console.log(`✅ Database query successful (Found ${userCount} users)`)
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
    allTestsPassed = false
    return allTestsPassed
  }

  // Test 2: Check if users exist
  console.log('\n👥 Test 2: User Data Availability')
  console.log('-'.repeat(60))
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      },
      take: 5
    })

    if (users.length === 0) {
      console.log('⚠️  No users found in database')
      console.log('   You may need to create a user first using /api/auth/setup-admin')
    } else {
      console.log(`✅ Found ${users.length} user(s):`)
      users.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.email} (${user.role})`)
      })
    }
  } catch (error) {
    console.error('❌ Failed to fetch users:', error.message)
    allTestsPassed = false
  }

  // Test 3: API Health Check
  console.log('\n🏥 Test 3: API Server Health')
  console.log('-'.repeat(60))
  try {
    const response = await axios.get(`${API_URL}/api/health`, {
      timeout: 5000
    })
    console.log('✅ API server is reachable')
    console.log(`   Status: ${response.data.status}`)
  } catch (error) {
    console.error('❌ API server health check failed:', error.message)
    console.log(`   Make sure the server is running on ${API_URL}`)
    allTestsPassed = false
    return allTestsPassed
  }

  // Test 4: Login Endpoint (if we have a test user)
  console.log('\n🔐 Test 4: Login Endpoint')
  console.log('-'.repeat(60))
  try {
    // Try to find a user to test with
    const testUser = await prisma.user.findFirst({
      where: {
        role: {
          in: ['ADMIN', 'BUSINESS_OWNER', 'STOCK_KEEPER']
        }
      }
    })

    if (!testUser) {
      console.log('⚠️  No users available for login test')
      console.log('   Skipping login endpoint test')
    } else {
      console.log(`   Testing with user: ${testUser.email}`)
      
      // Test with invalid credentials first
      try {
        await axios.post(`${API_URL}/api/auth/login`, {
          email: testUser.email,
          password: 'wrongpassword'
        })
        console.error('❌ Login should have failed with wrong password')
        allTestsPassed = false
      } catch (error) {
        if (error.response?.status === 401) {
          console.log('✅ Login correctly rejects invalid password')
        } else {
          console.error('❌ Unexpected error:', error.message)
          allTestsPassed = false
        }
      }

      // Note: We can't test successful login without the actual password
      console.log('⚠️  Cannot test successful login without actual password')
      console.log('   Please test manually with valid credentials')
    }
  } catch (error) {
    console.error('❌ Login endpoint test failed:', error.message)
    allTestsPassed = false
  }

  // Test 5: JWT Token Validation
  console.log('\n🎫 Test 5: JWT Token Structure')
  console.log('-'.repeat(60))
  try {
    // This test requires a valid token, so we'll just check the endpoint exists
    const response = await axios.get(`${API_URL}/api/auth/me`, {
      headers: {
        Authorization: 'Bearer invalid_token'
      },
      validateStatus: () => true // Don't throw on any status
    })

    if (response.status === 401 || response.status === 403) {
      console.log('✅ /auth/me endpoint correctly validates tokens')
      console.log(`   Response: ${response.data.error || 'Token validation working'}`)
    } else {
      console.log(`⚠️  Unexpected response status: ${response.status}`)
    }
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log('✅ /auth/me endpoint correctly rejects invalid tokens')
    } else {
      console.error('❌ JWT validation test failed:', error.message)
      allTestsPassed = false
    }
  }

  // Test 6: Database Query Performance
  console.log('\n⚡ Test 6: Database Query Performance')
  console.log('-'.repeat(60))
  try {
    const startTime = Date.now()
    await prisma.user.findMany({
      take: 10,
      include: {
        tenant: true
      }
    })
    const duration = Date.now() - startTime
    console.log(`✅ Query completed in ${duration}ms`)
    
    if (duration > 5000) {
      console.log('⚠️  Query took longer than expected (>5s)')
    } else if (duration > 2000) {
      console.log('⚠️  Query performance is acceptable but could be better')
    } else {
      console.log('✅ Query performance is good')
    }
  } catch (error) {
    console.error('❌ Database query performance test failed:', error.message)
    allTestsPassed = false
  }

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('\n📋 Validation Summary')
  console.log('-'.repeat(60))
  
  if (allTestsPassed) {
    console.log('✅ All critical tests passed!')
    console.log('\n💡 Next Steps:')
    console.log('   1. Test login manually with valid credentials')
    console.log('   2. Verify user can access protected routes')
    console.log('   3. Check that JWT tokens are working correctly')
  } else {
    console.log('❌ Some tests failed. Please review the errors above.')
  }

  // Cleanup
  await prisma.$disconnect()
  console.log('\n✅ Database connection closed')
  
  return allTestsPassed
}

// Run validation
validateLoginFlow()
  .then((success) => {
    process.exit(success ? 0 : 1)
  })
  .catch((error) => {
    console.error('\n❌ Validation script error:', error)
    process.exit(1)
  })

