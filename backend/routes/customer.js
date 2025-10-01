const express = require('express');
const { body, validationResult } = require('express-validator');
const validator = require('validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const customerService = require('../services/customerService');

const router = express.Router();

// Get all customers for a tenant (Business Owner only)
router.get('/', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      sortBy = 'lastOrderDate', 
      sortOrder = 'desc' 
    } = req.query;

    const result = await customerService.getCustomersByTenant(tenant.id, {
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      sortBy,
      sortOrder
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Failed to get customers' });
  }
});

// Create new customer (Business Owner only)
router.post('/', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('phoneNumber').trim().isLength({ min: 10 }).withMessage('Phone number must be at least 10 characters'),
  body('email').optional().custom((value) => {
    if (value && value.trim() !== '') {
      return validator.isEmail(value);
    }
    return true;
  }),
  body('address').optional().trim(),
  body('shippingAddress').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('country').optional().trim(),
  body('postalCode').optional().trim(),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const customerData = req.body;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if phone number already exists
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        phoneNumber: customerData.phoneNumber,
        tenantId: tenant.id
      }
    });

    if (existingCustomer) {
      return res.status(400).json({ 
        error: 'Phone number already exists for another customer' 
      });
    }

    // Create customer
    const customer = await prisma.customer.create({
      data: {
        ...customerData,
        tenantId: tenant.id,
        totalOrders: 0,
        totalSpent: 0,
        isActive: true
      }
    });

    // Log the creation
    await customerService.logCustomerAction(
      customer.id,
      'CREATED',
      null,
      null,
      null,
      'Customer created manually'
    );

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      customer
    });

  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Get customer by ID (Business Owner only)
router.get('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const customer = await customerService.getCustomerById(id, tenant.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({
      success: true,
      customer
    });

  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Failed to get customer' });
  }
});

// Update customer (Business Owner only)
router.put('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('name').optional().trim(),
  body('email').optional().custom((value) => {
    if (value && value.trim() !== '') {
      return validator.isEmail(value);
    }
    return true;
  }),
  body('phoneNumber').optional().trim(),
  body('address').optional().trim(),
  body('shippingAddress').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('country').optional().trim(),
  body('postalCode').optional().trim(),
  body('notes').optional().trim(),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check if phone number is being updated and if it's unique
    if (updateData.phoneNumber) {
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          phoneNumber: updateData.phoneNumber,
          tenantId: tenant.id,
          id: { not: id }
        }
      });

      if (existingCustomer) {
        return res.status(400).json({ 
          error: 'Phone number already exists for another customer' 
        });
      }
    }

    const customer = await customerService.updateCustomer(id, tenant.id, updateData);

    res.json({
      success: true,
      message: 'Customer updated successfully',
      customer
    });

  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Delete customer (soft delete) (Business Owner only)
router.delete('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: tenant.id }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Soft delete customer
    const deletedCustomer = await prisma.customer.update({
      where: { id },
      data: { isActive: false }
    });

    // Log the deletion
    await customerService.logCustomerAction(
      id,
      'DELETED',
      null,
      null,
      null,
      'Customer soft deleted'
    );

    res.json({
      success: true,
      message: 'Customer deleted successfully',
      customer: deletedCustomer
    });

  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Restore customer (Business Owner only)
router.patch('/:id/restore', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: tenant.id }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Restore customer
    const restoredCustomer = await prisma.customer.update({
      where: { id },
      data: { isActive: true }
    });

    // Log the restoration
    await customerService.logCustomerAction(
      id,
      'RESTORED',
      null,
      null,
      null,
      'Customer restored'
    );

    res.json({
      success: true,
      message: 'Customer restored successfully',
      customer: restoredCustomer
    });

  } catch (error) {
    console.error('Restore customer error:', error);
    res.status(500).json({ error: 'Failed to restore customer' });
  }
});

// Bulk update customers (Business Owner only)
router.patch('/bulk/update', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('customerIds').isArray({ min: 1 }).withMessage('Customer IDs must be an array with at least one item'),
  body('updateData').isObject().withMessage('Update data must be an object'),
  body('updateData.isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { customerIds, updateData } = req.body;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify all customers belong to tenant
    const customers = await prisma.customer.findMany({
      where: {
        id: { in: customerIds },
        tenantId: tenant.id
      }
    });

    if (customers.length !== customerIds.length) {
      return res.status(400).json({ 
        error: 'Some customers not found or do not belong to your tenant' 
      });
    }

    // Update customers
    const updateResult = await prisma.customer.updateMany({
      where: {
        id: { in: customerIds },
        tenantId: tenant.id
      },
      data: updateData
    });

    // Log bulk update for each customer
    for (const customerId of customerIds) {
      await customerService.logCustomerAction(
        customerId,
        'BULK_UPDATED',
        null,
        null,
        null,
        `Customer updated in bulk operation: ${JSON.stringify(updateData)}`
      );
    }

    res.json({
      success: true,
      message: `${updateResult.count} customers updated successfully`,
      updatedCount: updateResult.count
    });

  } catch (error) {
    console.error('Bulk update customers error:', error);
    res.status(500).json({ error: 'Failed to bulk update customers' });
  }
});

// Bulk delete customers (Business Owner only)
router.delete('/bulk/delete', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('customerIds').isArray({ min: 1 }).withMessage('Customer IDs must be an array with at least one item')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    const { customerIds } = req.body;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify all customers belong to tenant
    const customers = await prisma.customer.findMany({
      where: {
        id: { in: customerIds },
        tenantId: tenant.id
      }
    });

    if (customers.length !== customerIds.length) {
      return res.status(400).json({ 
        error: 'Some customers not found or do not belong to your tenant' 
      });
    }

    // Soft delete customers
    const deleteResult = await prisma.customer.updateMany({
      where: {
        id: { in: customerIds },
        tenantId: tenant.id
      },
      data: { isActive: false }
    });

    // Log bulk deletion for each customer
    for (const customerId of customerIds) {
      await customerService.logCustomerAction(
        customerId,
        'BULK_DELETED',
        null,
        null,
        null,
        'Customer deleted in bulk operation'
      );
    }

    res.json({
      success: true,
      message: `${deleteResult.count} customers deleted successfully`,
      deletedCount: deleteResult.count
    });

  } catch (error) {
    console.error('Bulk delete customers error:', error);
    res.status(500).json({ error: 'Failed to bulk delete customers' });
  }
});

// Get customer statistics (Business Owner only)
router.get('/stats/overview', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const stats = await customerService.getCustomerStats(tenant.id);

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Get customer stats error:', error);
    res.status(500).json({ error: 'Failed to get customer statistics' });
  }
});

// Get customer logs (Business Owner only)
router.get('/:id/logs', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: tenant.id }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const logs = await prisma.customerLog.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit)
    });

    const total = await prisma.customerLog.count({
      where: { customerId: id }
    });

    res.json({
      success: true,
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get customer logs error:', error);
    res.status(500).json({ error: 'Failed to get customer logs' });
  }
});

// Search customers (Business Owner only)
router.get('/search/:query', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { query } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const customers = await prisma.customer.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { phoneNumber: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } }
        ]
      },
      orderBy: { lastOrderDate: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        totalOrders: true,
        totalSpent: true,
        lastOrderDate: true
      }
    });

    res.json({
      success: true,
      customers
    });

  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({ error: 'Failed to search customers' });
  }
});

// Get customer orders (Business Owner only)
router.get('/:id/orders', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify customer belongs to tenant
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId: tenant.id }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const orders = await prisma.order.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      include: {
        form: {
          select: {
            name: true,
            formLink: true
          }
        }
      }
    });

    const total = await prisma.order.count({
      where: { customerId: id }
    });

    res.json({
      success: true,
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get customer orders error:', error);
    res.status(500).json({ error: 'Failed to get customer orders' });
  }
});

// Export customers to CSV (Business Owner only)
router.get('/export/csv', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { search = '', includeInactive = false } = req.query;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Build where clause
    const where = {
      tenantId: tenant.id,
      ...(includeInactive === 'false' && { isActive: true }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phoneNumber: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    // Get all customers
    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        address: true,
        shippingAddress: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
        totalOrders: true,
        totalSpent: true,
        lastOrderDate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Generate CSV content
    const headers = [
      'ID', 'Name', 'Phone Number', 'Email', 'Address', 'Shipping Address',
      'City', 'State', 'Country', 'Postal Code', 'Total Orders', 'Total Spent',
      'Last Order Date', 'Status', 'Created At', 'Updated At'
    ];

    const csvRows = customers.map(customer => [
      customer.id,
      customer.name || '',
      customer.phoneNumber || '',
      customer.email || '',
      customer.address || '',
      customer.shippingAddress || '',
      customer.city || '',
      customer.state || '',
      customer.country || '',
      customer.postalCode || '',
      customer.totalOrders || 0,
      customer.totalSpent || 0,
      customer.lastOrderDate ? customer.lastOrderDate.toISOString() : '',
      customer.isActive ? 'Active' : 'Inactive',
      customer.createdAt.toISOString(),
      customer.updatedAt.toISOString()
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...csvRows.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Set response headers
    const filename = `customers_export_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(csvContent);

  } catch (error) {
    console.error('Export customers CSV error:', error);
    res.status(500).json({ error: 'Failed to export customers' });
  }
});

// Get customer analytics (Business Owner only)
router.get('/analytics/overview', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const days = parseInt(period);

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get customer analytics
    const [
      totalCustomers,
      activeCustomers,
      newCustomers,
      topCustomers,
      customerGrowth
    ] = await Promise.all([
      // Total customers
      prisma.customer.count({
        where: { tenantId: tenant.id }
      }),
      // Active customers
      prisma.customer.count({
        where: { tenantId: tenant.id, isActive: true }
      }),
      // New customers in period
      prisma.customer.count({
        where: {
          tenantId: tenant.id,
          createdAt: { gte: startDate }
        }
      }),
      // Top customers by total spent
      prisma.customer.findMany({
        where: { tenantId: tenant.id, isActive: true },
        orderBy: { totalSpent: 'desc' },
        take: 10,
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          totalOrders: true,
          totalSpent: true
        }
      }),
      // Customer growth over time
      prisma.customer.groupBy({
        by: ['createdAt'],
        where: {
          tenantId: tenant.id,
          createdAt: { gte: startDate }
        },
        _count: { id: true },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    res.json({
      success: true,
      analytics: {
        totalCustomers,
        activeCustomers,
        inactiveCustomers: totalCustomers - activeCustomers,
        newCustomers,
        topCustomers,
        customerGrowth: customerGrowth.map(item => ({
          date: item.createdAt.toISOString().split('T')[0],
          count: item._count.id
        }))
      }
    });

  } catch (error) {
    console.error('Get customer analytics error:', error);
    res.status(500).json({ error: 'Failed to get customer analytics' });
  }
});

module.exports = router;
