const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const prisma = require('../lib/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Register new user (Admin only for creating business owners and stock keepers)
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().isLength({ min: 2 }),
  body('role').isIn(['ADMIN', 'BUSINESS_OWNER', 'STOCK_KEEPER'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, name, role } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    res.status(201).json({ 
      message: 'User created successfully',
      user 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        tenant: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        tenant: true
      }
    });

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// Update user profile (name, email)
router.put('/me', authenticateToken, [
  body('name').optional().trim().isLength({ min: 2 }),
  body('email').optional().isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (email) {
      // Check if email is already taken by another user
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });
      if (existingUser && existingUser.id !== req.user.id) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      updateData.email = email;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.put('/me/password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Create admin user (for initial setup)
router.post('/setup-admin', async (req, res) => {
  try {
    // Check if any admin exists
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin user already exists' });
    }

    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'ADMIN'
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    res.status(201).json({ 
      message: 'Admin user created successfully',
      user: admin 
    });
  } catch (error) {
    console.error('Admin setup error:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
});

// Seed database with initial users (for deployment setup)
// ⚠️ Only works if database is empty - safe to call multiple times
router.post('/seed', async (req, res) => {
  try {
    // Check if any users exist
    const userCount = await prisma.user.count();
    
    if (userCount > 0) {
      return res.json({ 
        message: `Database already has ${userCount} user(s). No seeding needed.`,
        usersExist: true 
      });
    }

    console.log('🌱 Seeding database via API...');

    // Create Admin user
    const adminPassword = await bcrypt.hash('admin123', 12);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@orderms.com' },
      update: {},
      create: {
        email: 'admin@orderms.com',
        password: adminPassword,
        name: 'System Administrator',
        role: 'ADMIN'
      }
    });

    // Create Stock Keeper user
    const stockKeeperPassword = await bcrypt.hash('stock123', 12);
    const stockKeeper = await prisma.user.upsert({
      where: { email: 'stock@orderms.com' },
      update: {},
      create: {
        email: 'stock@orderms.com',
        password: stockKeeperPassword,
        name: 'Stock Keeper',
        role: 'STOCK_KEEPER'
      }
    });

    // Create Business Owner user
    const businessOwnerPassword = await bcrypt.hash('business123', 12);
    const businessOwner = await prisma.user.upsert({
      where: { email: 'business@dressshop.com' },
      update: {},
      create: {
        email: 'business@dressshop.com',
        password: businessOwnerPassword,
        name: 'Sarah Ahmed',
        role: 'BUSINESS_OWNER'
      }
    });

    // Create Tenant
    const tenant = await prisma.tenant.upsert({
      where: { ownerId: businessOwner.id },
      update: {},
      create: {
        businessName: 'Elegant Dress Orders',
        contactPerson: 'Sarah Ahmed',
        whatsappNumber: '+923001234567',
        businessType: 'DRESS_SHOP',
        businessCode: '1001',
        ownerId: businessOwner.id
      }
    });

    res.json({
      message: 'Database seeded successfully!',
      usersCreated: {
        admin: admin.email,
        stockKeeper: stockKeeper.email,
        businessOwner: businessOwner.email
      },
      tenant: tenant.businessName,
      credentials: {
        admin: 'admin@orderms.com / admin123',
        businessOwner: 'business@dressshop.com / business123',
        stockKeeper: 'stock@orderms.com / stock123'
      }
    });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ error: 'Failed to seed database', details: error.message });
  }
});

module.exports = router;
