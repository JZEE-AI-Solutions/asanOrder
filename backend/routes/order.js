const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { generateOrderNumber } = require('../utils/orderNumberGenerator');
const customerService = require('../services/customerService');

const router = express.Router();

// Submit order (public endpoint)
router.post('/submit', [
  body('formLink').notEmpty(),
  body('formData').isObject()
  // Note: paymentAmount validation removed - it should be based on form field requirements
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { formLink, formData, paymentAmount, images, paymentReceipt, selectedProducts, productQuantities } = req.body;

    // Get form and validate
    const form = await prisma.form.findUnique({
      where: { 
        formLink,
        isPublished: true 
      },
      include: {
        fields: true,
        tenant: {
          select: {
            id: true,
            businessName: true,
            whatsappNumber: true
          }
        }
      }
    });

    if (!form) {
      return res.status(404).json({ error: 'Form not found or not published' });
    }

        // Validate required fields
        const requiredFields = form.fields.filter(field => field.isRequired);
        const missingFields = requiredFields.filter(field => {
          if (field.fieldType === 'FILE_UPLOAD') {
            // For file uploads, check if images array is provided and not empty
            if (field.label.toLowerCase().includes('image') || field.label.toLowerCase().includes('dress')) {
              return !images || images.length === 0;
            }
            // For receipt uploads, they're usually optional or handled separately
            return false;
          } else {
            // For regular fields, check if value exists and is not empty
            const value = formData[field.label];
            return value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '');
          }
        });

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        missingFields: missingFields.map(field => field.label)
      });
    }

    // Extract phone number for customer lookup
    let phoneNumber = null;
    const phoneField = form.fields.find(field => 
      field.fieldType === 'PHONE' || 
      field.label.toLowerCase().includes('phone') ||
      field.label.toLowerCase().includes('mobile') ||
      field.label.toLowerCase().includes('contact')
    );
    
    console.log('Phone field found:', phoneField);
    console.log('Form data keys:', Object.keys(formData));
    
    if (phoneField && formData[phoneField.label]) {
      phoneNumber = formData[phoneField.label].trim();
      console.log('Phone number extracted:', phoneNumber);
    } else {
      console.log('No phone number found in form data');
    }

    // Handle customer creation/update
    let customer = null;
    if (phoneNumber) {
      try {
        customer = await customerService.findOrCreateCustomer(
          phoneNumber, 
          form.tenant.id, 
          { 
            formData: JSON.stringify(formData), // Ensure formData is stringified
            paymentAmount, 
            selectedProducts, 
            productQuantities 
          }
        );
        console.log('Customer created/updated successfully:', customer?.id);
      } catch (error) {
        console.error('Error handling customer:', error);
        // Don't fail the order if customer handling fails, but log the error
        console.error('Customer creation failed, order will be created without customer association');
      }
    } else {
      console.log('No phone number found, skipping customer creation');
    }

    // Generate order number
    const orderNumber = await generateOrderNumber(form.tenant.id);

    // Create order
    const order = await prisma.order.create({
      data: {
        orderNumber: orderNumber,
        formId: form.id,
        tenantId: form.tenant.id,
        customerId: customer ? customer.id : null,
        formData: JSON.stringify(formData),
        paymentAmount: paymentAmount || null,
        images: images ? JSON.stringify(images) : null,
        paymentReceipt: paymentReceipt || null,
        selectedProducts: selectedProducts ? JSON.stringify(selectedProducts) : null,
        productQuantities: productQuantities ? JSON.stringify(productQuantities) : null,
        status: 'PENDING'
      },
      include: {
        form: {
          select: {
            name: true
          }
        },
        tenant: {
          select: {
            businessName: true,
            whatsappNumber: true
          }
        }
      }
    });

    // TODO: Send notification to business owner
    console.log(`New order received for ${form.tenant.businessName}! Notify: ${form.tenant.whatsappNumber}`);

    res.status(201).json({
      message: 'Order submitted successfully',
      order: {
        id: order.id,
        status: order.status,
        createdAt: order.createdAt
      }
    });
  } catch (error) {
    console.error('Submit order error:', error);
    res.status(500).json({ error: 'Failed to submit order' });
  }
});

  // Get orders (Admin, Business Owner, Stock Keeper)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 10, tenantId } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10));
    const skipNum = (pageNum - 1) * limitNum;

    let whereClause = {};

    // Filter based on user role
    // Optimize: Use tenant from authenticated user (already loaded in middleware)
    if (req.user.role === 'BUSINESS_OWNER') {
      if (!req.user.tenant?.id) {
        return res.status(404).json({ error: 'No tenant found for this user' });
      }
      whereClause.tenantId = req.user.tenant.id;
    } else if (req.user.role === 'STOCK_KEEPER') {
      // Stock keeper sees only confirmed orders
      whereClause.status = { in: ['CONFIRMED', 'DISPATCHED'] };
    } else if (req.user.role === 'ADMIN' && tenantId) {
      // Admin can filter by specific tenant
      whereClause.tenantId = tenantId;
    }

    // Filter by status if provided (don't override STOCK_KEEPER filter)
    if (status && status !== 'all' && req.user.role !== 'STOCK_KEEPER') {
      whereClause.status = status.toUpperCase();
    }


    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: whereClause,
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
        skip: skipNum,
        take: limitNum
      }),
      prisma.order.count({ where: whereClause })
    ]);

    res.json({
      orders: orders || [],
      pagination: {
        page: parseInt(page) || 1,
        limit: limitNum,
        total: total || 0,
        pages: Math.ceil((total || 0) / limitNum)
      }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to get orders',
      message: error.message 
    });
  }
});

// Get order details by ID (public endpoint for order receipt)
router.get('/receipt/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        form: {
          select: {
            name: true,
            formLink: true
          }
        },
        tenant: {
          select: {
            id: true,
            businessName: true,
            businessType: true,
            whatsappNumber: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// Get single order
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        form: {
          include: {
            fields: {
              orderBy: { order: 'asc' }
            }
          }
        },
        tenant: {
          select: {
            id: true,
            businessName: true,
            businessType: true,
            whatsappNumber: true,
            ownerId: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check permissions
    if (req.user.role === 'BUSINESS_OWNER' && req.user.id !== order.tenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Parse JSON data
    const parsedOrder = {
      ...order,
      formData: JSON.parse(order.formData),
      images: order.images ? JSON.parse(order.images) : null
    };

    res.json({ order: parsedOrder });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

// Confirm order (Business Owner only)
router.post('/:id/confirm', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            ownerId: true,
            businessName: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check permissions
    if (req.user.id !== order.tenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json({ error: 'Order can only be confirmed from pending status' });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        businessOwnerId: req.user.id
      }
    });

    // TODO: Send notification to stock keeper
    console.log(`Order ${id} confirmed! Notify stock keeper.`);

    res.json({
      message: 'Order confirmed successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Confirm order error:', error);
    res.status(500).json({ error: 'Failed to confirm order' });
  }
});

// Dispatch order (Stock Keeper only)
router.post('/:id/dispatch', authenticateToken, requireRole(['STOCK_KEEPER']), async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'CONFIRMED') {
      return res.status(400).json({ error: 'Order can only be dispatched from confirmed status' });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        status: 'DISPATCHED'
      }
    });

    // TODO: Send notification to business owner and customer
    console.log(`Order ${id} dispatched!`);

    res.json({
      message: 'Order dispatched successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Dispatch order error:', error);
    res.status(500).json({ error: 'Failed to dispatch order' });
  }
});

// Update order (business owner only)
router.put('/:id', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('formData').optional().custom((value) => {
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch (e) {
        throw new Error('Invalid JSON string');
      }
    }
    return true;
  }),
  body('images').optional().custom((value) => {
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch (e) {
        throw new Error('Invalid JSON string');
      }
    }
    return true;
  }),
  body('paymentReceipt').optional().custom((value) => {
    return value === null || typeof value === 'string';
  }),
  body('productQuantities').optional().custom((value) => {
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch (e) {
        throw new Error('Invalid JSON string');
      }
    }
    return true;
  }),
  body('productPrices').optional().custom((value) => {
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch (e) {
        throw new Error('Invalid JSON string');
      }
    }
    return true;
  }),
  body('selectedProducts').optional().custom((value) => {
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch (e) {
        throw new Error('Invalid JSON string');
      }
    }
    return true;
  }),
  body('paymentAmount').optional().custom((value) => {
    return value === null || !isNaN(parseFloat(value));
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { 
      formData, 
      images, 
      paymentReceipt, 
      productQuantities, 
      productPrices, 
      selectedProducts, 
      paymentAmount 
    } = req.body;

    // Check if order exists and belongs to user's tenant
    const existingOrder = await prisma.order.findFirst({
      where: { 
        id,
        form: {
          tenant: {
            ownerId: req.user.id
          }
        }
      }
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Prepare update data
    const updateData = {};
    
    if (formData !== undefined) {
      updateData.formData = typeof formData === 'string' ? formData : JSON.stringify(formData);
    }
    if (images !== undefined) {
      updateData.images = typeof images === 'string' ? images : JSON.stringify(images);
    }
    if (paymentReceipt !== undefined) {
      updateData.paymentReceipt = paymentReceipt;
    }
    if (productQuantities !== undefined) {
      updateData.productQuantities = typeof productQuantities === 'string' ? productQuantities : JSON.stringify(productQuantities);
    }
    if (productPrices !== undefined) {
      updateData.productPrices = typeof productPrices === 'string' ? productPrices : JSON.stringify(productPrices);
    }
    if (selectedProducts !== undefined) {
      updateData.selectedProducts = typeof selectedProducts === 'string' ? selectedProducts : JSON.stringify(selectedProducts);
    }
    if (paymentAmount !== undefined) {
      updateData.paymentAmount = paymentAmount;
    }

    const order = await prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        form: {
          select: {
            name: true,
            tenant: {
              select: {
                businessName: true
              }
            }
          }
        }
      }
    });

    res.json({ order });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Update order status (Admin only)
router.put('/:id/status', authenticateToken, requireRole(['ADMIN']), [
  body('status').isIn(['PENDING', 'CONFIRMED', 'DISPATCHED', 'COMPLETED', 'CANCELLED'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status } = req.body;

    const order = await prisma.order.findUnique({
      where: { id }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status }
    });

    res.json({
      message: 'Order status updated successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Get order statistics
router.get('/stats/dashboard', authenticateToken, async (req, res) => {
  try {
    let whereClause = {};

    // Filter based on user role
    // Optimize: Use tenant from authenticated user (already loaded in middleware)
    if (req.user.role === 'BUSINESS_OWNER') {
      if (!req.user.tenant?.id) {
        return res.status(404).json({ error: 'No tenant found for this user' });
      }
      whereClause.tenantId = req.user.tenant.id;
    }

    const [
      totalOrders,
      pendingOrders,
      confirmedOrders,
      dispatchedOrders,
      recentOrders
    ] = await Promise.all([
      prisma.order.count({ where: whereClause }),
      prisma.order.count({ where: { ...whereClause, status: 'PENDING' } }),
      prisma.order.count({ where: { ...whereClause, status: 'CONFIRMED' } }),
      prisma.order.count({ where: { ...whereClause, status: 'DISPATCHED' } }),
      prisma.order.findMany({
        where: whereClause,
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
    ]);

    res.json({
      stats: {
        totalOrders,
        pendingOrders,
        confirmedOrders,
        dispatchedOrders
      },
      recentOrders
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to get order statistics',
      message: error.message 
    });
  }
});

module.exports = router;
