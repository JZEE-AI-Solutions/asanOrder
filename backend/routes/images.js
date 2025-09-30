const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const imageStorage = require('../services/imageStorage');

const router = express.Router();

// Public image serving endpoint (no authentication required)
router.get('/public/:entityType/:entityId', async (req, res) => {
  const startTime = Date.now();
  const { entityType, entityId } = req.params;

  try {
    // Validate entity type
    const validEntityTypes = ['product', 'invoice', 'return', 'order', 'purchase-item'];
    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    // Create ETag for cache validation (before database query)
    const etag = `"${entityId}-${Date.now()}"`;
    
    // Check if client has cached version first (optimization)
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end(); // Not Modified
    }

    // Get image data with timeout
    const imageData = await Promise.race([
      imageStorage.getImage(entityType, entityId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Image fetch timeout')), 10000) // 10 second timeout
      )
    ]);

    if (!imageData) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Log performance for debugging
    const fetchTime = Date.now() - startTime;
    if (fetchTime > 1000) { // Log if it takes more than 1 second
      console.log(`Slow image fetch: ${entityType}/${entityId} took ${fetchTime}ms`);
    }

    // Set appropriate headers with compression and caching
    res.set({
      'Content-Type': imageData.mimeType,
      'Content-Length': imageData.size,
      'Cache-Control': 'public, max-age=3600, immutable', // Cache for 1 hour, immutable
      'ETag': etag,
      'Last-Modified': imageData.updatedAt ? new Date(imageData.updatedAt).toUTCString() : new Date().toUTCString(),
      'Vary': 'Accept-Encoding', // Support compression
      'X-Content-Type-Options': 'nosniff' // Security header
    });

    // Send image data with compression
    res.send(imageData.data);

  } catch (error) {
    const fetchTime = Date.now() - startTime;
    console.error(`Error serving public image ${entityType}/${entityId} (${fetchTime}ms):`, error.message);
    
    if (error.message === 'Image fetch timeout') {
      res.status(504).json({ error: 'Image request timeout' });
    } else {
      res.status(500).json({ error: 'Failed to serve image' });
    }
  }
});

// Serve image from database or filesystem
router.get('/:entityType/:entityId', authenticateToken, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    // Validate entity type
    const validEntityTypes = ['product', 'invoice', 'return', 'order', 'purchase-item'];
    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    // Get image data
    const imageData = await imageStorage.getImage(entityType, entityId);

    if (!imageData) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Set appropriate headers
    res.set({
      'Content-Type': imageData.mimeType,
      'Content-Length': imageData.size,
      'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      'ETag': `"${entityId}"`
    });

    // Send image data
    res.send(imageData.data);

  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Upload image to database
router.post('/:entityType/:entityId', authenticateToken, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    
    console.log('Image upload request:', { entityType, entityId, hasImageData: !!req.body.imageData, mimeType: req.body.mimeType });

    // Validate entity type
    const validEntityTypes = ['product', 'invoice', 'return', 'order', 'purchase-item'];
    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    // Check if image data is provided
    if (!req.body.imageData || !req.body.mimeType) {
      return res.status(400).json({ error: 'Image data and MIME type are required' });
    }

    // Convert base64 to buffer
    const imageBuffer = imageStorage.base64ToBuffer(req.body.imageData);

    // Store image
    const result = await imageStorage.storeImage(
      imageBuffer,
      req.body.mimeType,
      entityType,
      entityId
    );

    // If this is a purchase item image upload, update purchase item and sync with product
    if (entityType === 'purchase-item') {
      try {
        const prisma = require('../lib/db');
        
        // Get the purchase item to find the associated product
        const purchaseItem = await prisma.purchaseItem.findUnique({
          where: { id: entityId },
          include: { tenant: true }
        });

        if (purchaseItem) {
          // Update the purchase item with the new image
          await prisma.purchaseItem.update({
            where: { id: entityId },
            data: {
              imageData: imageBuffer,
              imageType: req.body.mimeType
            }
          });

          // Find or create the product
          let product = await prisma.product.findFirst({
            where: {
              name: purchaseItem.name,
              tenantId: purchaseItem.tenantId
            }
          });

          const isNewProduct = !product;
          const hadExistingImage = product && product.imageData;

          if (!product) {
            // Create product if it doesn't exist
            product = await prisma.product.create({
              data: {
                name: purchaseItem.name,
                description: purchaseItem.description,
                category: purchaseItem.category,
                sku: purchaseItem.sku,
                currentQuantity: purchaseItem.quantity,
                lastPurchasePrice: purchaseItem.purchasePrice,
                tenantId: purchaseItem.tenantId,
                imageData: imageBuffer,
                imageType: req.body.mimeType
              }
            });
          } else {
            // Update existing product with image
            await prisma.product.update({
              where: { id: product.id },
              data: {
                imageData: imageBuffer,
                imageType: req.body.mimeType,
                lastUpdated: new Date()
              }
            });
          }

          // Create product log entry with appropriate action
          const action = hadExistingImage ? 'IMAGE_CHANGED' : 'IMAGE_UPLOADED';
          const reason = hadExistingImage 
            ? `Product image changed for purchase item: ${purchaseItem.name}`
            : `Product image uploaded for purchase item: ${purchaseItem.name}`;

          await prisma.productLog.create({
            data: {
              productId: product.id,
              action: action,
              reason: reason,
              quantity: 0,
              oldQuantity: product.currentQuantity,
              newQuantity: product.currentQuantity,
              oldPrice: product.lastPurchasePrice,
              newPrice: product.lastPurchasePrice,
              tenantId: purchaseItem.tenantId,
              purchaseItemId: purchaseItem.id
            }
          });
        }
      } catch (logError) {
        console.error('Error creating product log for image upload:', logError);
        // Don't fail the image upload if logging fails
      }
    }

    res.json({
      message: 'Image uploaded successfully',
      result
    });

  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Delete image from database
router.delete('/:entityType/:entityId', authenticateToken, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    // Validate entity type
    const validEntityTypes = ['product', 'invoice', 'return', 'order', 'purchase-item'];
    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    // Delete image
    const result = await imageStorage.deleteImage(entityType, entityId);

    res.json({
      message: 'Image deleted successfully',
      result
    });

  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Get image info (metadata only)
router.get('/:entityType/:entityId/info', authenticateToken, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    // Validate entity type
    const validEntityTypes = ['product', 'invoice', 'return', 'order', 'purchase-item'];
    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    // Get image data
    const imageData = await imageStorage.getImage(entityType, entityId);

    if (!imageData) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Return metadata only
    res.json({
      mimeType: imageData.mimeType,
      size: imageData.size,
      hasImage: true
    });

  } catch (error) {
    console.error('Error getting image info:', error);
    res.status(500).json({ error: 'Failed to get image info' });
  }
});

module.exports = router;
