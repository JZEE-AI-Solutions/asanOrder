const express = require('express');
const prisma = require('../lib/db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Search products by name (Business Owner only)
router.get('/search/:query', authenticateToken, requireRole(['BUSINESS_OWNER']), async (req, res) => {
  try {
    const { query } = req.params;

    // Get tenant for the business owner
    const tenant = await prisma.tenant.findUnique({
      where: { ownerId: req.user.id }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Try to fetch with variant fields, fallback if migration not run
    let products;
    let hasVariantSupport = false;
    
    try {
      products = await prisma.product.findMany({
        where: {
          tenantId: tenant.id,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { sku: { contains: query, mode: 'insensitive' } },
            { category: { contains: query, mode: 'insensitive' } }
          ]
        },
        orderBy: { name: 'asc' },
        take: 10,
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          sku: true,
          currentQuantity: true,
          lastPurchasePrice: true,
          currentRetailPrice: true,
          isStitched: true,
          hasVariants: true,
          variants: {
            select: {
              id: true,
              color: true,
              size: true,
              sku: true,
              currentQuantity: true,
              isActive: true
            }
          }
        }
      });
      hasVariantSupport = true;
    } catch (error) {
      // If variant columns/table don't exist, use fallback query
      const isColumnError = error.code === 'P2021' || 
                           error.code === 'P2022' || 
                           error.code === 'P2010' ||
                           error.message?.includes('column') || 
                           error.message?.includes('does not exist') ||
                           error.message?.includes('Unknown column') ||
                           error.meta?.target?.includes('isStitched') ||
                           error.meta?.target?.includes('hasVariants') ||
                           error.meta?.target?.includes('variants');
      
      if (isColumnError) {
        console.log('Variant columns not found, using fallback query for search. Error:', error.code, error.message);
        products = await prisma.product.findMany({
          where: {
            tenantId: tenant.id,
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { sku: { contains: query, mode: 'insensitive' } },
              { category: { contains: query, mode: 'insensitive' } }
            ]
          },
          orderBy: { name: 'asc' },
          take: 10,
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            sku: true,
            currentQuantity: true,
            lastPurchasePrice: true,
            currentRetailPrice: true
          }
        });
        hasVariantSupport = false;
      } else {
        // Re-throw if it's a different error
        throw error;
      }
    }

    // Add variant summary to each product
    const productsWithVariants = products.map(product => {
      let totalVariantStock = 0;
      let variantCount = 0;
      let isStitched = false;
      let hasVariants = false;
      
      if (hasVariantSupport) {
        if (product.hasVariants && product.variants) {
          totalVariantStock = product.variants.reduce((sum, v) => sum + v.currentQuantity, 0);
          variantCount = product.variants.length;
        }
        isStitched = product.isStitched || false;
        hasVariants = product.hasVariants || false;
      }
      
      return {
        ...product,
        isStitched: isStitched,
        hasVariants: hasVariants,
        variantCount: variantCount,
        totalVariantStock: hasVariants ? totalVariantStock : null
      };
    });

    res.json({
      success: true,
      products: productsWithVariants
    });
  } catch (error) {
    console.error('Error searching products:', {
      name: error.name,
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    res.status(500).json({
      success: false,
      error: 'Failed to search products',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get recent products for a tenant (for form creation)
router.get('/recent/:tenantId', authenticateToken, requireRole(['ADMIN', 'BUSINESS_OWNER']), async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { limit = 20 } = req.query;

    // Verify tenant access
    if (req.user.role === 'BUSINESS_OWNER') {
      if (!req.user.tenant?.id || req.user.tenant.id !== tenantId) {
        return res.status(403).json({ error: 'Access denied to this tenant' });
      }
    }

    // Optimize: Use direct tenantId filter instead of nested query
    // This is much faster than nested purchaseItems.some.purchaseInvoice.tenantId
    const recentProducts = await prisma.product.findMany({
      where: {
        tenantId: tenantId // Direct filter - uses index
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        sku: true,
        image: true,
        isActive: true,
        currentQuantity: true,
        currentRetailPrice: true,
        lastPurchasePrice: true,
        lastSalePrice: true,
        createdAt: true,
        // Get only the latest purchase item info
        purchaseItems: {
          select: {
            id: true,
            purchasePrice: true,
            quantity: true,
            purchaseInvoice: {
              select: {
                invoiceDate: true,
                invoiceNumber: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        },
        // Remove productLogs - not needed for recent products list
        _count: {
          select: {
            productLogs: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: Math.min(parseInt(limit) || 20, 50) // Limit to max 50
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
        hasImage: !!product.image,
        isActive: product.isActive,
        currentQuantity: product.currentQuantity,
        currentRetailPrice: product.currentRetailPrice,
        lastPurchased: latestPurchase?.purchaseInvoice?.invoiceDate,
        lastInvoiceNumber: latestPurchase?.purchaseInvoice?.invoiceNumber,
        totalPurchased: product.purchaseItems.reduce((sum, item) => sum + (item.quantity || 0), 0)
        // productLogs removed - fetch separately if needed
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
      if (!req.user.tenant?.id || req.user.tenant.id !== tenantId) {
        return res.status(403).json({ error: 'Access denied to this tenant' });
      }
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 50));
    const skipNum = (pageNum - 1) * limitNum;

    // Build search conditions
    const searchConditions = search ? {
      AND: [
        { tenantId: tenantId }, // Direct filter first
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } }
          ]
        }
      ]
    } : { tenantId: tenantId }; // Direct filter - uses index

    // Optimize: Use direct tenantId instead of nested purchaseItems filter
    // This is 10-50x faster because it uses the index directly
    // Try to fetch with variant fields, fallback if migration not run
    let products, totalCount;
    let hasVariantSupport = false;
    
    try {
      // Try query with variant fields first
      [products, totalCount] = await Promise.all([
        prisma.product.findMany({
          where: searchConditions,
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            sku: true,
            image: true,
            isActive: true,
            isStitched: true,
            hasVariants: true,
            currentQuantity: true,
            currentRetailPrice: true,
            lastPurchasePrice: true,
            lastSalePrice: true,
            variants: {
              select: {
                id: true,
                color: true,
                size: true,
                sku: true,
                currentQuantity: true,
                isActive: true
              }
            },
            createdAt: true,
            // Only get latest purchase item, not all
            purchaseItems: {
              select: {
                id: true,
                purchasePrice: true,
                quantity: true,
                purchaseInvoice: {
                  select: {
                    invoiceDate: true,
                    invoiceNumber: true
                  }
                }
              },
              orderBy: {
                createdAt: 'desc'
              },
              take: 1
            },
            // Remove productLogs from list - fetch only when viewing single product
            _count: {
              select: {
                productLogs: true
              }
            }
          },
          orderBy: {
            name: 'asc'
          },
          skip: skipNum,
          take: limitNum
        }),
        prisma.product.count({
          where: searchConditions
        })
      ]);
      hasVariantSupport = true;
    } catch (error) {
      // If variant columns/table don't exist, use fallback query
      // Check for various Prisma error codes and messages
      const isColumnError = error.code === 'P2021' || 
                           error.code === 'P2022' || 
                           error.code === 'P2010' ||
                           error.message?.includes('column') || 
                           error.message?.includes('does not exist') ||
                           error.message?.includes('Unknown column') ||
                           error.meta?.target?.includes('isStitched') ||
                           error.meta?.target?.includes('hasVariants') ||
                           error.meta?.target?.includes('variants');
      
      if (isColumnError) {
        console.log('Variant columns not found, using fallback query. Error:', error.code, error.message);
        [products, totalCount] = await Promise.all([
          prisma.product.findMany({
            where: searchConditions,
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              sku: true,
              image: true,
              isActive: true,
              currentQuantity: true,
              currentRetailPrice: true,
              lastPurchasePrice: true,
              lastSalePrice: true,
              createdAt: true,
              // Only get latest purchase item, not all
              purchaseItems: {
                select: {
                  id: true,
                  purchasePrice: true,
                  quantity: true,
                  purchaseInvoice: {
                    select: {
                      invoiceDate: true,
                      invoiceNumber: true
                    }
                  }
                },
                orderBy: {
                  createdAt: 'desc'
                },
                take: 1
              },
              // Remove productLogs from list - fetch only when viewing single product
              _count: {
                select: {
                  productLogs: true
                }
              }
            },
            orderBy: {
              name: 'asc'
            },
            skip: skipNum,
            take: limitNum
          }),
          prisma.product.count({
            where: searchConditions
          })
        ]);
        hasVariantSupport = false;
      } else {
        // Re-throw if it's a different error
        throw error;
      }
    }

    // Format the response
    const formattedProducts = products.map(product => {
      const latestPurchase = product.purchaseItems[0];
      let totalVariantStock = 0;
      let variantCount = 0;
      let isStitched = false;
      let hasVariants = false;
      
      if (hasVariantSupport) {
        if (product.hasVariants && product.variants) {
          totalVariantStock = product.variants.reduce((sum, v) => sum + v.currentQuantity, 0);
          variantCount = product.variants.length;
        }
        isStitched = product.isStitched || false;
        hasVariants = product.hasVariants || false;
      }
      
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        sku: product.sku,
        image: product.image,
        hasImage: !!product.image,
        isActive: product.isActive,
        isStitched: isStitched,
        hasVariants: hasVariants,
        variantCount: variantCount,
        totalVariantStock: hasVariants ? totalVariantStock : null,
        currentQuantity: product.currentQuantity,
        currentRetailPrice: product.currentRetailPrice,
        lastPurchased: latestPurchase?.purchaseInvoice?.invoiceDate,
        lastInvoiceNumber: latestPurchase?.purchaseInvoice?.invoiceNumber,
        totalPurchased: product.purchaseItems.reduce((sum, item) => sum + (item.quantity || 0), 0)
        // productLogs removed - fetch separately if needed
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
    console.error('Error fetching products:', {
      name: error.name,
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    // If it's a column error that wasn't caught, try one more fallback
    const isColumnError = error.code === 'P2021' || 
                         error.code === 'P2022' || 
                         error.code === 'P2010' ||
                         error.message?.includes('column') || 
                         error.message?.includes('does not exist') ||
                         error.message?.includes('Unknown column');
    
    if (isColumnError) {
      console.log('Column error in outer catch, attempting final fallback');
      try {
        const [fallbackProducts, fallbackCount] = await Promise.all([
          prisma.product.findMany({
            where: searchConditions,
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              sku: true,
              image: true,
              isActive: true,
              currentQuantity: true,
              currentRetailPrice: true,
              lastPurchasePrice: true,
              lastSalePrice: true,
              createdAt: true
            },
            orderBy: { name: 'asc' },
            skip: skipNum,
            take: limitNum
          }),
          prisma.product.count({ where: searchConditions })
        ]);
        
        const formattedProducts = fallbackProducts.map(product => ({
          id: product.id,
          name: product.name,
          description: product.description,
          category: product.category,
          sku: product.sku,
          image: product.image,
          hasImage: !!product.image,
          isActive: product.isActive,
          isStitched: false,
          hasVariants: false,
          variantCount: 0,
          totalVariantStock: null,
          currentQuantity: product.currentQuantity,
          currentRetailPrice: product.currentRetailPrice,
          lastPurchased: null,
          lastInvoiceNumber: null,
          totalPurchased: 0
        }));
        
        return res.json({
          success: true,
          products: formattedProducts,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: fallbackCount,
            pages: Math.ceil(fallbackCount / parseInt(limit))
          }
        });
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch products',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Public endpoint to get products by IDs (for public forms)
router.post('/by-ids', async (req, res) => {
  try {
    const { productIds, tenantId } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    // If no productIds provided, get all products for the tenant (for shopping cart)
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      // Optimize: Use direct tenantId filter instead of nested query
      // Try to fetch with variant fields, fallback if migration not run
      let allProducts;
      let hasVariantSupport = false;
      
      try {
        allProducts = await prisma.product.findMany({
          where: {
            tenantId: tenantId, // Direct filter - uses index
            isActive: true // Only active products for shopping cart
          },
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            sku: true,
            image: true,
            isActive: true,
            isStitched: true,
            hasVariants: true,
            currentQuantity: true,
            currentRetailPrice: true,
            lastPurchasePrice: true,
            lastSalePrice: true,
            productImages: {
              orderBy: [
                { isPrimary: 'desc' },
                { sortOrder: 'asc' },
                { createdAt: 'asc' }
              ],
              select: { id: true, mediaType: true, isPrimary: true, sortOrder: true }
            },
            variants: {
              where: { isActive: true },
              select: {
                id: true,
                color: true,
                size: true,
                sku: true,
                currentQuantity: true,
                isActive: true,
                images: {
                  orderBy: [
                    { isPrimary: 'desc' },
                    { sortOrder: 'asc' }
                  ],
                  select: { id: true, imageType: true, isPrimary: true, sortOrder: true }
                }
              },
              orderBy: [
                { color: 'asc' },
                { size: 'asc' }
              ]
            },
            // Only get latest purchase item
            purchaseItems: {
              select: {
                id: true,
                purchasePrice: true,
                quantity: true,
                purchaseInvoice: {
                  select: {
                    invoiceDate: true,
                    invoiceNumber: true
                  }
                }
              },
              orderBy: {
                createdAt: 'desc'
              },
              take: 1
            }
          },
          orderBy: {
            name: 'asc'
          },
          take: 500 // Limit to prevent huge responses
        });
        hasVariantSupport = true;
      } catch (error) {
        // If variant columns/table don't exist, use fallback query
        const isColumnError = error.code === 'P2021' || 
                             error.code === 'P2022' || 
                             error.code === 'P2010' ||
                             error.message?.includes('column') || 
                             error.message?.includes('does not exist') ||
                             error.message?.includes('Unknown column') ||
                             error.meta?.target?.includes('isStitched') ||
                             error.meta?.target?.includes('hasVariants') ||
                             error.meta?.target?.includes('variants') ||
                             error.meta?.target?.includes('product_images');
        
        if (isColumnError) {
          console.log('Variant/productImages columns not found, using fallback query for by-ids (all products). Error:', error.code, error.message);
          allProducts = await prisma.product.findMany({
            where: {
              tenantId: tenantId,
              isActive: true
            },
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              sku: true,
              image: true,
              isActive: true,
              currentQuantity: true,
              currentRetailPrice: true,
              lastPurchasePrice: true,
              lastSalePrice: true,
              purchaseItems: {
                select: {
                  id: true,
                  purchasePrice: true,
                  quantity: true,
                  purchaseInvoice: {
                    select: {
                      invoiceDate: true,
                      invoiceNumber: true
                    }
                  }
                },
                orderBy: {
                  createdAt: 'desc'
                },
                take: 1
              }
            },
            orderBy: {
              name: 'asc'
            },
            take: 500
          });
          hasVariantSupport = false;
        } else {
          throw error;
        }
      }

      // Format the response for shopping cart
      const formattedProducts = allProducts.map(product => {
        const latestPurchase = product.purchaseItems[0];
        let totalVariantStock = 0;
        let variantCount = 0;
        let isStitched = false;
        let hasVariants = false;
        let variants = [];
        
        if (hasVariantSupport) {
          if (product.hasVariants && product.variants) {
            totalVariantStock = product.variants.reduce((sum, v) => sum + v.currentQuantity, 0);
            variantCount = product.variants.length;
            variants = product.variants;
          }
          isStitched = product.isStitched || false;
          hasVariants = product.hasVariants || false;
        }
        
        return {
          id: product.id,
          name: product.name,
          description: product.description,
          category: product.category,
          sku: product.sku,
          image: product.image,
          hasImage: !!product.image,
          productImages: product.productImages ?? [],
          isActive: product.isActive,
          isStitched: isStitched,
          hasVariants: hasVariants,
          currentQuantity: product.currentQuantity,
          currentRetailPrice: product.currentRetailPrice,
          lastPurchased: latestPurchase?.purchaseInvoice?.invoiceDate,
          lastInvoiceNumber: latestPurchase?.purchaseInvoice?.invoiceNumber,
          totalPurchased: product.purchaseItems.reduce((sum, item) => sum + (item.quantity || 0), 0),
          variants: variants,
          variantCount: variantCount,
          totalVariantStock: hasVariants ? totalVariantStock : null
        };
      });

      return res.json({ 
        success: true, 
        products: formattedProducts 
      });
    }

    // Optimize: Use direct tenantId filter
    // Try to fetch with variant fields, fallback if migration not run
    let products;
    let hasVariantSupport = false;
    
    try {
      products = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          tenantId: tenantId // Direct filter - much faster
        },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          sku: true,
          image: true,
          isActive: true,
          isStitched: true,
          hasVariants: true,
          currentQuantity: true,
          currentRetailPrice: true,
          lastPurchasePrice: true,
          lastSalePrice: true,
          productImages: {
            orderBy: [
              { isPrimary: 'desc' },
              { sortOrder: 'asc' },
              { createdAt: 'asc' }
            ],
            select: { id: true, mediaType: true, isPrimary: true, sortOrder: true }
          },
          variants: {
            where: { isActive: true },
            select: {
              id: true,
              color: true,
              size: true,
              sku: true,
              currentQuantity: true,
              isActive: true,
              images: {
                orderBy: [
                  { isPrimary: 'desc' },
                  { sortOrder: 'asc' }
                ],
                select: { id: true, imageType: true, isPrimary: true, sortOrder: true }
              }
            },
            orderBy: [
              { color: 'asc' },
              { size: 'asc' }
            ]
          },
          purchaseItems: {
            select: {
              id: true,
              purchasePrice: true,
              quantity: true,
              purchaseInvoice: {
                select: {
                  invoiceDate: true,
                  invoiceNumber: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 1
          }
          // Remove productLogs - not needed for product list
        }
      });
      hasVariantSupport = true;
    } catch (error) {
      // If variant columns/table don't exist, use fallback query
        const isColumnError = error.code === 'P2021' || 
                             error.code === 'P2022' || 
                             error.code === 'P2010' ||
                             error.message?.includes('column') || 
                             error.message?.includes('does not exist') ||
                             error.message?.includes('Unknown column') ||
                             error.meta?.target?.includes('isStitched') ||
                             error.meta?.target?.includes('hasVariants') ||
                             error.meta?.target?.includes('variants') ||
                             error.meta?.target?.includes('product_images');
      
      if (isColumnError) {
        console.log('Variant/productImages columns not found, using fallback query for by-ids (specific products). Error:', error.code, error.message);
        products = await prisma.product.findMany({
          where: {
            id: { in: productIds },
            tenantId: tenantId
          },
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            sku: true,
            image: true,
            isActive: true,
            currentQuantity: true,
            currentRetailPrice: true,
            lastPurchasePrice: true,
            lastSalePrice: true,
            purchaseItems: {
              select: {
                id: true,
                purchasePrice: true,
                quantity: true,
                purchaseInvoice: {
                  select: {
                    invoiceDate: true,
                    invoiceNumber: true
                  }
                }
              },
              orderBy: {
                createdAt: 'desc'
              },
              take: 1
            }
          }
        });
        hasVariantSupport = false;
      } else {
        throw error;
      }
    }

    // Format the response
    const formattedProducts = products.map(product => {
      const latestPurchase = product.purchaseItems[0];
      let totalVariantStock = 0;
      let variantCount = 0;
      let isStitched = false;
      let hasVariants = false;
      let variants = [];
      
      if (hasVariantSupport) {
        if (product.hasVariants && product.variants) {
          totalVariantStock = product.variants.reduce((sum, v) => sum + v.currentQuantity, 0);
          variantCount = product.variants.length;
          variants = product.variants;
        }
        isStitched = product.isStitched || false;
        hasVariants = product.hasVariants || false;
      }
      
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        sku: product.sku,
        image: product.image,
        hasImage: !!product.image,
        productImages: product.productImages ?? [],
        isActive: product.isActive,
        isStitched: isStitched,
        hasVariants: hasVariants,
        currentQuantity: product.currentQuantity,
        currentRetailPrice: product.currentRetailPrice,
        lastPurchased: latestPurchase?.purchaseInvoice?.invoiceDate,
        lastInvoiceNumber: latestPurchase?.purchaseInvoice?.invoiceNumber,
        totalPurchased: product.purchaseItems.reduce((sum, item) => sum + (item.quantity || 0), 0),
        variants: variants,
        variantCount: variantCount,
        totalVariantStock: hasVariants ? totalVariantStock : null
      };
    });

    res.json({ 
      success: true, 
      products: formattedProducts 
    });

  } catch (error) {
    console.error('Error fetching products by IDs:', {
      name: error.name,
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    res.status(500).json({ 
      error: 'Failed to fetch products',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;