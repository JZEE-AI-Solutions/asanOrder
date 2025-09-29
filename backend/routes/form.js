const express = require('express');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Create new form (Admin or Business Owner)
router.post('/', authenticateToken, requireRole(['ADMIN', 'BUSINESS_OWNER']), [
  body('name').trim().isLength({ min: 2 }),
  body('description').optional().trim(),
  body('fields').isArray({ min: 1 }),
  body('fields.*.label').trim().isLength({ min: 1 }),
  body('fields.*.fieldType').isIn(['TEXT', 'EMAIL', 'PHONE', 'ADDRESS', 'FILE_UPLOAD', 'AMOUNT', 'TEXTAREA', 'DROPDOWN', 'PRODUCT_SELECTOR']),
  body('fields.*.isRequired').isBoolean(),
  body('fields.*.placeholder').optional().trim(),
  body('fields.*.options').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, fields } = req.body;
    
    console.log('Form creation request:', { name, description, fieldsLength: fields?.length });
    console.log('Fields:', fields);

    // Get tenant ID
    let tenantId;
    if (req.user.role === 'ADMIN') {
      // Admin must specify tenant ID
      tenantId = req.body.tenantId;
      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant ID is required for admin users' });
      }
    } else {
      // Business owner uses their own tenant
      const tenant = await prisma.tenant.findUnique({
        where: { ownerId: req.user.id }
      });
      if (!tenant) {
        return res.status(404).json({ error: 'No tenant found for this user' });
      }
      tenantId = tenant.id;
    }

    // Generate unique form link
    const formLink = crypto.randomBytes(16).toString('hex');
    
    // Create form first
    const form = await prisma.form.create({
      data: {
        name,
        description,
        tenantId,
        formLink
      }
    });

    // Create form fields sequentially
    const formFields = [];
    for (let index = 0; index < fields.length; index++) {
      const field = fields[index];
      const formField = await prisma.formField.create({
        data: {
          label: field.label,
          fieldType: field.fieldType,
          isRequired: field.isRequired,
          placeholder: field.placeholder,
          options: field.options ? JSON.stringify(field.options) : null,
          selectedProducts: field.fieldType === 'PRODUCT_SELECTOR' && field.selectedProducts 
            ? JSON.stringify(field.selectedProducts) 
            : null,
          order: index,
          formId: form.id
        }
      });
      formFields.push(formField);
    }

    const result = { ...form, fields: formFields };

    res.status(201).json({
      message: 'Form created successfully',
      form: result
    });
  } catch (error) {
    console.error('Create form error:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      meta: error.meta
    });
    res.status(500).json({ 
      error: 'Failed to create form',
      details: error.message,
      code: error.code
    });
  }
});

// Get forms for tenant (Admin or Business Owner)
router.get('/', authenticateToken, async (req, res) => {
  try {
    let whereClause = {};

    if (req.user.role === 'BUSINESS_OWNER') {
      // Business owner can only see their own published, visible forms
      const tenant = await prisma.tenant.findUnique({
        where: { ownerId: req.user.id }
      });
      if (!tenant) {
        return res.status(404).json({ error: 'No tenant found for this user' });
      }
      whereClause.tenantId = tenant.id;
      whereClause.isPublished = true; // Only published forms
      whereClause.isHidden = false; // Only visible forms
    } else if (req.query.tenantId && req.user.role === 'ADMIN') {
      // Admin can filter by tenant ID
      whereClause.tenantId = req.query.tenantId;
    }

    const forms = await prisma.form.findMany({
      where: {
        ...whereClause,
        isHidden: false // Exclude hidden forms by default
      },
      include: {
        fields: {
          orderBy: { order: 'asc' }
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
      }
    });

    res.json({ forms });
  } catch (error) {
    console.error('Get forms error:', error);
    res.status(500).json({ error: 'Failed to get forms' });
  }
});

// Get single form by ID (Admin or Business Owner)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const form = await prisma.form.findUnique({
      where: { id },
      include: {
        fields: {
          orderBy: { order: 'asc' }
        },
        tenant: {
          select: {
            id: true,
            businessName: true,
            businessType: true,
            ownerId: true
          }
        }
      }
    });

    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Check permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== form.tenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ form });
  } catch (error) {
    console.error('Get form error:', error);
    res.status(500).json({ error: 'Failed to get form' });
  }
});

// Get form by link (public access)
router.get('/public/:formLink', async (req, res) => {
  try {
    const { formLink } = req.params;

    const form = await prisma.form.findUnique({
      where: { 
        formLink,
        isPublished: true 
      },
      include: {
        fields: {
          orderBy: { order: 'asc' }
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

    if (!form) {
      return res.status(404).json({ error: 'Form not found or not published' });
    }

    res.json({ form });
  } catch (error) {
    console.error('Get public form error:', error);
    res.status(500).json({ error: 'Failed to get form' });
  }
});

// Publish form (Admin or Business Owner)
router.post('/:id/publish', authenticateToken, requireRole(['ADMIN', 'BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    const form = await prisma.form.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            ownerId: true,
            whatsappNumber: true,
            businessName: true
          }
        }
      }
    });

    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Check permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== form.tenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Generate unique form link
    const formLink = crypto.randomBytes(16).toString('hex');
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const fullFormUrl = `${baseUrl}/form/${formLink}`;

    const updatedForm = await prisma.form.update({
      where: { id },
      data: {
        isPublished: true,
        formLink
      },
      include: {
        fields: {
          orderBy: { order: 'asc' }
        }
      }
    });

    // TODO: Send WhatsApp message to business owner with form link
    // This would integrate with Twilio WhatsApp API
    console.log(`Form published! Send this link to ${form.tenant.whatsappNumber}: ${fullFormUrl}`);

    res.json({
      message: 'Form published successfully',
      form: updatedForm,
      formUrl: fullFormUrl
    });
  } catch (error) {
    console.error('Publish form error:', error);
    res.status(500).json({ error: 'Failed to publish form' });
  }
});

// Unpublish form (Admin or Business Owner)
router.post('/:id/unpublish', authenticateToken, requireRole(['ADMIN', 'BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    const form = await prisma.form.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            ownerId: true
          }
        }
      }
    });

    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Check permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== form.tenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updatedForm = await prisma.form.update({
      where: { id },
      data: {
        isPublished: false,
        formLink: null
      }
    });

    res.json({
      message: 'Form unpublished successfully',
      form: updatedForm
    });
  } catch (error) {
    console.error('Unpublish form error:', error);
    res.status(500).json({ error: 'Failed to unpublish form' });
  }
});

// Update form (Admin or Business Owner)
router.put('/:id', authenticateToken, requireRole(['ADMIN', 'BUSINESS_OWNER']), [
  body('name').optional().trim().isLength({ min: 2 }),
  body('description').optional().trim(),
  body('fields').optional().isArray({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, description, fields, isPublished } = req.body;

    const form = await prisma.form.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            ownerId: true
          }
        }
      }
    });

    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Check permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== form.tenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update form basic info first
    const updatedForm = await prisma.form.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(isPublished !== undefined && { isPublished })
      }
    });

    let result = updatedForm;

    // If fields are provided, update them
    if (fields) {
      // Delete existing fields
      await prisma.formField.deleteMany({
        where: { formId: id }
      });

      // Create new fields sequentially to avoid transaction timeout
      const newFields = [];
      for (let index = 0; index < fields.length; index++) {
        const field = fields[index];
        const newField = await prisma.formField.create({
          data: {
            label: field.label,
            fieldType: field.fieldType,
            isRequired: field.isRequired,
            placeholder: field.placeholder,
            options: field.options ? JSON.stringify(field.options) : null,
            selectedProducts: field.fieldType === 'PRODUCT_SELECTOR' && field.selectedProducts 
              ? JSON.stringify(field.selectedProducts) 
              : null,
            order: index,
            formId: id
          }
        });
        newFields.push(newField);
      }

      result = { ...updatedForm, fields: newFields };
    }

    res.json({
      message: 'Form updated successfully',
      form: result
    });
  } catch (error) {
    console.error('Update form error:', error);
    res.status(500).json({ error: 'Failed to update form' });
  }
});

// Delete form (Admin or Business Owner)
router.delete('/:id', authenticateToken, requireRole(['ADMIN', 'BUSINESS_OWNER']), async (req, res) => {
  try {
    const { id } = req.params;

    const form = await prisma.form.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            ownerId: true
          }
        },
        _count: {
          select: {
            orders: true
          }
        }
      }
    });

    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Check permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== form.tenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if form has orders
    if (form._count.orders > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete form with existing orders. Hide the form instead.',
        ordersCount: form._count.orders
      });
    }

    // Delete form and its fields in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete form fields first
      await tx.formField.deleteMany({
        where: { formId: id }
      });

      // Delete form
      await tx.form.delete({
        where: { id }
      });
    });

    res.json({ message: 'Form deleted successfully' });
  } catch (error) {
    console.error('Delete form error:', error);
    res.status(500).json({ error: 'Failed to delete form' });
  }
});

// Hide/Show form (Admin or Business Owner)
router.patch('/:id/visibility', authenticateToken, requireRole(['ADMIN', 'BUSINESS_OWNER']), [
  body('isHidden').isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { isHidden } = req.body;

    const form = await prisma.form.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            ownerId: true
          }
        }
      }
    });

    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Check permissions
    if (req.user.role !== 'ADMIN' && req.user.id !== form.tenant.ownerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update form visibility
    const updatedForm = await prisma.form.update({
      where: { id },
      data: { isHidden }
    });

    res.json({
      message: `Form ${isHidden ? 'hidden' : 'shown'} successfully`,
      form: updatedForm
    });
  } catch (error) {
    console.error('Update form visibility error:', error);
    res.status(500).json({ error: 'Failed to update form visibility' });
  }
});

module.exports = router;
