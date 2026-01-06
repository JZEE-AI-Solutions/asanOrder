const express = require('express');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { generateOrderNumber } = require('../utils/orderNumberGenerator');
const profitService = require('../services/profitService');
const customerService = require('../services/customerService');
const stockValidationService = require('../services/stockValidationService');
const ShippingChargesService = require('../services/shippingChargesService');
const accountingService = require('../services/accountingService');
const codFeeService = require('../services/codFeeService');

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

    const { formLink, formData, paymentAmount, paymentAccountId, paymentMethod, images, paymentReceipt, selectedProducts, productQuantities, productPrices } = req.body;
    
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
        paymentAccountId: paymentAccountId || null,
        paymentMethod: paymentMethod || null,
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
    console.error('Error stack:', error.stack);
    console.error('Error message:', error.message);
    res.status(500).json({ 
      error: 'Failed to submit order',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
            ownerId: true,
            defaultCodFeePaidBy: true
          }
        },
        logisticsCompany: {
          select: {
            id: true,
            name: true,
            codFeeCalculationType: true
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
    const { paymentAccountId, codFeePaidBy, logisticsCompanyId } = req.body; // Payment account and COD fee preference

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            ownerId: true,
            businessName: true,
            defaultCodFeePaidBy: true
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

    // Calculate order total for accounting
    let productsTotal = 0;
    let selectedProductsList = [];
    let productQuantities = {};
    let productPrices = {};

    try {
      selectedProductsList = typeof order.selectedProducts === 'string' 
        ? JSON.parse(order.selectedProducts) 
        : (order.selectedProducts || []);
      productQuantities = typeof order.productQuantities === 'string'
        ? JSON.parse(order.productQuantities)
        : (order.productQuantities || {});
      productPrices = typeof order.productPrices === 'string'
        ? JSON.parse(order.productPrices)
        : (order.productPrices || {});
    } catch (e) {
      console.error('Error parsing order data for accounting:', e);
    }

    if (Array.isArray(selectedProductsList)) {
      selectedProductsList.forEach(product => {
        const quantity = productQuantities[product.id] || product.quantity || 1;
        const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
        productsTotal += price * quantity;
      });
    }

    const shippingCharges = order.shippingCharges || 0;
    const baseOrderTotal = productsTotal + shippingCharges;
    const paymentAmount = order.paymentAmount || 0;
    const codAmount = baseOrderTotal - paymentAmount;

    // Get COD fee payment preference (use request value, tenant default, or BUSINESS_OWNER)
    const codFeePaymentPreference = codFeePaidBy || order.tenant.defaultCodFeePaidBy || 'BUSINESS_OWNER';

    // Calculate COD fee if applicable
    let codFee = null;
    let codFeeCalculationType = null;
    let finalLogisticsCompanyId = logisticsCompanyId || null;

    if (codAmount > 0 && finalLogisticsCompanyId) {
      try {
        const codFeeResult = await codFeeService.calculateCODFee(finalLogisticsCompanyId, codAmount);
        codFee = codFeeResult.codFee;
        codFeeCalculationType = codFeeResult.calculationType;
      } catch (codError) {
        console.error('Error calculating COD fee:', codError);
        // Don't fail order confirmation if COD fee calculation fails
      }
    }

    // Calculate final order total based on who pays COD fee
    // If customer pays, add COD fee to order total; if business pays, don't add it
    let finalOrderTotal = baseOrderTotal;
    if (codFeePaymentPreference === 'CUSTOMER' && codFee && codFee > 0) {
      finalOrderTotal = baseOrderTotal + codFee;
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Update order status and payment account if provided
      const updateData = {
          status: 'CONFIRMED',
          businessOwnerId: req.user.id,
          codFee,
          codAmount: codAmount > 0 ? codAmount : null,
          codFeeCalculationType,
        codFeePaidBy: codFeePaymentPreference, // Store who pays COD fee
        logisticsCompanyId: finalLogisticsCompanyId
      };
      
      // If paymentAccountId is provided at confirmation, update it
      // Otherwise, keep the one from order submission (if any)
      if (paymentAccountId) {
        updateData.paymentAccountId = paymentAccountId;
      }
      
      const updated = await tx.order.update({
        where: { id },
        data: updateData
      });

      // Create accounting transaction for AR
      try {
        // Get or create accounts
        const arAccount = await accountingService.getAccountByCode('1200', order.tenantId) ||
          await accountingService.getOrCreateAccount({
            code: '1200',
            name: 'Accounts Receivable',
            type: 'ASSET',
            tenantId: order.tenantId,
            balance: 0
          });

        const salesRevenueAccount = await accountingService.getAccountByCode('4000', order.tenantId) ||
          await accountingService.getOrCreateAccount({
            code: '4000',
            name: 'Sales Revenue',
            type: 'INCOME',
            tenantId: order.tenantId,
            balance: 0
          });

        const shippingRevenueAccount = await accountingService.getAccountByCode('4200', order.tenantId) ||
          await accountingService.getOrCreateAccount({
            code: '4200',
            name: 'Shipping Revenue',
            type: 'INCOME',
            tenantId: order.tenantId,
            balance: 0
          });

        const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
        
        const transactionLines = [
          {
            accountId: arAccount.id,
            debitAmount: finalOrderTotal, // Use final order total (includes COD fee if customer pays)
            creditAmount: 0
          },
          {
            accountId: salesRevenueAccount.id,
            debitAmount: 0,
            creditAmount: productsTotal
          },
          {
            accountId: shippingRevenueAccount.id,
            debitAmount: 0,
            creditAmount: shippingCharges
          }
        ];

        // If customer pays COD fee, add it as revenue
        if (codFeePaymentPreference === 'CUSTOMER' && codFee && codFee > 0) {
          const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', order.tenantId) ||
            await accountingService.getOrCreateAccount({
              code: '4400',
              name: 'COD Fee Revenue',
              type: 'INCOME',
              tenantId: order.tenantId,
              balance: 0
            });

          transactionLines.push({
            accountId: codFeeRevenueAccount.id,
            debitAmount: 0,
            creditAmount: codFee
          });
        }

        // Create AR transaction
        await accountingService.createTransaction(
          {
            transactionNumber,
            date: new Date(),
            description: `Order Confirmed: ${order.orderNumber}`,
            tenantId: order.tenantId,
            orderId: order.id
          },
          transactionLines
        );

        // NOTE: Payment accounting entries are NOT created during order confirmation
        // Payment must be verified separately using the verify-payment endpoint
        // This ensures business owner validates payment before creating accounting entries

        // If COD order, handle COD fee expense (business always pays logistics company)
        // But accounting differs based on who pays the customer
        if (codFee && codFee > 0) {
          const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', order.tenantId) ||
            await accountingService.getOrCreateAccount({
              code: '5200',
              name: 'COD Fee Expense',
              type: 'EXPENSE',
              tenantId: order.tenantId,
              balance: 0
            });

          const codFeePayableAccount = await accountingService.getAccountByCode('2200', order.tenantId) ||
            await accountingService.getOrCreateAccount({
              code: '2200',
              name: 'COD Fee Payable',
              type: 'LIABILITY',
              tenantId: order.tenantId,
              balance: 0
            });

          const codTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now() + 2}`;
          
          // Business always pays logistics company, so always create expense
          // If customer pays COD fee, they pay us (revenue), and we pay logistics (expense)
          // If business pays COD fee, only expense (no revenue)
          await accountingService.createTransaction(
            {
              transactionNumber: codTransactionNumber,
              date: new Date(),
              description: `COD Fee ${codFeePaymentPreference === 'CUSTOMER' ? 'Expense' : 'Accrued'}: ${order.orderNumber}`,
              tenantId: order.tenantId,
              orderId: order.id
            },
            [
              {
                accountId: codFeeExpenseAccount.id,
                debitAmount: codFee,
                creditAmount: 0
              },
              {
                accountId: codFeePayableAccount.id,
                debitAmount: 0,
                creditAmount: codFee
              }
            ]
          );
        }
      } catch (accountingError) {
        console.error('Error creating accounting entries:', accountingError);
        // Don't fail order confirmation if accounting fails
        // Log error but continue
      }

      return updated;
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
          return; // Exit early
        } else {
          console.log(`⚠️  Could not generate WhatsApp URL for phone: ${customerPhone}`);
        }
      } else {
        console.log(`⚠️  No valid phone number found in order ${order.orderNumber} formData`);
      }
    } catch (whatsappError) {
      console.error('⚠️  Error generating WhatsApp notification (order still confirmed):', whatsappError);
    }

    // Default response if WhatsApp notification not sent
    res.json({
      message: 'Order confirmed successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Confirm order error:', error);
    res.status(500).json({ error: 'Failed to confirm order' });
  }
});

// Dispatch order (Business Owner or Stock Keeper)
router.post('/:id/dispatch', authenticateToken, requireRole(['BUSINESS_OWNER', 'STOCK_KEEPER']), [
  body('actualShippingCost').optional().isFloat({ min: 0 }).withMessage('Actual shipping cost must be a number >= 0'),
  body('logisticsCompanyId').optional().isString().withMessage('Logistics company ID must be a string'),
  body('codFee').optional().isFloat({ min: 0 }).withMessage('COD fee must be a number >= 0')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { actualShippingCost, logisticsCompanyId, codFee: manualCodFee } = req.body;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            ownerId: true,
            defaultCodFeePaidBy: true
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

    // Calculate shipping variance
    const shippingCharges = order.shippingCharges || 0;
    const actualCost = actualShippingCost !== undefined && actualShippingCost !== null 
      ? parseFloat(actualShippingCost) 
      : shippingCharges;
    const variance = shippingCharges - actualCost; // Positive = income (we charged more than we paid), Negative = expense (we paid more than we charged)

    const updateData = {
      status: 'DISPATCHED',
      actualShippingCost: actualCost,
      shippingVariance: variance !== 0 ? variance : null,
      shippingVarianceDate: variance !== 0 ? new Date() : null
    };

    // Handle manual COD fee override if provided
    if (manualCodFee !== undefined && manualCodFee !== null) {
      // Parse order data to calculate COD amount
      let selectedProducts = [];
      let productQuantities = {};
      let productPrices = {};
      
      try {
        selectedProducts = typeof order.selectedProducts === 'string'
          ? JSON.parse(order.selectedProducts)
          : (order.selectedProducts || []);
        productQuantities = typeof order.productQuantities === 'string'
          ? JSON.parse(order.productQuantities)
          : (order.productQuantities || {});
        productPrices = typeof order.productPrices === 'string'
          ? JSON.parse(order.productPrices)
          : (order.productPrices || {});
      } catch (e) {
        console.error('Error parsing order data for COD calculation:', e);
      }
      
      // Calculate products total
      let productsTotal = 0;
      if (Array.isArray(selectedProducts)) {
        selectedProducts.forEach(product => {
          const quantity = productQuantities[product.id] || product.quantity || 1;
          const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
          productsTotal += price * quantity;
        });
      }
      
      // Calculate COD amount
      const baseOrderTotal = productsTotal + shippingCharges;
      const paymentAmount = order.paymentAmount || 0;
      const codAmount = baseOrderTotal - paymentAmount;
      
      // Use manual COD fee
      updateData.codFee = parseFloat(manualCodFee);
      updateData.codAmount = codAmount > 0 ? codAmount : null;
      // Keep existing calculation type or set to null if manual override
      updateData.codFeeCalculationType = order.codFeeCalculationType || null;
      
      // Use existing codFeePaidBy or tenant default
      if (!order.codFeePaidBy) {
        updateData.codFeePaidBy = order.tenant.defaultCodFeePaidBy || 'BUSINESS_OWNER';
      }
    }
    // Update logistics company if provided (and no manual COD fee override)
    else if (logisticsCompanyId !== undefined && logisticsCompanyId !== null) {
      updateData.logisticsCompanyId = logisticsCompanyId;
      
      // Recalculate COD fee if logistics company is set
      try {
        // Parse order data to calculate COD amount
        let selectedProducts = [];
        let productQuantities = {};
        let productPrices = {};
        
        try {
          selectedProducts = typeof order.selectedProducts === 'string'
            ? JSON.parse(order.selectedProducts)
            : (order.selectedProducts || []);
          productQuantities = typeof order.productQuantities === 'string'
            ? JSON.parse(order.productQuantities)
            : (order.productQuantities || {});
          productPrices = typeof order.productPrices === 'string'
            ? JSON.parse(order.productPrices)
            : (order.productPrices || {});
        } catch (e) {
          console.error('Error parsing order data for COD calculation:', e);
        }
        
        // Calculate products total
        let productsTotal = 0;
        if (Array.isArray(selectedProducts)) {
          selectedProducts.forEach(product => {
            const quantity = productQuantities[product.id] || product.quantity || 1;
            const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
            productsTotal += price * quantity;
          });
        }
        
        // Calculate COD amount
        const baseOrderTotal = productsTotal + shippingCharges;
        const paymentAmount = order.paymentAmount || 0;
        const codAmount = baseOrderTotal - paymentAmount;
        
        // Recalculate COD fee if there's a COD amount
        if (codAmount > 0) {
          try {
            const codFeeResult = await codFeeService.calculateCODFee(logisticsCompanyId, codAmount);
            updateData.codFee = codFeeResult.codFee;
            updateData.codFeeCalculationType = codFeeResult.calculationType;
            updateData.codAmount = codAmount;
            
            // Use existing codFeePaidBy or tenant default
            if (!order.codFeePaidBy) {
              updateData.codFeePaidBy = order.tenant.defaultCodFeePaidBy || 'BUSINESS_OWNER';
            }
          } catch (codError) {
            console.error('Error calculating COD fee during dispatch:', codError);
            // If calculation fails, set codFee to null but keep codAmount
            updateData.codFee = null;
            updateData.codFeeCalculationType = null;
            updateData.codAmount = codAmount > 0 ? codAmount : null;
          }
        } else {
          // No COD amount
          updateData.codFee = null;
          updateData.codFeeCalculationType = null;
          updateData.codAmount = null;
        }
      } catch (error) {
        console.error('Error processing logistics company during dispatch:', error);
        // Continue with dispatch even if COD calculation fails
      }
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
      where: { id },
        data: updateData
      });

      // Create accounting entries for shipping variance if exists
      if (variance !== 0) {
        try {
          const shippingExpenseAccount = await accountingService.getAccountByCode('5100', order.tenantId) ||
            await accountingService.getOrCreateAccount({
              code: '5100',
              name: 'Shipping Expense',
              type: 'EXPENSE',
              tenantId: order.tenantId,
              balance: 0
            });

          if (variance > 0) {
            // Actual cost is LESS than charged (we made money) - Income
            const varianceIncomeAccount = await accountingService.getAccountByCode('4300', order.tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '4300',
                name: 'Shipping Variance Income',
                type: 'INCOME',
                tenantId: order.tenantId,
                balance: 0
              });

            const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
            
            // For income variance: Record the variance amount (balanced transaction)
            await accountingService.createTransaction(
              {
                transactionNumber,
                date: new Date(),
                description: `Shipping Variance (Income): ${order.orderNumber}`,
                tenantId: order.tenantId,
                orderId: order.id
              },
              [
                {
                  accountId: shippingExpenseAccount.id,
                  debitAmount: variance,
                  creditAmount: 0
                },
                {
                  accountId: varianceIncomeAccount.id,
                  debitAmount: 0,
                  creditAmount: variance
                }
              ]
            );

            console.log(`✅ Shipping variance income recorded: Rs. ${variance} for order ${order.orderNumber}`);
          } else {
            // Actual cost is MORE than charged (we lost money) - Expense
            const varianceExpenseAccount = await accountingService.getAccountByCode('5110', order.tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '5110',
                name: 'Shipping Variance Expense',
                type: 'EXPENSE',
                tenantId: order.tenantId,
                balance: 0
              });

            const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
            
            await accountingService.createTransaction(
              {
                transactionNumber,
                date: new Date(),
                description: `Shipping Variance (Expense): ${order.orderNumber}`,
                tenantId: order.tenantId,
                orderId: order.id
              },
              [
                {
                  accountId: shippingExpenseAccount.id,
                  debitAmount: Math.abs(variance),
                  creditAmount: 0
                },
                {
                  accountId: varianceExpenseAccount.id,
                  debitAmount: Math.abs(variance),
                  creditAmount: 0
                }
              ]
            );

            console.log(`✅ Shipping variance expense recorded: Rs. ${Math.abs(variance)} for order ${order.orderNumber}`);
          }
        } catch (accountingError) {
          console.error('⚠️  Error creating shipping variance accounting entries:', accountingError);
          // Don't fail the dispatch if accounting fails, but log the error
        }
      }

      // Handle COD fee accounting entries if COD fee is set/changed during dispatch
      // Handle for CONFIRMED or DISPATCHED orders (in case of re-dispatch)
      if (['CONFIRMED', 'DISPATCHED'].includes(order.status)) {
        try {
          // Check if COD fee accounting entries already exist for this order
          const existingCodTransactions = await tx.transaction.findMany({
            where: {
              orderId: order.id,
              description: {
                contains: 'COD Fee'
              }
            }
          });

          const oldCodFee = order.codFee || 0;
          const oldCodFeePaidBy = order.codFeePaidBy || null;
          const newCodFee = updateData.codFee !== undefined ? (updateData.codFee || 0) : oldCodFee;
          const newCodFeePaidBy = updateData.codFeePaidBy !== undefined ? updateData.codFeePaidBy : oldCodFeePaidBy;
          const finalCodFeePaidBy = newCodFeePaidBy || order.tenant.defaultCodFeePaidBy || 'BUSINESS_OWNER';
          
          const codFeeChanged = newCodFee !== oldCodFee;
          const codFeePaidByChanged = newCodFeePaidBy !== oldCodFeePaidBy;
          const codFeeDifference = newCodFee - oldCodFee;

          // Case 1: COD fee removed (newCodFee = 0, oldCodFee > 0)
          if (newCodFee === 0 && oldCodFee > 0 && existingCodTransactions.length > 0) {
            // Reverse all COD fee entries
            const arAccount = await accountingService.getAccountByCode('1200', order.tenantId);
            const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', order.tenantId);
            const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', order.tenantId);
            const codFeePayableAccount = await accountingService.getAccountByCode('2200', order.tenantId);

            // Reverse COD Fee Revenue if customer was paying
            if (oldCodFeePaidBy === 'CUSTOMER' && codFeeRevenueAccount && arAccount) {
              const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
              await accountingService.createTransaction(
                {
                  transactionNumber: reverseTransactionNumber,
                  date: new Date(),
                  description: `COD Fee Revenue Reversal (Dispatch): ${order.orderNumber}`,
                  tenantId: order.tenantId,
                  orderId: order.id
                },
                [
                  {
                    accountId: codFeeRevenueAccount.id,
                    debitAmount: oldCodFee,
                    creditAmount: 0
                  },
                  {
                    accountId: arAccount.id,
                    debitAmount: 0,
                    creditAmount: oldCodFee
                  }
                ]
              );
              console.log(`✅ COD Fee Revenue reversed: Rs. ${oldCodFee} for order ${order.orderNumber}`);
            }

            // Reverse COD Fee Expense
            if (codFeeExpenseAccount && codFeePayableAccount) {
              const reverseExpenseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now() + 1}`;
              await accountingService.createTransaction(
                {
                  transactionNumber: reverseExpenseTransactionNumber,
                  date: new Date(),
                  description: `COD Fee Expense Reversal (Dispatch): ${order.orderNumber}`,
                  tenantId: order.tenantId,
                  orderId: order.id
                },
                [
                  {
                    accountId: codFeePayableAccount.id,
                    debitAmount: oldCodFee,
                    creditAmount: 0
                  },
                  {
                    accountId: codFeeExpenseAccount.id,
                    debitAmount: 0,
                    creditAmount: oldCodFee
                  }
                ]
              );
              console.log(`✅ COD Fee Expense reversed: Rs. ${oldCodFee} for order ${order.orderNumber}`);
            }
          }
          // Case 2: COD fee added or changed (entries don't exist OR amount changed)
          else if (newCodFee > 0 && (existingCodTransactions.length === 0 || codFeeChanged || codFeePaidByChanged)) {
            // If entries don't exist, create full entries
            if (existingCodTransactions.length === 0) {
              const arAccount = await accountingService.getAccountByCode('1200', order.tenantId);
              
              // Add COD Fee Revenue if customer pays
              if (finalCodFeePaidBy === 'CUSTOMER' && arAccount) {
                const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', order.tenantId) ||
                  await accountingService.getOrCreateAccount({
                    code: '4400',
                    name: 'COD Fee Revenue',
                    type: 'INCOME',
                    tenantId: order.tenantId,
                    balance: 0
                  });

                const revenueTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
                await accountingService.createTransaction(
                  {
                    transactionNumber: revenueTransactionNumber,
                    date: new Date(),
                    description: `COD Fee Revenue (Dispatch): ${order.orderNumber}`,
                    tenantId: order.tenantId,
                    orderId: order.id
                  },
                  [
                    {
                      accountId: arAccount.id,
                      debitAmount: newCodFee,
                      creditAmount: 0
                    },
                    {
                      accountId: codFeeRevenueAccount.id,
                      debitAmount: 0,
                      creditAmount: newCodFee
                    }
                  ]
                );
                console.log(`✅ COD Fee Revenue created: Rs. ${newCodFee} for order ${order.orderNumber}`);
              }

              // Create COD Fee Expense (always)
              const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', order.tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '5200',
                  name: 'COD Fee Expense',
                  type: 'EXPENSE',
                  tenantId: order.tenantId,
                  balance: 0
                });

              const codFeePayableAccount = await accountingService.getAccountByCode('2200', order.tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '2200',
                  name: 'COD Fee Payable',
                  type: 'LIABILITY',
                  tenantId: order.tenantId,
                  balance: 0
                });

              const expenseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now() + 1}`;
              await accountingService.createTransaction(
                {
                  transactionNumber: expenseTransactionNumber,
                  date: new Date(),
                  description: `COD Fee ${finalCodFeePaidBy === 'CUSTOMER' ? 'Expense' : 'Accrued'} (Dispatch): ${order.orderNumber}`,
                  tenantId: order.tenantId,
                  orderId: order.id
                },
                [
                  {
                    accountId: codFeeExpenseAccount.id,
                    debitAmount: newCodFee,
                    creditAmount: 0
                  },
                  {
                    accountId: codFeePayableAccount.id,
                    debitAmount: 0,
                    creditAmount: newCodFee
                  }
                ]
              );
              console.log(`✅ COD Fee Expense created: Rs. ${newCodFee} for order ${order.orderNumber}`);
            }
            // If entries exist but amount changed, create adjustment
            else if (codFeeChanged && codFeeDifference !== 0) {
              const arAccount = await accountingService.getAccountByCode('1200', order.tenantId);
              
              // Adjust COD Fee Revenue if customer pays
              if (finalCodFeePaidBy === 'CUSTOMER' && arAccount) {
                const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', order.tenantId) ||
                  await accountingService.getOrCreateAccount({
                    code: '4400',
                    name: 'COD Fee Revenue',
                    type: 'INCOME',
                    tenantId: order.tenantId,
                    balance: 0
                  });

                const adjustmentTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
                await accountingService.createTransaction(
                  {
                    transactionNumber: adjustmentTransactionNumber,
                    date: new Date(),
                    description: `COD Fee Revenue Adjustment (Dispatch): ${order.orderNumber}`,
                    tenantId: order.tenantId,
                    orderId: order.id
                  },
                  [
                    {
                      accountId: arAccount.id,
                      debitAmount: codFeeDifference > 0 ? codFeeDifference : Math.abs(codFeeDifference),
                      creditAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0
                    },
                    {
                      accountId: codFeeRevenueAccount.id,
                      debitAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0,
                      creditAmount: codFeeDifference > 0 ? codFeeDifference : 0
                    }
                  ]
                );
                console.log(`✅ COD Fee Revenue adjusted: Rs. ${codFeeDifference} for order ${order.orderNumber}`);
              }

              // Adjust COD Fee Expense
              const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', order.tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '5200',
                  name: 'COD Fee Expense',
                  type: 'EXPENSE',
                  tenantId: order.tenantId,
                  balance: 0
                });

              const codFeePayableAccount = await accountingService.getAccountByCode('2200', order.tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '2200',
                  name: 'COD Fee Payable',
                  type: 'LIABILITY',
                  tenantId: order.tenantId,
                  balance: 0
                });

              const expenseAdjustmentTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now() + 1}`;
              await accountingService.createTransaction(
                {
                  transactionNumber: expenseAdjustmentTransactionNumber,
                  date: new Date(),
                  description: `COD Fee Expense Adjustment (Dispatch): ${order.orderNumber}`,
                  tenantId: order.tenantId,
                  orderId: order.id
                },
                [
                  {
                    accountId: codFeeExpenseAccount.id,
                    debitAmount: codFeeDifference > 0 ? codFeeDifference : 0,
                    creditAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0
                  },
                  {
                    accountId: codFeePayableAccount.id,
                    debitAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0,
                    creditAmount: codFeeDifference > 0 ? codFeeDifference : 0
                  }
                ]
              );
              console.log(`✅ COD Fee Expense adjusted: Rs. ${codFeeDifference} for order ${order.orderNumber}`);
            }
            // If amount same but payment preference changed
            else if (!codFeeChanged && codFeePaidByChanged && newCodFee > 0) {
              const arAccount = await accountingService.getAccountByCode('1200', order.tenantId);
              const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', order.tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '4400',
                  name: 'COD Fee Revenue',
                  type: 'INCOME',
                  tenantId: order.tenantId,
                  balance: 0
                });

              // If changed from BUSINESS_OWNER to CUSTOMER: Add revenue
              if (oldCodFeePaidBy !== 'CUSTOMER' && finalCodFeePaidBy === 'CUSTOMER' && arAccount) {
                const addRevenueTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
                await accountingService.createTransaction(
                  {
                    transactionNumber: addRevenueTransactionNumber,
                    date: new Date(),
                    description: `COD Fee Revenue Added (Preference Change - Dispatch): ${order.orderNumber}`,
                    tenantId: order.tenantId,
                    orderId: order.id
                  },
                  [
                    {
                      accountId: arAccount.id,
                      debitAmount: newCodFee,
                      creditAmount: 0
                    },
                    {
                      accountId: codFeeRevenueAccount.id,
                      debitAmount: 0,
                      creditAmount: newCodFee
                    }
                  ]
                );
                console.log(`✅ COD Fee Revenue added (preference change): Rs. ${newCodFee} for order ${order.orderNumber}`);
              }
              // If changed from CUSTOMER to BUSINESS_OWNER: Remove revenue
              else if (oldCodFeePaidBy === 'CUSTOMER' && finalCodFeePaidBy !== 'CUSTOMER' && arAccount) {
                const removeRevenueTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
                await accountingService.createTransaction(
                  {
                    transactionNumber: removeRevenueTransactionNumber,
                    date: new Date(),
                    description: `COD Fee Revenue Removed (Preference Change - Dispatch): ${order.orderNumber}`,
                    tenantId: order.tenantId,
                    orderId: order.id
                  },
                  [
                    {
                      accountId: codFeeRevenueAccount.id,
                      debitAmount: newCodFee,
                      creditAmount: 0
                    },
                    {
                      accountId: arAccount.id,
                      debitAmount: 0,
                      creditAmount: newCodFee
                    }
                  ]
                );
                console.log(`✅ COD Fee Revenue removed (preference change): Rs. ${newCodFee} for order ${order.orderNumber}`);
              }
            }
          }
        } catch (codAccountingError) {
          console.error('⚠️  Error creating COD fee accounting entries during dispatch:', codAccountingError);
          // Don't fail the dispatch if accounting fails, but log the error
        }
      }

      return updated;
    });

    // TODO: Send notification to business owner and customer
    console.log(`✅ Order ${id} dispatched by ${req.user.role}!`);

    res.json({
      message: 'Order dispatched successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Dispatch order error:', error);
    res.status(500).json({ error: 'Failed to dispatch order' });
  }
});

// Adjust shipping cost for dispatched/completed orders (Business Owner or Stock Keeper)
router.post('/:id/adjust-shipping-cost', authenticateToken, requireRole(['BUSINESS_OWNER', 'STOCK_KEEPER']), [
  body('actualShippingCost').isFloat({ min: 0 }).withMessage('Actual shipping cost must be a number >= 0')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { actualShippingCost } = req.body;

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

    // Only allow adjustment for DISPATCHED or COMPLETED orders
    if (order.status !== 'DISPATCHED' && order.status !== 'COMPLETED') {
      return res.status(400).json({ 
        error: 'Shipping cost can only be adjusted for DISPATCHED or COMPLETED orders' 
      });
    }

    const shippingCharges = order.shippingCharges || 0;
    const actualCost = parseFloat(actualShippingCost);
    const variance = shippingCharges - actualCost; // Positive = income, Negative = expense

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Update only actualShippingCost and variance (NOT shippingCharges)
      const updated = await tx.order.update({
        where: { id },
        data: {
          actualShippingCost: actualCost,
          shippingVariance: variance !== 0 ? variance : null,
          shippingVarianceDate: variance !== 0 ? new Date() : null
        }
      });

      // Handle accounting entries for shipping variance
      // Check if variance accounting entries already exist for this order
      const existingVarianceTransactions = await tx.transaction.findMany({
        where: {
          orderId: order.id,
          description: {
            contains: 'Shipping Variance'
          }
        }
      });

      const oldVariance = order.shippingVariance || 0;
      const varianceChanged = variance !== oldVariance;

      // Only create accounting entries if variance is new or changed, and entries don't exist
      // If entries exist and variance changed, we'll create adjustment entries
      if (variance !== 0 && (existingVarianceTransactions.length === 0 || varianceChanged)) {
        try {
          const shippingExpenseAccount = await accountingService.getAccountByCode('5100', order.tenantId) ||
            await accountingService.getOrCreateAccount({
              code: '5100',
              name: 'Shipping Expense',
              type: 'EXPENSE',
              tenantId: order.tenantId,
              balance: 0
            });

            if (variance > 0) {
            // Actual cost is LESS than charged (we made money) - Income
            const varianceIncomeAccount = await accountingService.getAccountByCode('4300', order.tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '4300',
                name: 'Shipping Variance Income',
                type: 'INCOME',
                tenantId: order.tenantId,
                balance: 0
              });

            // If variance changed and old variance was expense, reverse it first
            if (varianceChanged && oldVariance < 0 && existingVarianceTransactions.length > 0) {
              const oldVarianceExpenseAccount = await accountingService.getAccountByCode('5110', order.tenantId);
              if (oldVarianceExpenseAccount) {
                const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
                await accountingService.createTransaction(
                  {
                    transactionNumber: reverseTransactionNumber,
                    date: new Date(),
                    description: `Shipping Variance Reversal (Adjustment): ${order.orderNumber}`,
                    tenantId: order.tenantId,
                    orderId: order.id
                  },
                  [
                    {
                      accountId: oldVarianceExpenseAccount.id,
                      debitAmount: 0,
                      creditAmount: Math.abs(oldVariance)
                    },
                    {
                      accountId: shippingExpenseAccount.id,
                      debitAmount: 0,
                      creditAmount: Math.abs(oldVariance)
                    }
                  ]
                );
              }
            }

            // Create income entry
            // For income variance: We record the variance as income
            // Debit Shipping Expense for the variance amount (the difference we're recording)
            // Credit Variance Income for the variance amount
            const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now() + 1}`;
            const varianceAmount = varianceChanged && oldVariance > 0 ? (variance - oldVariance) : variance;
            
            if (varianceAmount > 0 || !varianceChanged) {
              await accountingService.createTransaction(
                {
                  transactionNumber,
                  date: new Date(),
                  description: `Shipping Variance ${varianceChanged ? '(Adjustment)' : ''} (Income): ${order.orderNumber}`,
                  tenantId: order.tenantId,
                  orderId: order.id
                },
                [
                  {
                    accountId: shippingExpenseAccount.id,
                    debitAmount: varianceAmount > 0 ? varianceAmount : variance,
                    creditAmount: 0
                  },
                  {
                    accountId: varianceIncomeAccount.id,
                    debitAmount: 0,
                    creditAmount: varianceAmount > 0 ? varianceAmount : variance
                  }
                ]
              );
            }

            console.log(`✅ Shipping variance income recorded: Rs. ${variance} for order ${order.orderNumber}`);
          } else {
            // Actual cost is MORE than charged (we lost money) - Expense
            const varianceExpenseAccount = await accountingService.getAccountByCode('5110', order.tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '5110',
                name: 'Shipping Variance Expense',
                type: 'EXPENSE',
                tenantId: order.tenantId,
                balance: 0
              });

            // If variance changed and old variance was income, reverse it first
            if (varianceChanged && oldVariance > 0 && existingVarianceTransactions.length > 0) {
              const oldVarianceIncomeAccount = await accountingService.getAccountByCode('4300', order.tenantId);
              if (oldVarianceIncomeAccount) {
                const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
                await accountingService.createTransaction(
                  {
                    transactionNumber: reverseTransactionNumber,
                    date: new Date(),
                    description: `Shipping Variance Reversal (Adjustment): ${order.orderNumber}`,
                    tenantId: order.tenantId,
                    orderId: order.id
                  },
                  [
                    {
                      accountId: oldVarianceIncomeAccount.id,
                      debitAmount: oldVariance,
                      creditAmount: 0
                    },
                    {
                      accountId: shippingExpenseAccount.id,
                      debitAmount: oldVariance,
                      creditAmount: 0
                    }
                  ]
                );
              }
            }

            // Create expense entry
            // For expense variance: Record the variance amount (balanced transaction)
            const transactionNumber = `TXN-${new Date().getFullYear()}-${Date.now() + 1}`;
            const varianceAmount = varianceChanged && oldVariance < 0 ? (Math.abs(variance) - Math.abs(oldVariance)) : Math.abs(variance);
            
            if (varianceAmount > 0 || !varianceChanged) {
              await accountingService.createTransaction(
                {
                  transactionNumber,
                  date: new Date(),
                  description: `Shipping Variance ${varianceChanged ? '(Adjustment)' : ''} (Expense): ${order.orderNumber}`,
                  tenantId: order.tenantId,
                  orderId: order.id
                },
                [
                  {
                    accountId: shippingExpenseAccount.id,
                    debitAmount: varianceAmount > 0 ? varianceAmount : Math.abs(variance),
                    creditAmount: 0
                  },
                  {
                    accountId: varianceExpenseAccount.id,
                    debitAmount: varianceAmount > 0 ? varianceAmount : Math.abs(variance),
                    creditAmount: 0
                  }
                ]
              );
            }

            console.log(`✅ Shipping variance expense recorded: Rs. ${Math.abs(variance)} for order ${order.orderNumber}`);
          }
        } catch (accountingError) {
          console.error('⚠️  Error creating shipping variance accounting entries:', accountingError);
          // Don't fail the adjustment if accounting fails, but log the error
        }
      } else if (variance === 0 && oldVariance !== 0 && existingVarianceTransactions.length > 0) {
        // Variance cleared - reverse existing entries
        try {
          const shippingExpenseAccount = await accountingService.getAccountByCode('5100', order.tenantId);
          
          if (oldVariance > 0) {
            const varianceIncomeAccount = await accountingService.getAccountByCode('4300', order.tenantId);
            if (varianceIncomeAccount && shippingExpenseAccount) {
              const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
              await accountingService.createTransaction(
                {
                  transactionNumber: reverseTransactionNumber,
                  date: new Date(),
                  description: `Shipping Variance Reversal (Cleared): ${order.orderNumber}`,
                  tenantId: order.tenantId,
                  orderId: order.id
                },
                [
                  {
                    accountId: varianceIncomeAccount.id,
                    debitAmount: oldVariance,
                    creditAmount: 0
                  },
                  {
                    accountId: shippingExpenseAccount.id,
                    debitAmount: oldVariance,
                    creditAmount: 0
                  }
                ]
              );
            }
          } else {
            const varianceExpenseAccount = await accountingService.getAccountByCode('5110', order.tenantId);
            if (varianceExpenseAccount && shippingExpenseAccount) {
              const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
              await accountingService.createTransaction(
                {
                  transactionNumber: reverseTransactionNumber,
                  date: new Date(),
                  description: `Shipping Variance Reversal (Cleared): ${order.orderNumber}`,
                  tenantId: order.tenantId,
                  orderId: order.id
                },
                [
                  {
                    accountId: varianceExpenseAccount.id,
                    debitAmount: 0,
                    creditAmount: Math.abs(oldVariance)
                  },
                  {
                    accountId: shippingExpenseAccount.id,
                    debitAmount: 0,
                    creditAmount: Math.abs(oldVariance)
                  }
                ]
              );
            }
          }
        } catch (accountingError) {
          console.error('⚠️  Error reversing shipping variance accounting entries:', accountingError);
        }
      }

      return updated;
    });

    res.json({ 
      order: updatedOrder,
      variance: variance,
      message: variance < 0 
        ? `Shipping variance expense of Rs. ${Math.abs(variance).toFixed(2)} recorded`
        : variance > 0
        ? `Shipping variance income of Rs. ${variance.toFixed(2)} recorded`
        : 'Shipping variance cleared'
    });
  } catch (error) {
    console.error('Error adjusting shipping cost:', error);
    res.status(500).json({ error: 'Failed to adjust shipping cost' });
  }
});

// Verify payment for an order
router.post('/:id/verify-payment', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('verifiedAmount').isFloat({ min: 0 }).withMessage('Verified amount must be >= 0'),
  body('paymentAccountId').notEmpty().withMessage('Payment account is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { verifiedAmount, paymentAccountId } = req.body;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        tenant: {
          select: { ownerId: true }
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

    // Only allow verification for CONFIRMED, DISPATCHED, or COMPLETED orders
    if (!['CONFIRMED', 'DISPATCHED', 'COMPLETED'].includes(order.status)) {
      return res.status(400).json({ 
        error: 'Payment can only be verified for confirmed orders' 
      });
    }

    // Prevent re-verification if already verified
    if (order.paymentVerified) {
      return res.status(400).json({ 
        error: 'Payment has already been verified for this order' 
      });
    }

    const verifiedAmountValue = parseFloat(verifiedAmount);

    // Get payment account
    const paymentAccount = await prisma.account.findFirst({
      where: {
        id: paymentAccountId,
        tenantId: order.tenantId,
        type: 'ASSET',
        accountSubType: { in: ['CASH', 'BANK'] }
      }
    });

    if (!paymentAccount) {
      return res.status(400).json({ 
        error: 'Invalid payment account. Must be a Cash or Bank account.' 
      });
    }

    const paymentMethod = paymentAccount.accountSubType === 'BANK' ? 'Bank Transfer' : 'Cash';

    const result = await prisma.$transaction(async (tx) => {
      // Get AR account
      const arAccount = await accountingService.getAccountByCode('1200', order.tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '1200',
          name: 'Accounts Receivable',
          type: 'ASSET',
          tenantId: order.tenantId,
          balance: 0
        });

      // Create payment accounting transaction
      const paymentTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      
      const transaction = await accountingService.createTransaction(
        {
          transactionNumber: paymentTransactionNumber,
          date: new Date(),
          description: `Payment Verified: ${order.orderNumber}`,
          tenantId: order.tenantId,
          orderId: order.id
        },
        [
          {
            accountId: paymentAccount.id,
            debitAmount: verifiedAmountValue,
            creditAmount: 0
          },
          {
            accountId: arAccount.id,
            debitAmount: 0,
            creditAmount: verifiedAmountValue
          }
        ]
      );

      // Create Payment record
      const paymentCount = await prisma.payment.count({
        where: { tenantId: order.tenantId }
      });
      const paymentNumber = `PAY-${new Date().getFullYear()}-${String(paymentCount + 1).padStart(4, '0')}`;

      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          date: new Date(),
          type: 'CUSTOMER_PAYMENT',
          amount: verifiedAmountValue,
          paymentMethod: paymentMethod,
          accountId: paymentAccount.id,
          tenantId: order.tenantId,
          customerId: order.customerId,
          orderId: order.id,
          transactionId: transaction.id // Use transaction ID, not transaction number
        }
      });

      // Update order with verification details
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          verifiedPaymentAmount: verifiedAmountValue,
          paymentVerified: true,
          paymentVerifiedAt: new Date(),
          paymentVerifiedBy: req.user.id,
          paymentAccountId: paymentAccountId // Update payment account
        }
      });

      return { order: updatedOrder, payment };
    });

    res.json({
      success: true,
      message: `Payment of Rs. ${verifiedAmountValue.toFixed(2)} verified successfully`,
      order: result.order,
      payment: result.payment
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// Update verified payment for an order
router.patch('/:id/update-verified-payment', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('verifiedAmount').isFloat({ min: 0 }).withMessage('Verified amount must be >= 0'),
  body('paymentAccountId').notEmpty().withMessage('Payment account is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { verifiedAmount, paymentAccountId } = req.body;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        tenant: {
          select: { ownerId: true }
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

    // Only allow update for verified payments
    if (!order.paymentVerified) {
      return res.status(400).json({ 
        error: 'Payment must be verified before it can be updated' 
      });
    }

    // Only allow update for CONFIRMED, DISPATCHED, or COMPLETED orders
    if (!['CONFIRMED', 'DISPATCHED', 'COMPLETED'].includes(order.status)) {
      return res.status(400).json({ 
        error: 'Payment can only be updated for confirmed orders' 
      });
    }

    const newVerifiedAmount = parseFloat(verifiedAmount);
    const oldVerifiedAmount = order.verifiedPaymentAmount || 0;

    // If amounts are the same, no update needed
    if (Math.abs(newVerifiedAmount - oldVerifiedAmount) < 0.01) {
      return res.status(400).json({ 
        error: 'New verified amount is the same as current amount' 
      });
    }

    // Get payment account
    const paymentAccount = await prisma.account.findFirst({
      where: {
        id: paymentAccountId,
        tenantId: order.tenantId,
        type: 'ASSET',
        accountSubType: { in: ['CASH', 'BANK'] }
      }
    });

    if (!paymentAccount) {
      return res.status(400).json({ 
        error: 'Invalid payment account. Must be a Cash or Bank account.' 
      });
    }

    const paymentMethod = paymentAccount.accountSubType === 'BANK' ? 'Bank Transfer' : 'Cash';

    // Find the existing payment record created during verification
    const existingPayment = await prisma.payment.findFirst({
      where: {
        orderId: order.id,
        type: 'CUSTOMER_PAYMENT',
        transactionId: { not: null } // Payment from verification has transactionId
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!existingPayment) {
      return res.status(404).json({ 
        error: 'Verified payment record not found. Cannot update.' 
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Get AR account
      const arAccount = await accountingService.getAccountByCode('1200', order.tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '1200',
          name: 'Accounts Receivable',
          type: 'ASSET',
          tenantId: order.tenantId,
          balance: 0
        });

      // Get the existing transaction
      const existingTransaction = await tx.transaction.findUnique({
        where: { id: existingPayment.transactionId }
      });

      if (existingTransaction) {
        // Create reversing transaction to undo old accounting entries
        const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}-REV`;
        await accountingService.createTransaction(
          {
            transactionNumber: reverseTransactionNumber,
            date: new Date(),
            description: `Payment Verification Update (Reverse): ${order.orderNumber}`,
            tenantId: order.tenantId,
            orderId: order.id
          },
          [
            {
              accountId: existingPayment.accountId, // Old payment account
              debitAmount: 0,
              creditAmount: oldVerifiedAmount // Reverse: Credit payment account
            },
            {
              accountId: arAccount.id,
              debitAmount: oldVerifiedAmount, // Reverse: Debit AR
              creditAmount: 0
            }
          ]
        );
      }

      // Create new payment accounting transaction with updated amount
      const newPaymentTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
      const newTransaction = await accountingService.createTransaction(
        {
          transactionNumber: newPaymentTransactionNumber,
          date: new Date(),
          description: `Payment Verified (Updated): ${order.orderNumber}`,
          tenantId: order.tenantId,
          orderId: order.id
        },
        [
          {
            accountId: paymentAccount.id, // New payment account (may be different)
            debitAmount: newVerifiedAmount,
            creditAmount: 0
          },
          {
            accountId: arAccount.id,
            debitAmount: 0,
            creditAmount: newVerifiedAmount
          }
        ]
      );

      // Update Payment record
      const updatedPayment = await tx.payment.update({
        where: { id: existingPayment.id },
        data: {
          amount: newVerifiedAmount,
          paymentMethod: paymentMethod,
          accountId: paymentAccountId,
          transactionId: newTransaction.id,
          date: new Date() // Update date to reflect when it was corrected
        }
      });

      // Update order with new verification details
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          verifiedPaymentAmount: newVerifiedAmount,
          paymentVerifiedAt: new Date(),
          paymentVerifiedBy: req.user.id,
          paymentAccountId: paymentAccountId
        }
      });

      return { order: updatedOrder, payment: updatedPayment };
    });

    res.json({
      success: true,
      message: `Verified payment updated from Rs. ${oldVerifiedAmount.toFixed(2)} to Rs. ${newVerifiedAmount.toFixed(2)}`,
      order: result.order,
      payment: result.payment
    });
  } catch (error) {
    console.error('Error updating verified payment:', error);
    res.status(500).json({ error: 'Failed to update verified payment' });
  }
});

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
  body('paymentAccountId').optional().isString().withMessage('Payment account ID must be a string'),
  body('paymentMethod').optional().isString().withMessage('Payment method must be a string'),
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
      paymentAccountId,
      paymentMethod,
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
      
      // If formData changed, check if phone number changed and update customer link
      try {
        const parsedFormData = typeof formData === 'string' ? JSON.parse(formData) : formData;
        
        // Get form to find phone field
        const form = await prisma.form.findUnique({
          where: { id: existingOrder.formId },
          include: { fields: true }
        });
        
        if (form) {
          const phoneField = form.fields.find(field =>
            field.fieldType === 'PHONE' ||
            field.label.toLowerCase().includes('phone') ||
            field.label.toLowerCase().includes('mobile') ||
            field.label.toLowerCase().includes('contact')
          );
          
          if (phoneField && parsedFormData[phoneField.label]) {
            const newPhoneNumber = parsedFormData[phoneField.label].trim();
            
            // Extract old phone number from existing order
            let oldPhoneNumber = null;
            if (existingOrder.formData) {
              try {
                const oldFormData = typeof existingOrder.formData === 'string' 
                  ? JSON.parse(existingOrder.formData) 
                  : existingOrder.formData;
                oldPhoneNumber = oldFormData[phoneField.label]?.trim() || null;
              } catch (e) {
                console.error('Error parsing old formData:', e);
              }
            }
            
            // If phone number changed, update customer link
            if (newPhoneNumber && newPhoneNumber !== oldPhoneNumber) {
              console.log(`📞 Phone number changed from "${oldPhoneNumber}" to "${newPhoneNumber}" for order ${existingOrder.orderNumber}`);
              
              const customerService = require('../services/customerService');
              const customer = await customerService.findOrCreateCustomer(
                newPhoneNumber,
                existingOrder.tenantId,
                {
                  formData: updateData.formData,
                  paymentAmount: paymentAmount !== undefined ? paymentAmount : existingOrder.paymentAmount,
                  selectedProducts: selectedProducts !== undefined ? selectedProducts : existingOrder.selectedProducts,
                  productQuantities: productQuantities !== undefined ? productQuantities : existingOrder.productQuantities
                }
              );
              
              // Update customerId in the order
              updateData.customerId = customer.id;
              console.log(`✅ Order customerId updated to ${customer.id} for phone ${newPhoneNumber}`);
            }
          }
        }
      } catch (customerUpdateError) {
        console.error('⚠️  Error updating customer link after phone number change:', customerUpdateError);
        // Don't fail the order update if customer update fails, but log the error
      }
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
    if (paymentAccountId !== undefined) {
      updateData.paymentAccountId = paymentAccountId || null;
    }
    if (paymentMethod !== undefined) {
      updateData.paymentMethod = paymentMethod || null;
    }
    if (shippingCharges !== undefined) {
      updateData.shippingCharges = shippingCharges;
    }
    if (req.body.actualShippingCost !== undefined) {
      const actualCost = req.body.actualShippingCost !== null ? parseFloat(req.body.actualShippingCost) : null;
      const currentShippingCharges = existingOrder.shippingCharges || 0;
      updateData.actualShippingCost = actualCost;
      
      // Recalculate variance if actual cost is provided
      if (actualCost !== null) {
        const variance = currentShippingCharges - actualCost;
        updateData.shippingVariance = variance !== 0 ? variance : null;
        updateData.shippingVarianceDate = variance !== 0 ? new Date() : null;
      } else {
        updateData.shippingVariance = null;
        updateData.shippingVarianceDate = null;
      }
    }
    if (req.body.shippingVariance !== undefined) {
      updateData.shippingVariance = req.body.shippingVariance !== null ? parseFloat(req.body.shippingVariance) : null;
    }
    if (req.body.shippingVarianceDate !== undefined) {
      updateData.shippingVarianceDate = req.body.shippingVarianceDate ? new Date(req.body.shippingVarianceDate) : null;
    }
    if (req.body.codFeePaidBy !== undefined) {
      updateData.codFeePaidBy = req.body.codFeePaidBy || null;
    }
    if (req.body.logisticsCompanyId !== undefined) {
      updateData.logisticsCompanyId = req.body.logisticsCompanyId || null;
    }
    
    // Store old COD fee values for accounting adjustments
    const oldCodFee = existingOrder.codFee || 0;
    const oldCodFeePaidBy = existingOrder.codFeePaidBy || null;
    const newCodFee = updateData.codFee !== undefined ? (updateData.codFee || 0) : oldCodFee;
    const newCodFeePaidBy = updateData.codFeePaidBy !== undefined ? updateData.codFeePaidBy : oldCodFeePaidBy;
    
    // Recalculate COD fee if order values changed or logistics company changed
    // Only recalculate if codFee is not explicitly provided (meaning use calculated value)
    if (req.body.codFee === undefined) {
      // Calculate new order total to determine COD amount
      let newProductsTotal = 0;
      let newSelectedProducts = [];
      let newProductQuantities = {};
      let newProductPrices = {};
      
      try {
        if (req.body.selectedProducts) {
          newSelectedProducts = typeof req.body.selectedProducts === 'string' 
            ? JSON.parse(req.body.selectedProducts) 
            : req.body.selectedProducts;
        } else {
          newSelectedProducts = typeof existingOrder.selectedProducts === 'string'
            ? JSON.parse(existingOrder.selectedProducts)
            : (existingOrder.selectedProducts || []);
        }
        
        if (req.body.productQuantities) {
          newProductQuantities = typeof req.body.productQuantities === 'string'
            ? JSON.parse(req.body.productQuantities)
            : req.body.productQuantities;
        } else {
          newProductQuantities = typeof existingOrder.productQuantities === 'string'
            ? JSON.parse(existingOrder.productQuantities)
            : (existingOrder.productQuantities || {});
        }
        
        if (req.body.productPrices) {
          newProductPrices = typeof req.body.productPrices === 'string'
            ? JSON.parse(req.body.productPrices)
            : req.body.productPrices;
        } else {
          newProductPrices = typeof existingOrder.productPrices === 'string'
            ? JSON.parse(existingOrder.productPrices)
            : (existingOrder.productPrices || {});
        }
      } catch (e) {
        console.error('Error parsing order data for COD recalculation:', e);
      }
      
      if (Array.isArray(newSelectedProducts)) {
        newSelectedProducts.forEach(product => {
          const quantity = newProductQuantities[product.id] || product.quantity || 1;
          const price = newProductPrices[product.id] || product.price || product.currentRetailPrice || 0;
          newProductsTotal += price * quantity;
        });
      }
      
      const newShippingCharges = req.body.shippingCharges !== undefined 
        ? (req.body.shippingCharges || 0)
        : (existingOrder.shippingCharges || 0);
      const newPaymentAmount = req.body.paymentAmount !== undefined 
        ? (req.body.paymentAmount || 0)
        : (existingOrder.paymentAmount || 0);
      
      const newBaseOrderTotal = newProductsTotal + newShippingCharges;
      const newCodAmount = newBaseOrderTotal - newPaymentAmount;
      
      const logisticsCompanyId = req.body.logisticsCompanyId !== undefined
        ? req.body.logisticsCompanyId
        : existingOrder.logisticsCompanyId;
      
      // Recalculate COD fee if there's a COD amount and logistics company
      if (newCodAmount > 0 && logisticsCompanyId) {
        try {
          const codFeeResult = await codFeeService.calculateCODFee(logisticsCompanyId, newCodAmount);
          updateData.codFee = codFeeResult.codFee;
          updateData.codFeeCalculationType = codFeeResult.calculationType;
          updateData.codAmount = newCodAmount;
        } catch (codError) {
          console.error('Error recalculating COD fee:', codError);
          // If calculation fails, set codFee to null but keep codAmount
          updateData.codFee = null;
          updateData.codFeeCalculationType = null;
          updateData.codAmount = newCodAmount;
        }
      } else {
        // No COD amount or no logistics company
        updateData.codFee = null;
        updateData.codFeeCalculationType = null;
        updateData.codAmount = newCodAmount > 0 ? newCodAmount : null;
      }
    } else {
      // COD fee explicitly provided (manual override)
      updateData.codFee = req.body.codFee !== null && req.body.codFee !== undefined 
        ? parseFloat(req.body.codFee) 
        : null;
      
      // Also update codAmount if not explicitly provided
      if (req.body.codAmount === undefined) {
        let newProductsTotal = 0;
        try {
          const newSelectedProducts = req.body.selectedProducts 
            ? (typeof req.body.selectedProducts === 'string' ? JSON.parse(req.body.selectedProducts) : req.body.selectedProducts)
            : (typeof existingOrder.selectedProducts === 'string' ? JSON.parse(existingOrder.selectedProducts) : (existingOrder.selectedProducts || []));
          const newProductQuantities = req.body.productQuantities
            ? (typeof req.body.productQuantities === 'string' ? JSON.parse(req.body.productQuantities) : req.body.productQuantities)
            : (typeof existingOrder.productQuantities === 'string' ? JSON.parse(existingOrder.productQuantities) : (existingOrder.productQuantities || {}));
          const newProductPrices = req.body.productPrices
            ? (typeof req.body.productPrices === 'string' ? JSON.parse(req.body.productPrices) : req.body.productPrices)
            : (typeof existingOrder.productPrices === 'string' ? JSON.parse(existingOrder.productPrices) : (existingOrder.productPrices || {}));
          
          newSelectedProducts.forEach(product => {
            const quantity = newProductQuantities[product.id] || product.quantity || 1;
            const price = newProductPrices[product.id] || product.price || product.currentRetailPrice || 0;
            newProductsTotal += price * quantity;
          });
        } catch (e) {
          // Ignore parsing errors
        }
        
        const newShippingCharges = req.body.shippingCharges !== undefined 
          ? (req.body.shippingCharges || 0)
          : (existingOrder.shippingCharges || 0);
        const newPaymentAmount = req.body.paymentAmount !== undefined 
          ? (req.body.paymentAmount || 0)
          : (existingOrder.paymentAmount || 0);
        
        const newBaseOrderTotal = newProductsTotal + newShippingCharges;
        const newCodAmount = newBaseOrderTotal - newPaymentAmount;
        updateData.codAmount = newCodAmount > 0 ? newCodAmount : null;
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id },
        data: updateData,
        include: {
          form: {
            select: {
              name: true,
              tenant: {
                select: {
                  businessName: true,
                  defaultCodFeePaidBy: true
                }
              }
            }
          }
        }
      });

      // Handle COD fee accounting entries if order is confirmed/dispatched/completed
      const orderStatus = updatedOrder.status;
      if (['CONFIRMED', 'DISPATCHED', 'COMPLETED'].includes(orderStatus)) {
        try {
          // Check if COD fee accounting entries exist
          const existingCodTransactions = await tx.transaction.findMany({
            where: {
              orderId: id,
              description: {
                contains: 'COD Fee'
              }
            }
          });

          const codFeeChanged = newCodFee !== oldCodFee;
          const codFeePaidByChanged = newCodFeePaidBy !== oldCodFeePaidBy;
          const finalCodFeePaidBy = newCodFeePaidBy || updatedOrder.form.tenant.defaultCodFeePaidBy || 'BUSINESS_OWNER';

          // Handle COD fee changes
          if (codFeeChanged || codFeePaidByChanged) {
            const codFeeDifference = newCodFee - oldCodFee;

            // Case 1: COD fee removed (newCodFee = 0, oldCodFee > 0)
            if (newCodFee === 0 && oldCodFee > 0 && existingCodTransactions.length > 0) {
              // Reverse all COD fee entries
              const arAccount = await accountingService.getAccountByCode('1200', existingOrder.tenantId);
              const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', existingOrder.tenantId);
              const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', existingOrder.tenantId);
              const codFeePayableAccount = await accountingService.getAccountByCode('2200', existingOrder.tenantId);

              // Reverse COD Fee Revenue if customer was paying
              if (oldCodFeePaidBy === 'CUSTOMER' && codFeeRevenueAccount && arAccount) {
                const reverseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
                await accountingService.createTransaction(
                  {
                    transactionNumber: reverseTransactionNumber,
                    date: new Date(),
                    description: `COD Fee Revenue Reversal (Edit): ${existingOrder.orderNumber}`,
                    tenantId: existingOrder.tenantId,
                    orderId: id
                  },
                  [
                    {
                      accountId: codFeeRevenueAccount.id,
                      debitAmount: oldCodFee,
                      creditAmount: 0
                    },
                    {
                      accountId: arAccount.id,
                      debitAmount: 0,
                      creditAmount: oldCodFee
                    }
                  ]
                );
                console.log(`✅ COD Fee Revenue reversed: Rs. ${oldCodFee} for order ${existingOrder.orderNumber}`);
              }

              // Reverse COD Fee Expense
              if (codFeeExpenseAccount && codFeePayableAccount) {
                const reverseExpenseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now() + 1}`;
                await accountingService.createTransaction(
                  {
                    transactionNumber: reverseExpenseTransactionNumber,
                    date: new Date(),
                    description: `COD Fee Expense Reversal (Edit): ${existingOrder.orderNumber}`,
                    tenantId: existingOrder.tenantId,
                    orderId: id
                  },
                  [
                    {
                      accountId: codFeePayableAccount.id,
                      debitAmount: oldCodFee,
                      creditAmount: 0
                    },
                    {
                      accountId: codFeeExpenseAccount.id,
                      debitAmount: 0,
                      creditAmount: oldCodFee
                    }
                  ]
                );
                console.log(`✅ COD Fee Expense reversed: Rs. ${oldCodFee} for order ${existingOrder.orderNumber}`);
              }
            }
            // Case 2: COD fee added (oldCodFee = 0, newCodFee > 0)
            else if (oldCodFee === 0 && newCodFee > 0) {
              // Create new COD fee entries
              const arAccount = await accountingService.getAccountByCode('1200', existingOrder.tenantId);
              
              // Add COD Fee Revenue if customer pays
              if (finalCodFeePaidBy === 'CUSTOMER' && arAccount) {
                const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', existingOrder.tenantId) ||
                  await accountingService.getOrCreateAccount({
                    code: '4400',
                    name: 'COD Fee Revenue',
                    type: 'INCOME',
                    tenantId: existingOrder.tenantId,
                    balance: 0
                  });

                const revenueTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
                await accountingService.createTransaction(
                  {
                    transactionNumber: revenueTransactionNumber,
                    date: new Date(),
                    description: `COD Fee Revenue (Edit): ${existingOrder.orderNumber}`,
                    tenantId: existingOrder.tenantId,
                    orderId: id
                  },
                  [
                    {
                      accountId: arAccount.id,
                      debitAmount: newCodFee,
                      creditAmount: 0
                    },
                    {
                      accountId: codFeeRevenueAccount.id,
                      debitAmount: 0,
                      creditAmount: newCodFee
                    }
                  ]
                );
                console.log(`✅ COD Fee Revenue created: Rs. ${newCodFee} for order ${existingOrder.orderNumber}`);
              }

              // Create COD Fee Expense (always)
              const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', existingOrder.tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '5200',
                  name: 'COD Fee Expense',
                  type: 'EXPENSE',
                  tenantId: existingOrder.tenantId,
                  balance: 0
                });

              const codFeePayableAccount = await accountingService.getAccountByCode('2200', existingOrder.tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '2200',
                  name: 'COD Fee Payable',
                  type: 'LIABILITY',
                  tenantId: existingOrder.tenantId,
                  balance: 0
                });

              const expenseTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now() + 1}`;
              await accountingService.createTransaction(
                {
                  transactionNumber: expenseTransactionNumber,
                  date: new Date(),
                  description: `COD Fee ${finalCodFeePaidBy === 'CUSTOMER' ? 'Expense' : 'Accrued'} (Edit): ${existingOrder.orderNumber}`,
                  tenantId: existingOrder.tenantId,
                  orderId: id
                },
                [
                  {
                    accountId: codFeeExpenseAccount.id,
                    debitAmount: newCodFee,
                    creditAmount: 0
                  },
                  {
                    accountId: codFeePayableAccount.id,
                    debitAmount: 0,
                    creditAmount: newCodFee
                  }
                ]
              );
              console.log(`✅ COD Fee Expense created: Rs. ${newCodFee} for order ${existingOrder.orderNumber}`);
            }
            // Case 3: COD fee amount changed
            else if (codFeeChanged && codFeeDifference !== 0) {
              const arAccount = await accountingService.getAccountByCode('1200', existingOrder.tenantId);
              
              // Adjust COD Fee Revenue if customer pays
              if (finalCodFeePaidBy === 'CUSTOMER' && arAccount) {
                const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', existingOrder.tenantId) ||
                  await accountingService.getOrCreateAccount({
                    code: '4400',
                    name: 'COD Fee Revenue',
                    type: 'INCOME',
                    tenantId: existingOrder.tenantId,
                    balance: 0
                  });

                const adjustmentTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
                await accountingService.createTransaction(
                  {
                    transactionNumber: adjustmentTransactionNumber,
                    date: new Date(),
                    description: `COD Fee Revenue Adjustment (Edit): ${existingOrder.orderNumber}`,
                    tenantId: existingOrder.tenantId,
                    orderId: id
                  },
                  [
                    {
                      accountId: arAccount.id,
                      debitAmount: codFeeDifference > 0 ? codFeeDifference : Math.abs(codFeeDifference),
                      creditAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0
                    },
                    {
                      accountId: codFeeRevenueAccount.id,
                      debitAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0,
                      creditAmount: codFeeDifference > 0 ? codFeeDifference : 0
                    }
                  ]
                );
                console.log(`✅ COD Fee Revenue adjusted: Rs. ${codFeeDifference} for order ${existingOrder.orderNumber}`);
              }

              // Adjust COD Fee Expense
              const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', existingOrder.tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '5200',
                  name: 'COD Fee Expense',
                  type: 'EXPENSE',
                  tenantId: existingOrder.tenantId,
                  balance: 0
                });

              const codFeePayableAccount = await accountingService.getAccountByCode('2200', existingOrder.tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '2200',
                  name: 'COD Fee Payable',
                  type: 'LIABILITY',
                  tenantId: existingOrder.tenantId,
                  balance: 0
                });

              const expenseAdjustmentTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now() + 1}`;
              await accountingService.createTransaction(
                {
                  transactionNumber: expenseAdjustmentTransactionNumber,
                  date: new Date(),
                  description: `COD Fee Expense Adjustment (Edit): ${existingOrder.orderNumber}`,
                  tenantId: existingOrder.tenantId,
                  orderId: id
                },
                [
                  {
                    accountId: codFeeExpenseAccount.id,
                    debitAmount: codFeeDifference > 0 ? codFeeDifference : 0,
                    creditAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0
                  },
                  {
                    accountId: codFeePayableAccount.id,
                    debitAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0,
                    creditAmount: codFeeDifference > 0 ? codFeeDifference : 0
                  }
                ]
              );
              console.log(`✅ COD Fee Expense adjusted: Rs. ${codFeeDifference} for order ${existingOrder.orderNumber}`);
            }
            // Case 4: COD fee amount same but payment preference changed
            else if (!codFeeChanged && codFeePaidByChanged && newCodFee > 0) {
              const arAccount = await accountingService.getAccountByCode('1200', existingOrder.tenantId);
              const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', existingOrder.tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '4400',
                  name: 'COD Fee Revenue',
                  type: 'INCOME',
                  tenantId: existingOrder.tenantId,
                  balance: 0
                });

              // If changed from BUSINESS_OWNER to CUSTOMER: Add revenue
              if (oldCodFeePaidBy !== 'CUSTOMER' && finalCodFeePaidBy === 'CUSTOMER' && arAccount) {
                const addRevenueTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
                await accountingService.createTransaction(
                  {
                    transactionNumber: addRevenueTransactionNumber,
                    date: new Date(),
                    description: `COD Fee Revenue Added (Preference Change): ${existingOrder.orderNumber}`,
                    tenantId: existingOrder.tenantId,
                    orderId: id
                  },
                  [
                    {
                      accountId: arAccount.id,
                      debitAmount: newCodFee,
                      creditAmount: 0
                    },
                    {
                      accountId: codFeeRevenueAccount.id,
                      debitAmount: 0,
                      creditAmount: newCodFee
                    }
                  ]
                );
                console.log(`✅ COD Fee Revenue added (preference change): Rs. ${newCodFee} for order ${existingOrder.orderNumber}`);
              }
              // If changed from CUSTOMER to BUSINESS_OWNER: Remove revenue
              else if (oldCodFeePaidBy === 'CUSTOMER' && finalCodFeePaidBy !== 'CUSTOMER' && arAccount) {
                const removeRevenueTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now()}`;
                await accountingService.createTransaction(
                  {
                    transactionNumber: removeRevenueTransactionNumber,
                    date: new Date(),
                    description: `COD Fee Revenue Removed (Preference Change): ${existingOrder.orderNumber}`,
                    tenantId: existingOrder.tenantId,
                    orderId: id
                  },
                  [
                    {
                      accountId: codFeeRevenueAccount.id,
                      debitAmount: newCodFee,
                      creditAmount: 0
                    },
                    {
                      accountId: arAccount.id,
                      debitAmount: 0,
                      creditAmount: newCodFee
                    }
                  ]
                );
                console.log(`✅ COD Fee Revenue removed (preference change): Rs. ${newCodFee} for order ${existingOrder.orderNumber}`);
              }
            }
          }
        } catch (codAccountingError) {
          console.error('⚠️  Error creating COD fee accounting entries during order update:', codAccountingError);
          // Don't fail the order update if accounting fails, but log the error
        }
      }

      return updatedOrder;
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
          status: { in: ['CONFIRMED', 'DISPATCHED', 'COMPLETED'] } // Include confirmed, dispatched, and completed orders for revenue calculation
        },
        select: {
          selectedProducts: true,
          productQuantities: true,
          productPrices: true,
          shippingCharges: true,
          codFee: true,
          codFeePaidBy: true
        }
      })
    ]);

    // Calculate total revenue from actual order totals (products + shipping + COD fee if customer pays)
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

        // Calculate order total (products + shipping + COD fee if customer pays)
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
        
        // Add COD fee if customer pays
        if (order.codFeePaidBy === 'CUSTOMER' && order.codFee && order.codFee > 0) {
          orderTotal += order.codFee;
        }

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
