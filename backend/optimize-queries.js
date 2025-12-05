// Query Optimization Examples
// This file shows optimized versions of common queries

const prisma = require('./lib/db')

// ============================================
// OPTIMIZED: Get Orders (Before vs After)
// ============================================

// ❌ BEFORE: Slow - Multiple queries, over-fetching
async function getOrdersSlow(req) {
  const tenant = await prisma.tenant.findUnique({
    where: { ownerId: req.user.id }
  })
  
  const orders = await prisma.order.findMany({
    where: { tenantId: tenant.id },
    include: {
      form: true, // Fetching ALL form fields
      tenant: true, // Fetching ALL tenant fields
      customer: true
    }
  })
  
  // N+1 problem: Fetching customer for each order separately
  for (const order of orders) {
    if (order.customerId) {
      order.customer = await prisma.customer.findUnique({
        where: { id: order.customerId }
      })
    }
  }
  
  return orders
}

// ✅ AFTER: Fast - Single query, selective fields
async function getOrdersFast(req) {
  const pageNum = Math.max(1, parseInt(req.query.page) || 1)
  const limitNum = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10))
  const skipNum = (pageNum - 1) * limitNum
  
  // Use select instead of include to fetch only needed fields
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId: req.user.tenantId }, // Use cached tenantId
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
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
            businessName: true
          }
        },
        customer: {
          select: {
            id: true,
            name: true,
            phoneNumber: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: skipNum,
      take: limitNum
    }),
    prisma.order.count({ where: { tenantId: req.user.tenantId } })
  ])
  
  return { orders, total }
}

// ============================================
// OPTIMIZED: Get Forms (Before vs After)
// ============================================

// ❌ BEFORE: Slow - Fetching all fields and all relations
async function getFormsSlow() {
  return await prisma.form.findMany({
    include: {
      fields: true, // All fields
      tenant: true, // All tenant data
      orders: true // All orders (could be thousands!)
    }
  })
}

// ✅ AFTER: Fast - Selective fields, limited relations
async function getFormsFast(tenantId) {
  return await prisma.form.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      isPublished: true,
      isHidden: true,
      createdAt: true,
      fields: {
        select: {
          id: true,
          label: true,
          fieldType: true,
          isRequired: true,
          order: true
        },
        orderBy: { order: 'asc' }
      },
      tenant: {
        select: {
          id: true,
          businessName: true
        }
      },
      _count: {
        select: {
          orders: true // Just the count, not all orders
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 50 // Always limit results
  })
}

// ============================================
// OPTIMIZED: Stats Query (Before vs After)
// ============================================

// ❌ BEFORE: Slow - Multiple separate queries
async function getStatsSlow(tenantId) {
  const totalOrders = await prisma.order.count({ where: { tenantId } })
  const pendingOrders = await prisma.order.count({ where: { tenantId, status: 'PENDING' } })
  const confirmedOrders = await prisma.order.count({ where: { tenantId, status: 'CONFIRMED' } })
  const dispatchedOrders = await prisma.order.count({ where: { tenantId, status: 'DISPATCHED' } })
  
  return { totalOrders, pendingOrders, confirmedOrders, dispatchedOrders }
}

// ✅ AFTER: Fast - Single query with aggregation
async function getStatsFast(tenantId) {
  // Use Promise.all for parallel execution
  const [totalOrders, statusCounts, recentOrders] = await Promise.all([
    prisma.order.count({ where: { tenantId } }),
    // Single query to get all status counts
    prisma.order.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true
    }),
    prisma.order.findMany({
      where: { tenantId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        form: { select: { name: true } },
        tenant: { select: { businessName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    })
  ])
  
  // Transform grouped results
  const statusMap = {}
  statusCounts.forEach(item => {
    statusMap[item.status] = item._count
  })
  
  return {
    totalOrders,
    pendingOrders: statusMap['PENDING'] || 0,
    confirmedOrders: statusMap['CONFIRMED'] || 0,
    dispatchedOrders: statusMap['DISPATCHED'] || 0,
    recentOrders
  }
}

module.exports = {
  getOrdersFast,
  getFormsFast,
  getStatsFast
}

