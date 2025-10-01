const express = require('express');
const { body, validationResult } = require('express-validator');
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
  body('email').optional().isEmail(),
  body('phoneNumber').optional().trim(),
  body('address').optional().trim(),
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

module.exports = router;
