const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const imageStorage = require('../services/imageStorage');

const router = express.Router();

// Public image serving endpoint (no authentication required)
router.get('/public/:entityType/:entityId', async (req, res) => {
  const startTime = Date.now();
  const { entityType, entityId } = req.params;
    const { imageId } = req.query; // For product/variant media, imageId specifies which item

  try {
    // Validate entity type
    const validEntityTypes = ['product', 'invoice', 'return', 'order', 'purchase-item', 'product-variant'];
    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    // Create ETag for cache validation (before database query)
    const etag = `"${entityId}-${imageId || ''}-${Date.now()}"`;
    
    // Check if client has cached version first (optimization)
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end(); // Not Modified
    }

    let imageData;

    // Special handling for product media (multiple photos/videos, primary)
    if (entityType === 'product') {
      const prisma = require('../lib/db');
      let productMedia;
      if (imageId) {
        productMedia = await prisma.productImage.findUnique({
          where: { id: imageId },
          select: { mediaData: true, mediaType: true, createdAt: true, productId: true }
        });
        if (productMedia && productMedia.productId !== entityId) {
          productMedia = null;
        }
      } else {
        productMedia = await prisma.productImage.findFirst({
          where: { productId: entityId },
          orderBy: [
            { isPrimary: 'desc' },
            { sortOrder: 'asc' },
            { createdAt: 'asc' }
          ],
          select: { mediaData: true, mediaType: true, createdAt: true }
        });
      }
      if (productMedia && productMedia.mediaData) {
        imageData = {
          data: productMedia.mediaData,
          mimeType: productMedia.mediaType,
          size: productMedia.mediaData.length,
          updatedAt: productMedia.createdAt
        };
      } else {
        // Fallback to legacy Product.imageData
        imageData = await Promise.race([
          imageStorage.getImage(entityType, entityId),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Image fetch timeout')), 10000)
        )
        ]);
      }
    } else if (entityType === 'product-variant') {
    // Special handling for product-variant images/videos
      const prisma = require('../lib/db');
      let variantImage;
      
      if (imageId) {
        // Get specific image by imageId
        variantImage = await prisma.productVariantImage.findUnique({
          where: { id: imageId },
          select: { imageData: true, imageType: true, createdAt: true }
        });
        
        // Verify it belongs to the variant
        if (variantImage) {
          const variant = await prisma.productVariant.findFirst({
            where: { id: entityId },
            select: { id: true }
          });
          if (!variant) {
            return res.status(404).json({ error: 'Variant not found' });
          }
        }
      } else {
        // Get primary image or first image
        variantImage = await prisma.productVariantImage.findFirst({
          where: { productVariantId: entityId },
          orderBy: [
            { isPrimary: 'desc' },
            { sortOrder: 'asc' },
            { createdAt: 'asc' }
          ],
          select: { imageData: true, imageType: true, createdAt: true }
        });
      }
      
      if (!variantImage || !variantImage.imageData) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      imageData = {
        data: variantImage.imageData,
        mimeType: variantImage.imageType,
        size: variantImage.imageData.length,
        updatedAt: variantImage.createdAt
      };
    } else {
      // Get image data with timeout for other entity types
      imageData = await Promise.race([
        imageStorage.getImage(entityType, entityId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Image fetch timeout')), 10000) // 10 second timeout
        )
      ]);
    }

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
    const validEntityTypes = ['product', 'invoice', 'return', 'order', 'purchase-item', 'product-variant'];
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
    const validEntityTypes = ['product', 'invoice', 'return', 'order', 'purchase-item', 'product-variant'];
    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    // Check if image data is provided
    if (!req.body.imageData || !req.body.mimeType) {
      return res.status(400).json({ error: 'Image data and MIME type are required' });
    }

    // Convert base64 to buffer
    let imageBuffer;
    try {
      imageBuffer = imageStorage.base64ToBuffer(req.body.imageData);
    } catch (error) {
      console.error('Error converting base64 to buffer:', error);
      return res.status(400).json({ error: 'Invalid image data format' });
    }

    // Store image (skip for product and product-variant as they use separate tables)
    let result = null;
    if (entityType !== 'product-variant' && entityType !== 'product') {
      result = await imageStorage.storeImage(
        imageBuffer,
        req.body.mimeType,
        entityType,
        entityId
      );
    }

    // Product media upload: add to ProductImage (multiple photos/videos, primary)
    if (entityType === 'product') {
      try {
        const prisma = require('../lib/db');
        const product = await prisma.product.findUnique({
          where: { id: entityId },
          include: { tenant: true }
        });
        if (!product) {
          return res.status(404).json({ error: 'Product not found' });
        }
        if (req.user.role !== 'ADMIN' && req.user.tenant?.id !== product.tenantId) {
          return res.status(403).json({ error: 'Access denied' });
        }
        const isPrimary = req.body.isPrimary === true;
        const existingCount = await prisma.productImage.count({ where: { productId: entityId } });
        const setAsPrimary = isPrimary || existingCount === 0;
        if (setAsPrimary) {
          await prisma.productImage.updateMany({
            where: { productId: entityId },
            data: { isPrimary: false }
          });
        }
        const productImage = await prisma.productImage.create({
          data: {
            productId: entityId,
            mediaData: imageBuffer,
            mediaType: req.body.mimeType,
            isPrimary: setAsPrimary,
            sortOrder: req.body.sortOrder != null ? req.body.sortOrder : existingCount
          }
        });
        try {
          await prisma.productLog.create({
            data: {
              action: 'IMAGE_UPLOADED',
              reason: 'Product media uploaded',
              reference: `Product: ${product.name}`,
              notes: 'Product photo/video uploaded',
              tenantId: product.tenantId,
              productId: product.id
            }
          });
        } catch (logError) {
          console.error('Error creating product log for image upload:', logError);
        }
        return res.json({
          success: true,
          message: 'Product media uploaded successfully',
          image: {
            id: productImage.id,
            isPrimary: productImage.isPrimary,
            mediaType: productImage.mediaType,
            sortOrder: productImage.sortOrder,
            createdAt: productImage.createdAt
          }
        });
      } catch (error) {
        console.error('Error uploading product media:', error);
        return res.status(500).json({ error: 'Failed to upload product media' });
      }
    }
    // If this is a purchase item image upload, update purchase item and sync with product
    else if (entityType === 'purchase-item') {
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
            const purchasePrice = purchaseItem.purchasePrice || 0;
            const defaultRetail = purchasePrice * 1.5; // 50% markup when creating from purchase
            product = await prisma.product.create({
              data: {
                name: purchaseItem.name,
                description: purchaseItem.description,
                category: purchaseItem.category,
                sku: purchaseItem.sku,
                currentQuantity: purchaseItem.quantity,
                lastPurchasePrice: purchasePrice,
                currentRetailPrice: defaultRetail,
                lastSalePrice: defaultRetail,
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
    // If this is a product variant image upload, store in ProductVariantImage table
    if (entityType === 'product-variant') {
      try {
        const prisma = require('../lib/db');
        
        // Get the variant to verify it exists
        const variant = await prisma.productVariant.findUnique({
          where: { id: entityId },
          include: {
            product: {
              include: { tenant: true }
            }
          }
        });

        if (!variant) {
          return res.status(404).json({ error: 'Product variant not found' });
        }

        // Check if user has access to this tenant
        if (req.user.role !== 'ADMIN' && req.user.tenant?.id !== variant.product.tenantId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        // If this is set as primary, unset other primary images
        const isPrimary = req.body.isPrimary || false;
        if (isPrimary) {
          await prisma.productVariantImage.updateMany({
            where: {
              productVariantId: entityId,
              isPrimary: true
            },
            data: {
              isPrimary: false
            }
          });
        }

        // Create variant image
        const variantImage = await prisma.productVariantImage.create({
          data: {
            productVariantId: entityId,
            imageData: imageBuffer,
            imageType: req.body.mimeType,
            isPrimary: isPrimary,
            sortOrder: req.body.sortOrder || 0
          }
        });

        // Create product log entry
        try {
          await prisma.productLog.create({
            data: {
              action: 'VARIANT_IMAGE_UPLOADED',
              reason: 'Variant image uploaded',
              reference: `Product: ${variant.product.name}`,
              notes: `Variant image uploaded: ${variant.color}${variant.size ? `, ${variant.size}` : ''}`,
              tenantId: variant.product.tenantId,
              productId: variant.productId,
              productVariantId: variant.id
            }
          });
        } catch (logError) {
          console.error('Error creating product log for variant image upload:', logError);
        }

        return res.json({
          success: true,
          message: 'Variant image uploaded successfully',
          image: {
            id: variantImage.id,
            isPrimary: variantImage.isPrimary,
            sortOrder: variantImage.sortOrder,
            createdAt: variantImage.createdAt
          }
        });
      } catch (error) {
        console.error('Error uploading variant image:', error);
        console.error('Error stack:', error.stack);
        return res.status(500).json({ 
          error: 'Failed to upload variant image', 
          details: process.env.NODE_ENV === 'development' ? error.message : undefined 
        });
      }
    } else {
      // For other entity types, return the result
      res.json({
        message: 'Image uploaded successfully',
        result
      });
    }

  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Delete image from database
router.delete('/:entityType/:entityId', authenticateToken, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { imageId } = req.query; // For product/variant media, imageId specifies which item to delete

    // Validate entity type
    const validEntityTypes = ['product', 'invoice', 'return', 'order', 'purchase-item', 'product-variant'];
    if (!validEntityTypes.includes(entityType)) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    // Product media delete (ProductImage by imageId)
    if (entityType === 'product' && imageId) {
      const prisma = require('../lib/db');
      const productImage = await prisma.productImage.findUnique({
        where: { id: imageId },
        include: { product: { include: { tenant: true } } }
      });
      if (!productImage || productImage.productId !== entityId) {
        return res.status(404).json({ error: 'Product media not found' });
      }
      if (req.user.role !== 'ADMIN' && req.user.tenant?.id !== productImage.product.tenantId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      await prisma.productImage.delete({ where: { id: imageId } });
      try {
        await prisma.productLog.create({
          data: {
            action: 'IMAGE_DELETED',
            reason: 'Product media deleted',
            reference: `Product: ${productImage.product.name}`,
            tenantId: productImage.product.tenantId,
            productId: productImage.productId
          }
        });
      } catch (logError) {
        console.error('Error creating product log for media deletion:', logError);
      }
      return res.json({ message: 'Product media deleted successfully' });
    }

    // Special handling for product-variant images
    if (entityType === 'product-variant') {
      if (!imageId) {
        return res.status(400).json({ error: 'imageId is required for variant images' });
      }
      
      const prisma = require('../lib/db');
      
      // Get the variant image to verify it exists and get variant info
      const variantImage = await prisma.productVariantImage.findUnique({
        where: { id: imageId },
        include: {
          productVariant: {
            include: {
              product: {
                include: { tenant: true }
              }
            }
          }
        }
      });

      if (!variantImage) {
        return res.status(404).json({ error: 'Variant image not found' });
      }

      // Check if user has access to this tenant
      if (req.user.role !== 'ADMIN' && req.user.tenant?.id !== variantImage.productVariant.product.tenantId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Verify the image belongs to the specified variant
      if (variantImage.productVariantId !== entityId) {
        return res.status(400).json({ error: 'Image does not belong to this variant' });
      }

      // Delete the variant image
      await prisma.productVariantImage.delete({
        where: { id: imageId }
      });

      // Create product log entry
      try {
        await prisma.productLog.create({
          data: {
            action: 'VARIANT_IMAGE_DELETED',
            reason: 'Variant image deleted',
            reference: `Product: ${variantImage.productVariant.product.name}`,
            notes: `Variant image deleted: ${variantImage.productVariant.color}${variantImage.productVariant.size ? `, ${variantImage.productVariant.size}` : ''}`,
            tenantId: variantImage.productVariant.product.tenantId,
            productId: variantImage.productVariant.productId,
            productVariantId: variantImage.productVariantId
          }
        });
      } catch (logError) {
        console.error('Error creating product log for variant image deletion:', logError);
      }

      return res.json({
        message: 'Variant image deleted successfully'
      });
    }

    // Delete image for other entity types
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
    const validEntityTypes = ['product', 'invoice', 'return', 'order', 'purchase-item', 'product-variant'];
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
