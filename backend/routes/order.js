const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { generateOrderNumber } = require('../utils/orderNumberGenerator');
const profitService = require('../services/profitService');
const customerService = require('../services/customerService');
const stockValidationService = require('../services/stockValidationService');
const ShippingChargesService = require('../services/shippingChargesService');

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

    const { formLink, formData, paymentAmount, images, paymentReceipt, selectedProducts, productQuantities, productPrices } = req.body;
    
    // Debug: Log the received data
    console.log('📥 Received order data:');
    console.log('  - selectedProducts:', selectedProducts, 'Type:', typeof selectedProducts);
    if (selectedProducts) {
      try {
        const parsed = typeof selectedProducts === 'string' ? JSON.parse(selectedProducts) : selectedProducts;
        console.log('  - Parsed selectedProducts:', parsed, 'Length:', Array.isArray(parsed) ? parsed.length : 'Not an array');
      } catch (e) {
        console.log('  - Error parsing selectedProducts:', e.message);
      }
    }
    console.log('  - productQuantities:', productQuantities, 'Type:', typeof productQuantities);
    console.log('  - productPrices:', productPrices, 'Type:', typeof productPrices);

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

    // Validate stock availability before creating order
    if (selectedProducts && productQuantities) {
      const stockValidation = await stockValidationService.validateStockAvailability(
        form.tenant.id,
        selectedProducts,
        productQuantities
      );

      if (!stockValidation.isValid) {
        const errorMessages = stockValidation.errors.map(err => err.message).join('; ');
        return res.status(400).json({
          error: 'Insufficient stock available',
          details: stockValidation.errors,
          message: errorMessages
        });
      }
    }

    // Generate order number
    const orderNumber = await generateOrderNumber(form.tenant.id);

    // Calculate shipping charges
    let shippingCharges = null;
    if (selectedProducts && productQuantities) {
      try {
        // Parse products and quantities if they're strings
        let parsedProducts = selectedProducts;
        let parsedQuantities = productQuantities;

        if (typeof selectedProducts === 'string') {
          parsedProducts = JSON.parse(selectedProducts);
        }
        if (typeof productQuantities === 'string') {
          parsedQuantities = JSON.parse(productQuantities);
        }

        // Get city from formData
        const city = formData['City'] || formData['City Name'] || '';

        if (city && Array.isArray(parsedProducts) && parsedProducts.length > 0) {
          shippingCharges = await ShippingChargesService.calculateShippingCharges(
            form.tenant.id,
            city,
            parsedProducts,
            parsedQuantities
          );
          console.log(`📦 Calculated shipping charges: Rs. ${shippingCharges} for city: ${city}`);
        }
      } catch (error) {
        console.error('Error calculating shipping charges:', error);
        // Don't fail the order if shipping calculation fails, just log it
      }
    }

    // Debug: Log what we're about to save
    console.log('💾 About to save order:');
    console.log('  - selectedProducts:', selectedProducts, 'Type:', typeof selectedProducts);
    console.log('  - productQuantities:', productQuantities, 'Type:', typeof productQuantities);
    console.log('  - productPrices:', productPrices, 'Type:', typeof productPrices);
    
    // Create order
    const order = await prisma.order.create({
      data: {
        orderNumber: orderNumber,
        formId: form.id,
        tenantId: form.tenant.id,
        customerId: customer ? customer.id : null,
        formData: JSON.stringify(formData),
        paymentAmount: paymentAmount || null,
        shippingCharges: shippingCharges,
        images: images ? JSON.stringify(images) : null,
        paymentReceipt: paymentReceipt || null,
        // selectedProducts, productQuantities, and productPrices are already stringified from frontend
        // Just save them as-is (they're strings)
        selectedProducts: selectedProducts || null,
        productQuantities: productQuantities || null,
        productPrices: productPrices || null,
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

    // Generate WhatsApp notification URL for business owner
    let whatsappUrl = null;
    let businessOwnerPhone = null;
    try {
      const whatsappService = require('../utils/whatsappService');
      businessOwnerPhone = whatsappService.normalizePhoneNumber(form.tenant.whatsappNumber);
      
      if (businessOwnerPhone) {
        // Get frontend base URL from environment variable or construct from request
        // Default to localhost:3000 for development, or use FRONTEND_URL env var for production
        let baseUrl = process.env.FRONTEND_URL;
        if (!baseUrl) {
          // Try to get from request origin, but replace port with frontend port
          const origin = req.get('origin') || req.get('referer') || '';
          if (origin) {
            try {
              const url = new URL(origin);
              // Replace backend port with frontend port (3000)
              baseUrl = `${url.protocol}//${url.hostname}:3000`;
            } catch (e) {
              // Fallback to localhost:3000 for development
              baseUrl = 'http://localhost:3000';
            }
          } else {
            // Fallback to localhost:3000 for development
            baseUrl = 'http://localhost:3000';
          }
        }
        
        const message = whatsappService.generateOrderSubmissionMessage(order, form.tenant, baseUrl);
        whatsappUrl = whatsappService.generateWhatsAppUrl(businessOwnerPhone, message);
        
        if (whatsappUrl) {
          console.log(`📱 WhatsApp notification URL for order ${order.orderNumber}:`);
          console.log(`   Business Owner: ${businessOwnerPhone}`);
          console.log(`   URL: ${whatsappUrl}`);
        } else {
          console.log(`⚠️  Could not generate WhatsApp URL for business owner: ${businessOwnerPhone}`);
        }
      } else {
        console.log(`⚠️  No valid WhatsApp number found for business owner: ${form.tenant.whatsappNumber}`);
      }
    } catch (whatsappError) {
      console.error('⚠️  Error generating WhatsApp notification (order still created):', whatsappError);
      // Don't fail the order if WhatsApp notification fails
    }

    res.status(201).json({
      message: 'Order submitted successfully',
      order: {
        id: order.id,
        status: order.status,
        createdAt: order.createdAt
      },
      whatsappUrl: whatsappUrl,
      businessOwnerPhone: businessOwnerPhone
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
            businessAddress: true,
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

    // Calculate profit if order is confirmed, dispatched, or completed
    let profitData = null;
    if (['CONFIRMED', 'DISPATCHED', 'COMPLETED'].includes(order.status)) {
      try {
        profitData = await profitService.calculateOrderProfit(order);
      } catch (error) {
        console.error('Error calculating profit:', error);
        // Don't fail the request if profit calculation fails
      }
    }

    res.json({ 
      order: parsedOrder,
      profit: profitData
    });
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

    // Decrease inventory when order is confirmed
    if (order.selectedProducts && order.productQuantities) {
      try {
        const InventoryService = require('../services/inventoryService');
        await InventoryService.decreaseInventoryFromOrder(
          order.tenantId,
          order.id,
          order.orderNumber,
          order.selectedProducts,
          order.productQuantities
        );
        console.log(`✅ Inventory decreased for order ${order.orderNumber}`);
      } catch (inventoryError) {
        console.error('⚠️  Error decreasing inventory (order still confirmed):', inventoryError);
        // Don't fail the order confirmation if inventory update fails
        // Log the error but continue
      }
    }

    // Send WhatsApp notification to customer
    try {
      const whatsappService = require('../utils/whatsappService');
      const customerPhone = whatsappService.getCustomerPhone(order.formData);
      
      if (customerPhone) {
        // Merge updated order with original order data for message generation
        const orderWithData = {
          ...order,
          ...updatedOrder,
          orderNumber: order.orderNumber // Ensure orderNumber is included
        };
        const message = whatsappService.generateOrderConfirmationMessage(orderWithData, order.tenant);
        const whatsappUrl = whatsappService.generateWhatsAppUrl(customerPhone, message);
        
        if (whatsappUrl) {
          console.log(`📱 WhatsApp notification URL for order ${order.orderNumber}:`);
          console.log(`   Customer: ${customerPhone}`);
          console.log(`   URL: ${whatsappUrl}`);
          
          // Return WhatsApp URL in response so frontend can open it
          res.json({
            message: 'Order confirmed successfully',
            order: updatedOrder,
            whatsappUrl: whatsappUrl,
            customerPhone: customerPhone
          });
        } else {
          console.log(`⚠️  Could not generate WhatsApp URL for phone: ${customerPhone}`);
          res.json({
            message: 'Order confirmed successfully',
            order: updatedOrder
          });
        }
      } else {
        console.log(`⚠️  No valid phone number found in order ${order.orderNumber} formData`);
        res.json({
          message: 'Order confirmed successfully',
          order: updatedOrder
        });
      }
    } catch (whatsappError) {
      console.error('⚠️  Error generating WhatsApp notification (order still confirmed):', whatsappError);
      // Don't fail the order confirmation if WhatsApp notification fails
      res.json({
        message: 'Order confirmed successfully',
        order: updatedOrder
      });
    }
  } catch (error) {
    console.error('Confirm order error:', error);
    res.status(500).json({ error: 'Failed to confirm order' });
  }
});

// Dispatch order (Business Owner or Stock Keeper)
router.post('/:id/dispatch', authenticateToken, requireRole(['BUSINESS_OWNER', 'STOCK_KEEPER']), async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            ownerId: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check permissions for Business Owner
    if (req.user.role === 'BUSINESS_OWNER' && req.user.id !== order.tenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
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
    console.log(`Order ${id} dispatched by ${req.user.role}!`);

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
  }),
  body('shippingCharges').optional().isFloat({ min: 0 }).withMessage('Shipping charges must be a number >= 0')
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
      paymentAmount,
      shippingCharges
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

    // Store old data for inventory adjustment if order was already confirmed/dispatched/completed
    const needsInventoryUpdate = ['CONFIRMED', 'DISPATCHED', 'COMPLETED'].includes(existingOrder.status) &&
      (productQuantities !== undefined || selectedProducts !== undefined);
    
    const oldSelectedProducts = existingOrder.selectedProducts;
    const oldProductQuantities = existingOrder.productQuantities;

    // Validate stock availability if quantities are being updated
    if ((productQuantities !== undefined || selectedProducts !== undefined)) {
      const newSelectedProducts = selectedProducts !== undefined ? selectedProducts : existingOrder.selectedProducts;
      const newProductQuantities = productQuantities !== undefined ? productQuantities : existingOrder.productQuantities;

      // Exclude current order from stock calculation if it's confirmed/dispatched/completed
      // (for pending orders, we still want to validate against all confirmed orders)
      const excludeOrderId = ['CONFIRMED', 'DISPATCHED', 'COMPLETED'].includes(existingOrder.status) ? id : null;

      const stockValidation = await stockValidationService.validateStockAvailability(
        existingOrder.tenantId,
        newSelectedProducts,
        newProductQuantities,
        excludeOrderId
      );

      if (!stockValidation.isValid) {
        const errorMessages = stockValidation.errors.map(err => err.message).join('; ');
        return res.status(400).json({
          error: 'Insufficient stock available',
          details: stockValidation.errors,
          message: errorMessages
        });
      }
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
    if (shippingCharges !== undefined) {
      updateData.shippingCharges = shippingCharges;
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

    // Update inventory if order was already confirmed/dispatched/completed and quantities changed
    if (needsInventoryUpdate) {
      try {
        const InventoryService = require('../services/inventoryService');
        await InventoryService.updateInventoryFromOrderEdit(
          existingOrder.tenantId,
          order.id,
          order.orderNumber,
          oldSelectedProducts,
          oldProductQuantities,
          order.selectedProducts,
          order.productQuantities
        );
        console.log(`✅ Inventory updated for order ${order.orderNumber}`);
      } catch (inventoryError) {
        console.error('⚠️  Error updating inventory after order edit:', inventoryError);
        // Don't fail the request, but log the error
      }
    }

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

    // Calculate date ranges for time-based stats
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now);
    monthStart.setDate(now.getDate() - 30);

    const [
      totalOrders,
      pendingOrders,
      confirmedOrders,
      dispatchedOrders,
      completedOrders,
      ordersToday,
      ordersThisWeek,
      ordersThisMonth,
      recentOrders,
      allOrdersForRevenue
    ] = await Promise.all([
      prisma.order.count({ where: whereClause }),
      prisma.order.count({ where: { ...whereClause, status: 'PENDING' } }),
      prisma.order.count({ where: { ...whereClause, status: 'CONFIRMED' } }),
      prisma.order.count({ where: { ...whereClause, status: 'DISPATCHED' } }),
      prisma.order.count({ where: { ...whereClause, status: 'COMPLETED' } }),
      prisma.order.count({
        where: {
          ...whereClause,
          createdAt: {
            gte: todayStart
          }
        }
      }),
      prisma.order.count({
        where: {
          ...whereClause,
          createdAt: {
            gte: weekStart
          }
        }
      }),
      prisma.order.count({
        where: {
          ...whereClause,
          createdAt: {
            gte: monthStart
          }
        }
      }),
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
      }),
      prisma.order.findMany({
        where: {
          ...whereClause,
          status: 'CONFIRMED' // Only include confirmed orders for revenue calculation
        },
        select: {
          selectedProducts: true,
          productQuantities: true,
          productPrices: true,
          shippingCharges: true
        }
      })
    ]);

    // Calculate total revenue from actual order totals (products + shipping)
    let totalRevenue = 0;
    let totalOrderValue = 0;
    let orderCount = 0;

    for (const order of allOrdersForRevenue) {
      try {
        // Parse order data
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

        // Calculate order total (products + shipping)
        let orderTotal = 0;
        if (Array.isArray(selectedProducts)) {
          selectedProducts.forEach(product => {
            const quantity = productQuantities[product.id] || product.quantity || 1;
            const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
            orderTotal += price * quantity;
          });
        }
        
        // Add shipping charges
        const shippingCharges = order.shippingCharges || 0;
        orderTotal += shippingCharges;

        totalRevenue += orderTotal;
        totalOrderValue += orderTotal;
        orderCount++;
      } catch (e) {
        console.error('Error calculating order total for revenue:', e);
        // Continue with next order
      }
    }

    const averageOrderValue = orderCount > 0 ? totalOrderValue / orderCount : 0;

    res.json({
      stats: {
        totalOrders,
        pendingOrders,
        confirmedOrders,
        dispatchedOrders,
        completedOrders,
        totalRevenue,
        averageOrderValue,
        ordersToday,
        ordersThisWeek,
        ordersThisMonth
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

// Get profit statistics
router.get('/stats/profit', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const { startDate, endDate, status } = req.query;

    const profitStats = await profitService.getProfitStatistics(tenant.id, {
      startDate,
      endDate,
      status
    });

    res.json({
      success: true,
      ...profitStats
    });
  } catch (error) {
    console.error('Get profit stats error:', error);
    res.status(500).json({ error: 'Failed to get profit statistics' });
  }
});

module.exports = router;
