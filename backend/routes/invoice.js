const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { processInvoiceImage, processInvoiceText } = require('../services/openaiService');
const { generateInvoiceNumber } = require('../utils/invoiceNumberGenerator');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/invoices');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'invoice-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Process invoice image and extract products
router.post('/process-image', authenticateToken, requireRole(['BUSINESS_OWNER']), upload.single('invoice'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No invoice image provided' });
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured. Please contact administrator.' 
      });
    }

    // Get tenant for invoice number generation
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const imagePath = req.file.path;
    
    try {
      // Process the invoice image
      const result = await processInvoiceImage(imagePath);
      
      // Clean up the uploaded file
      fs.unlinkSync(imagePath);
      
      // Calculate total amounts
      const productsTotal = result.products.reduce((sum, p) => sum + (p.purchasePrice * p.quantity), 0);
      const returnsTotal = result.returns.reduce((sum, r) => sum + (r.purchasePrice * r.quantity), 0);
      const netTotal = productsTotal - returnsTotal;
      
      // Generate invoice number using the same convention as orders
      const invoiceNumber = await generateInvoiceNumber(tenant.id);
      
      res.json({
        message: 'Invoice processed successfully',
        products: result.products,
        returns: result.returns,
        hasReturns: result.hasReturns,
        counts: {
          products: result.products.length,
          returns: result.returns.length,
          total: result.products.length + result.returns.length
        },
        amounts: {
          productsTotal,
          returnsTotal,
          netTotal
        },
        invoiceData: {
          invoiceNumber,
          invoiceDate: new Date().toISOString(),
          totalAmount: netTotal
        }
      });
      
    } catch (processingError) {
      // Clean up the uploaded file on error
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      
      console.error('Invoice processing error:', processingError);
      res.status(400).json({ 
        error: 'Failed to process invoice image',
        details: processingError.message 
      });
    }
    
  } catch (error) {
    console.error('Invoice upload error:', error);
    res.status(500).json({ error: 'Failed to process invoice' });
  }
});

// Process invoice text (alternative method)
router.post('/process-text', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { invoiceText } = req.body;
    
    if (!invoiceText || invoiceText.trim().length === 0) {
      return res.status(400).json({ error: 'Invoice text is required' });
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured. Please contact administrator.' 
      });
    }

    // Get tenant for invoice number generation
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    try {
      // Process the invoice text
      const result = await processInvoiceText(invoiceText);
      
      // Calculate total amounts
      const productsTotal = result.products.reduce((sum, p) => sum + (p.purchasePrice * p.quantity), 0);
      const returnsTotal = result.returns.reduce((sum, r) => sum + (r.purchasePrice * r.quantity), 0);
      const netTotal = productsTotal - returnsTotal;
      
      // Generate invoice number using the same convention as orders
      const invoiceNumber = await generateInvoiceNumber(tenant.id);
      
      res.json({
        message: 'Invoice processed successfully',
        products: result.products,
        returns: result.returns,
        hasReturns: result.hasReturns,
        counts: {
          products: result.products.length,
          returns: result.returns.length,
          total: result.products.length + result.returns.length
        },
        amounts: {
          productsTotal,
          returnsTotal,
          netTotal
        },
        invoiceData: {
          invoiceNumber,
          invoiceDate: new Date().toISOString(),
          totalAmount: netTotal
        }
      });
      
    } catch (processingError) {
      console.error('Invoice processing error:', processingError);
      res.status(400).json({ 
        error: 'Failed to process invoice text',
        details: processingError.message 
      });
    }
    
  } catch (error) {
    console.error('Invoice text processing error:', error);
    res.status(500).json({ error: 'Failed to process invoice text' });
  }
});

// Get supported file types
router.get('/supported-formats', authenticateToken, requireRole(['BUSINESS_OWNER']), (req, res) => {
  res.json({
    supportedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxFileSize: '10MB',
    features: [
      'Automatic product extraction',
      'Price and quantity detection',
      'Category identification',
      'SKU extraction'
    ]
  });
});

module.exports = router;
