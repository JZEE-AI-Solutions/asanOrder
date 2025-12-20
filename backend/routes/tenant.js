const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Clear all data for a tenant (Admin only) - DESTRUCTIVE OPERATION
router.delete('/:tenantId/clear-all-data', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { tenantId } = req.params;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    console.log(`🗑️ Clearing all data for tenant: ${tenant.businessName} (${tenantId})`);

    // Delete all tenant data in a transaction
    // Order matters due to foreign key constraints
    const result = await prisma.$transaction(async (tx) => {
      const stats = {
        orders: 0,
        products: 0,
        purchaseInvoices: 0,
        purchaseItems: 0,
        forms: 0,
        formFields: 0,
        customers: 0,
        customerLogs: 0,
        returns: 0,
        returnItems: 0,
        productLogs: 0
      };

      // Delete in order of dependencies (child entities first, respecting foreign keys)
      
      // 1. Delete ProductLogs first (references products and purchase_items)
      stats.productLogs = await tx.productLog.deleteMany({
        where: { tenantId }
      });

      // 2. Delete Orders (references forms, customers - must be deleted before forms)
      stats.orders = await tx.order.deleteMany({
        where: { tenantId }
      });

      // 3. Delete ReturnItems (references returns)
      // First get all returns for this tenant, then delete their items
      const tenantReturns = await tx.return.findMany({
        where: { tenantId },
        select: { id: true }
      });
      const returnIds = tenantReturns.map(r => r.id);
      
      if (returnIds.length > 0) {
        const returnItems = await tx.returnItem.deleteMany({
          where: {
            returnId: {
              in: returnIds
            }
          }
        });
        stats.returnItems = returnItems.count || 0;
      }

      // 4. Delete Returns (references purchase_invoices)
      stats.returns = await tx.return.deleteMany({
        where: { tenantId }
      });

      // 5. Delete PurchaseItems (references purchase_invoices and products)
      stats.purchaseItems = await tx.purchaseItem.deleteMany({
        where: { tenantId }
      });

      // 6. Delete PurchaseInvoices (no dependencies after purchase items are deleted)
      stats.purchaseInvoices = await tx.purchaseInvoice.deleteMany({
        where: { tenantId }
      });

      // 7. Delete Products (no dependencies after product logs and purchase items are deleted)
      stats.products = await tx.product.deleteMany({
        where: { tenantId }
      });

      // 8. Delete CustomerLogs (references customers)
      // First get all customers for this tenant, then delete their logs
      const tenantCustomers = await tx.customer.findMany({
        where: { tenantId },
        select: { id: true }
      });
      const customerIds = tenantCustomers.map(c => c.id);
      
      if (customerIds.length > 0) {
        const customerLogs = await tx.customerLog.deleteMany({
          where: {
            customerId: {
              in: customerIds
            }
          }
        });
        stats.customerLogs = customerLogs.count || 0;
      }

      // 9. Delete Customers (no dependencies after customer logs and orders are deleted)
      stats.customers = await tx.customer.deleteMany({
        where: { tenantId }
      });

      // 10. Delete FormFields (references forms - must be deleted before forms)
      stats.formFields = await tx.formField.deleteMany({
        where: {
          form: {
            tenantId
          }
        }
      });

      // 11. Delete Forms (no dependencies after form fields and orders are deleted)
      stats.forms = await tx.form.deleteMany({
        where: { tenantId }
      });

      return stats;
    }, {
      timeout: 60000 // 60 seconds timeout for large deletions
    });

    console.log(`✅ Cleared all data for tenant ${tenant.businessName}:`, result);

    res.json({
      success: true,
      message: `All data cleared successfully for ${tenant.businessName}`,
      stats: result
    });

  } catch (error) {
    console.error('Error clearing tenant data:', error);
    res.status(500).json({ 
      error: 'Failed to clear tenant data',
      details: error.message 
    });
  }
});

// Generate a unique 4-digit business code
async function generateBusinessCode() {
  const existingCodes = await prisma.tenant.findMany({
    select: { businessCode: true }
  });
  
  const usedCodes = new Set(existingCodes.map(t => t.businessCode));
  
  // Find the next available code starting from 1001
  let code = 1001;
  while (usedCodes.has(code.toString().padStart(4, '0'))) {
    code++;
  }
  
  return code.toString().padStart(4, '0');
}

// Create new tenant (Admin only)
router.post('/', authenticateToken, requireRole(['ADMIN']), [
  body('businessName').trim().isLength({ min: 2 }),
  body('contactPerson').trim().isLength({ min: 2 }),
  body('whatsappNumber').matches(/^\+92[0-9]{10}$/),
  body('businessType').isIn(['DRESS_SHOP', 'RESTAURANT', 'BAKERY', 'ELECTRONICS', 'GROCERY', 'OTHER']),
  body('ownerEmail').isEmail().normalizeEmail(),
  body('ownerName').trim().isLength({ min: 2 }),
  body('ownerPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      businessName, 
      contactPerson, 
      whatsappNumber, 
      businessType,
      ownerEmail,
      ownerName,
      ownerPassword
    } = req.body;

    // Check if business owner email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: ownerEmail }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password for business owner
    const hashedPassword = await bcrypt.hash(ownerPassword, 12);

    // Generate unique business code
    const businessCode = await generateBusinessCode();

    // Create business owner and tenant in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create business owner
      const owner = await tx.user.create({
        data: {
          email: ownerEmail,
          password: hashedPassword,
          name: ownerName,
          role: 'BUSINESS_OWNER'
        }
      });

      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          businessName,
          contactPerson,
          whatsappNumber,
          businessType,
          businessCode,
          ownerId: owner.id
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true
            }
          }
        }
      });

      return tenant;
    }, {
      timeout: 20000
    });

    res.status(201).json({
      message: 'Tenant and business owner created successfully',
      tenant: result
    });
  } catch (error) {
    console.error('Create tenant error:', error);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

// Get all tenants (Admin only)
router.get('/', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        },
        _count: {
          select: {
            forms: true,
            orders: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ tenants });
  } catch (error) {
    console.error('Get tenants error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to get tenants',
      message: error.message 
    });
  }
});

// Get single tenant (Admin or Business Owner)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        },
        forms: {
          select: {
            id: true,
            name: true,
            isPublished: true,
            formLink: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            orders: true
          }
        }
      }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== tenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ tenant });
  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({ error: 'Failed to get tenant' });
  }
});

// Update tenant (Admin or Business Owner)
router.put('/:id', authenticateToken, [
  body('businessName').optional().trim().isLength({ min: 2 }),
  body('contactPerson').optional().trim().isLength({ min: 2 }),
  body('whatsappNumber').optional().matches(/^\+92[0-9]{10}$/),
  body('businessAddress').optional().trim(),
  body('businessType').optional().isIn(['DRESS_SHOP', 'RESTAURANT', 'BAKERY', 'ELECTRONICS', 'GROCERY', 'OTHER'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Check if tenant exists
    const existingTenant = await prisma.tenant.findUnique({
      where: { id }
    });

    if (!existingTenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Check permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== existingTenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: filteredData,
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        }
      }
    });

    res.json({
      message: 'Tenant updated successfully',
      tenant
    });
  } catch (error) {
    console.error('Update tenant error:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// Get tenant by owner (for business owner dashboard)
router.get('/owner/me', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id },
      include: {
        forms: {
          select: {
            id: true,
            name: true,
            isPublished: true,
            formLink: true,
            createdAt: true,
            _count: {
              select: {
                orders: true
              }
            }
          }
        },
        _count: {
          select: {
            orders: true
          }
        }
      }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'No tenant found for this business owner' });
    }

    res.json({ tenant });
  } catch (error) {
    console.error('Get owner tenant error:', error);
    res.status(500).json({ error: 'Failed to get tenant information' });
  }
});

// Update tenant by owner (for business owner settings)
router.put('/owner/me', authenticateToken, requireRole(['BUSINESS_OWNER']), [
  body('businessName').optional().trim().isLength({ min: 2 }),
  body('contactPerson').optional().trim().isLength({ min: 2 }),
  body('whatsappNumber').optional().matches(/^\+92[0-9]{10}$/),
  body('businessAddress').optional().trim(),
  body('businessType').optional().isIn(['DRESS_SHOP', 'RESTAURANT', 'BAKERY', 'ELECTRONICS', 'GROCERY', 'OTHER'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Find tenant by owner ID
    const existingTenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!existingTenant) {
      return res.status(404).json({ error: 'No tenant found for this business owner' });
    }

    const updateData = req.body;
    
    // Only include fields that are provided and valid
    const allowedFields = ['businessName', 'contactPerson', 'whatsappNumber', 'businessAddress', 'businessType'];
    const filteredData = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id: existingTenant.id },
      data: filteredData,
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        }
      }
    });

    res.json({
      message: 'Tenant updated successfully',
      tenant
    });
  } catch (error) {
    console.error('Update owner tenant error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta
    });
    res.status(500).json({ 
      error: 'Failed to update tenant',
      details: error.message,
      code: error.code
    });
  }
});

module.exports = router;
