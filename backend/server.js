const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const tenantRoutes = require('./routes/tenant');
const formRoutes = require('./routes/form');
const orderRoutes = require('./routes/order');
const productRoutes = require('./routes/product');
const productsRoutes = require('./routes/products');
const purchaseInvoiceRoutes = require('./routes/purchaseInvoice');
const returnRoutes = require('./routes/return');
const invoiceRoutes = require('./routes/invoice');
const uploadRoutes = require('./routes/upload');
const imageRoutes = require('./routes/images');
const customerRoutes = require('./routes/customer');

const app = express();
const PORT = process.env.PORT || 5000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
// CORS configuration - allow requests from frontend
const corsOptions = {
  origin: process.env.FRONTEND_URL 
    ? process.env.FRONTEND_URL.split(',') 
    : [
        'http://localhost:3000', 
        'https://asanorderui.onrender.com',
        'https://asanorder-ui.onrender.com'
      ],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(compression()); // Enable gzip compression for all responses
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/form', formRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/product', productRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/purchase-invoice', purchaseInvoiceRoutes);
app.use('/api/return', returnRoutes);
app.use('/api/invoice', invoiceRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/customer', customerRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
});
