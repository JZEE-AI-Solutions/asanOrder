require('dotenv').config()
const prisma = require('./lib/db')

async function testEndpoints() {
  console.log('🧪 Testing Database Queries Directly\n')
  console.log('='.repeat(60))

  try {
    // Test 1: Forms query
    console.log('\n📋 Test 1: Forms Query')
    console.log('-'.repeat(60))
    try {
      const forms = await prisma.form.findMany({
        where: {},
        include: {
          fields: {
            orderBy: [
              { order: 'asc' },
              { createdAt: 'asc' }
            ]
          },
          tenant: {
            select: {
              id: true,
              businessName: true,
              businessType: true
            }
          },
          _count: {
            select: {
              orders: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 5
      })
      console.log(`✅ Forms query successful: Found ${forms.length} forms`)
    } catch (error) {
      console.error('❌ Forms query failed:', error.message)
      console.error('Error code:', error.code)
      console.error('Error meta:', error.meta)
    }

    // Test 2: Orders query
    console.log('\n📦 Test 2: Orders Query')
    console.log('-'.repeat(60))
    try {
      const orders = await prisma.order.findMany({
        where: {},
        include: {
          form: {
            select: {
              id: true,
              name: true,
              formLink: true
            }
          },
          tenant: {
            select: {
              id: true,
              businessName: true,
              businessType: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 5
      })
      console.log(`✅ Orders query successful: Found ${orders.length} orders`)
    } catch (error) {
      console.error('❌ Orders query failed:', error.message)
      console.error('Error code:', error.code)
      console.error('Error meta:', error.meta)
    }

    // Test 3: Stats query
    console.log('\n📊 Test 3: Stats Query')
    console.log('-'.repeat(60))
    try {
      const [totalOrders, pendingOrders, recentOrders] = await Promise.all([
        prisma.order.count({ where: {} }),
        prisma.order.count({ where: { status: 'PENDING' } }),
        prisma.order.findMany({
          where: {},
          select: {
            id: true,
            orderNumber: true,
            status: true,
            createdAt: true,
            form: {
              select: {
                name: true
              }
            },
            tenant: {
              select: {
                businessName: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 5
        })
      ])
      console.log(`✅ Stats query successful:`)
      console.log(`   Total orders: ${totalOrders}`)
      console.log(`   Pending orders: ${pendingOrders}`)
      console.log(`   Recent orders: ${recentOrders.length}`)
    } catch (error) {
      console.error('❌ Stats query failed:', error.message)
      console.error('Error code:', error.code)
      console.error('Error meta:', error.meta)
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

testEndpoints()

