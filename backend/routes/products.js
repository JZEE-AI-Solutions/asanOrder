const express = require('express');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get recent products for a tenant (for form creation)
router.get('/recent/:tenantId', authenticateToken, requireRole(['ADMIN', 'BUSINESS_OWNER']), async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { limit = 20 } = req.query;

    // Verify tenant access
    if (req.user.role === 'BUSINESS_OWNER') {
      const tenant = await prisma.tenant.findFirst({
        where: {
          id: tenantId,
          ownerId: req.user.id
        }
      });
      
      if (!tenant) {
        return res.status(403).json({ error: 'Access denied to this tenant' });
      }
    }

    // Get recent products from purchase invoices
    const recentProducts = await prisma.product.findMany({
      where: {
        purchaseItems: {
          some: {
            purchaseInvoice: {
              tenantId: tenantId
            }
          }
        }
      },
      include: {
        purchaseItems: {
          where: {
            purchaseInvoice: {
              tenantId: tenantId
            }
          },
          include: {
            purchaseInvoice: {
              select: {
                invoiceDate: true,
                invoiceNumber: true
              }
            }
          },
          orderBy: {
            purchaseInvoice: {
              invoiceDate: 'desc'
            }
          },
          take: 1
        },
        productLogs: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 10
        }
      },
      orderBy: {
        purchaseItems: {
          purchaseInvoice: {
            invoiceDate: 'desc'
          }
        }
      },
      take: parseInt(limit)
    });

    // Format the response
    const formattedProducts = recentProducts.map(product => {
      const latestPurchase = product.purchaseItems[0];
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        sku: product.sku,
        image: product.image,
        hasImage: !!product.imageData, // Just indicate if image exists, don't send the data
        isActive: product.isActive,
        currentQuantity: product.currentQuantity,
        currentRetailPrice: product.currentRetailPrice,
        lastPurchased: latestPurchase?.purchaseInvoice?.invoiceDate,
        lastInvoiceNumber: latestPurchase?.purchaseInvoice?.invoiceNumber,
        totalPurchased: product.purchaseItems.reduce((sum, item) => sum + item.quantity, 0),
        productLogs: product.productLogs
      };
    });

    res.json({
      success: true,
      products: formattedProducts
    });

  } catch (error) {
    console.error('Error fetching recent products:', error);
    res.status(500).json({ error: 'Failed to fetch recent products' });
  }
});

// Get all products for a tenant (with pagination)
router.get('/tenant/:tenantId', authenticateToken, requireRole(['ADMIN', 'BUSINESS_OWNER']), async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { page = 1, limit = 50, search = '' } = req.query;

    // Verify tenant access
    if (req.user.role === 'BUSINESS_OWNER') {
      const tenant = await prisma.tenant.findFirst({
        where: {
          id: tenantId,
          ownerId: req.user.id
        }
      });
      
      if (!tenant) {
        return res.status(403).json({ error: 'Access denied to this tenant' });
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build search conditions
    const searchConditions = search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } }
      ]
    } : {};

    // Get products with pagination
    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where: {
          ...searchConditions,
          purchaseItems: {
            some: {
              purchaseInvoice: {
                tenantId: tenantId
              }
            }
          }
        },
        include: {
          purchaseItems: {
            where: {
              purchaseInvoice: {
                tenantId: tenantId
              }
            },
            include: {
              purchaseInvoice: {
                select: {
                  invoiceDate: true,
                  invoiceNumber: true
                }
              }
            },
            orderBy: {
              purchaseInvoice: {
                invoiceDate: 'desc'
              }
            },
            take: 1
          },
          productLogs: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 10
          }
        },
        orderBy: {
          name: 'asc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.product.count({
        where: {
          ...searchConditions,
          purchaseItems: {
            some: {
              purchaseInvoice: {
                tenantId: tenantId
              }
            }
          }
        }
      })
    ]);

    // Format the response
    const formattedProducts = products.map(product => {
      const latestPurchase = product.purchaseItems[0];
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        sku: product.sku,
        image: product.image,
        hasImage: !!product.imageData, // Just indicate if image exists, don't send the data
        isActive: product.isActive,
        currentQuantity: product.currentQuantity,
        currentRetailPrice: product.currentRetailPrice,
        lastPurchased: latestPurchase?.purchaseInvoice?.invoiceDate,
        lastInvoiceNumber: latestPurchase?.purchaseInvoice?.invoiceNumber,
        totalPurchased: product.purchaseItems.reduce((sum, item) => sum + item.quantity, 0),
        productLogs: product.productLogs
      };
    });

    res.json({
      success: true,
      products: formattedProducts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Public endpoint to get products by IDs (for public forms)
router.post('/by-ids', async (req, res) => {
  try {
    const { productIds, tenantId } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'Product IDs array is required' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        purchaseItems: {
          some: {
            purchaseInvoice: {
              tenantId: tenantId
            }
          }
        }
      },
      include: {
        purchaseItems: {
          where: {
            purchaseInvoice: {
              tenantId: tenantId
            }
          },
          include: {
            purchaseInvoice: {
              select: {
                invoiceDate: true,
                invoiceNumber: true
              }
            }
          },
          orderBy: {
            purchaseInvoice: {
              invoiceDate: 'desc'
            }
          },
          take: 1
        },
        productLogs: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 10
        }
      }
    });

    // Format the response
    const formattedProducts = products.map(product => {
      const latestPurchase = product.purchaseItems[0];
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        sku: product.sku,
        image: product.image,
        hasImage: !!product.imageData, // Just indicate if image exists, don't send the data
        isActive: product.isActive,
        currentQuantity: product.currentQuantity,
        currentRetailPrice: product.currentRetailPrice,
        lastPurchased: latestPurchase?.purchaseInvoice?.invoiceDate,
        lastInvoiceNumber: latestPurchase?.purchaseInvoice?.invoiceNumber,
        totalPurchased: product.purchaseItems.reduce((sum, item) => sum + item.quantity, 0),
        productLogs: product.productLogs
      };
    });

    res.json({ 
      success: true, 
      products: formattedProducts 
    });

  } catch (error) {
    console.error('Error fetching products by IDs:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

module.exports = router;