const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

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
    res.status(500).json({ error: 'Failed to get tenants' });
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
      data: updateData,
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

module.exports = router;
