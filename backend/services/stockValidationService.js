const prisma = require('../lib/db');

class StockValidationService {
  /**
   * Parse JSON data safely
   * @param {any} data - Data to parse
   * @returns {Object|Array} Parsed data
   */
  parseJSON(data) {
    if (!data) return null;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (e) {
        return null;
      }
    }
    return data;
  }

  /**
   * Validate stock availability for order products
   * @param {string} tenantId - Tenant ID
   * @param {Array|string} selectedProducts - Selected products
   * @param {Object|string} productQuantities - Product quantities
   * @param {string} excludeOrderId - Order ID to exclude from stock calculation (for updates)
   * @returns {Object} Validation result with isValid flag and errors array
   */
  async validateStockAvailability(tenantId, selectedProducts, productQuantities, excludeOrderId = null) {
    const result = {
      isValid: true,
      errors: []
    };

    try {
      // Parse data
      let products = this.parseJSON(selectedProducts);
      let quantities = this.parseJSON(productQuantities);

      if (!products || !quantities) {
        return result; // No products to validate
      }

      // Ensure products is an array
      if (!Array.isArray(products)) {
        if (typeof products === 'object' && products !== null) {
          products = Object.values(products);
        } else {
          return result;
        }
      }

      // Ensure quantities is an object
      if (!quantities || typeof quantities !== 'object') {
        quantities = {};
      }

      // Get all confirmed/dispatched/completed orders (these have already allocated stock)
      const confirmedOrders = await prisma.order.findMany({
        where: {
          tenantId: tenantId,
          status: { in: ['CONFIRMED', 'DISPATCHED', 'COMPLETED'] },
          ...(excludeOrderId && { id: { not: excludeOrderId } })
        },
        select: {
          id: true,
          selectedProducts: true,
          productQuantities: true,
          orderItems: {
            select: {
              productId: true,
              productVariantId: true,
              quantity: true
            }
          }
        }
      });

      // Calculate allocated stock per product and per variant
      const allocatedStock = {}; // productId -> quantity
      const allocatedVariantStock = {}; // variantId -> quantity
      
      for (const order of confirmedOrders) {
        // First, try to use normalized orderItems (if available)
        if (order.orderItems && order.orderItems.length > 0) {
          for (const orderItem of order.orderItems) {
            if (orderItem.productVariantId) {
              // Variant-level allocation
              allocatedVariantStock[orderItem.productVariantId] = 
                (allocatedVariantStock[orderItem.productVariantId] || 0) + orderItem.quantity;
            } else if (orderItem.productId) {
              // Product-level allocation
              allocatedStock[orderItem.productId] = 
                (allocatedStock[orderItem.productId] || 0) + orderItem.quantity;
            }
          }
        } else {
          // Fallback to legacy selectedProducts JSON
          const orderProducts = this.parseJSON(order.selectedProducts) || [];
          const orderQuantities = this.parseJSON(order.productQuantities) || {};

          for (const product of orderProducts) {
            const productId = product.id || product;
            const variantId = product.variantId || product.productVariantId;
            const quantity = orderQuantities[productId] || product.quantity || 1;
            
            if (variantId) {
              // Variant-level allocation
              allocatedVariantStock[variantId] = (allocatedVariantStock[variantId] || 0) + quantity;
            } else {
              // Product-level allocation
              allocatedStock[productId] = (allocatedStock[productId] || 0) + quantity;
            }
          }
        }
      }

      // If updating an order, get its current quantities to subtract
      if (excludeOrderId) {
        const currentOrder = await prisma.order.findUnique({
          where: { id: excludeOrderId },
          select: {
            selectedProducts: true,
            productQuantities: true,
            status: true,
            orderItems: {
              select: {
                productId: true,
                productVariantId: true,
                quantity: true
              }
            }
          }
        });

        if (currentOrder && ['CONFIRMED', 'DISPATCHED', 'COMPLETED'].includes(currentOrder.status)) {
          // Use normalized orderItems if available
          if (currentOrder.orderItems && currentOrder.orderItems.length > 0) {
            for (const orderItem of currentOrder.orderItems) {
              if (orderItem.productVariantId) {
                allocatedVariantStock[orderItem.productVariantId] = 
                  (allocatedVariantStock[orderItem.productVariantId] || 0) - orderItem.quantity;
              } else if (orderItem.productId) {
                allocatedStock[orderItem.productId] = 
                  (allocatedStock[orderItem.productId] || 0) - orderItem.quantity;
              }
            }
          } else {
            // Fallback to legacy format
            const currentProducts = this.parseJSON(currentOrder.selectedProducts) || [];
            const currentQuantities = this.parseJSON(currentOrder.productQuantities) || {};
            
            for (const product of currentProducts) {
              const productId = product.id || product;
              const variantId = product.variantId || product.productVariantId;
              const quantity = currentQuantities[productId] || product.quantity || 1;
              
              if (variantId) {
                allocatedVariantStock[variantId] = (allocatedVariantStock[variantId] || 0) - quantity;
              } else {
                allocatedStock[productId] = (allocatedStock[productId] || 0) - quantity;
              }
            }
          }
        }
      }

      // Validate each product
      for (const product of products) {
        const productId = product.id || product;
        const productName = product.name || 'Unknown Product';
        const variantId = product.variantId || product.productVariantId;
        const requestedQuantity = quantities[productId] || product.quantity || 1;

        // If variant ID is provided, validate variant stock
        if (variantId) {
          const variant = await prisma.productVariant.findFirst({
            where: {
              id: variantId,
              isActive: true,
              product: {
                tenantId: tenantId,
                isActive: true
              }
            },
            include: {
              product: true
            }
          });

          if (!variant) {
            result.errors.push({
              productId: productId,
              productVariantId: variantId,
              productName: productName,
              message: `Variant not found for product "${productName}"`
            });
            result.isValid = false;
            continue;
          }

          // Calculate available variant stock
          const currentStock = variant.currentQuantity || 0;
          const allocated = allocatedVariantStock[variantId] || 0;
          const availableStock = currentStock - allocated;

          // Check if requested quantity exceeds available variant stock
          if (requestedQuantity > availableStock) {
            result.errors.push({
              productId: productId,
              productVariantId: variantId,
              productName: variant.product.name,
              variantInfo: `${variant.color}${variant.size ? `, ${variant.size}` : ''}`,
              requestedQuantity: requestedQuantity,
              availableStock: availableStock,
              currentStock: currentStock,
              allocatedStock: allocated,
              message: `Insufficient stock for "${variant.product.name}" (${variant.color}${variant.size ? `, ${variant.size}` : ''}). Requested: ${requestedQuantity}, Available: ${availableStock}`
            });
            result.isValid = false;
          }
          continue; // Skip to next product
        }

        // Fallback to product-level validation (backward compatible)
        // Find the product
        let foundProduct = null;
        if (productId && typeof productId === 'string' && productId.length > 0) {
          foundProduct = await prisma.product.findFirst({
            where: {
              id: productId,
              tenantId: tenantId,
              isActive: true
            }
          });
        }

        // If not found by ID, try by name
        if (!foundProduct && productName) {
          foundProduct = await prisma.product.findFirst({
            where: {
              tenantId: tenantId,
              name: {
                equals: productName,
                mode: 'insensitive'
              },
              isActive: true
            }
          });
        }

        if (!foundProduct) {
          result.errors.push({
            productId: productId,
            productName: productName,
            message: `Product "${productName}" not found in inventory`
          });
          result.isValid = false;
          continue;
        }

        // Calculate available stock
        const currentStock = foundProduct.currentQuantity || 0;
        const allocated = allocatedStock[productId] || 0;
        const availableStock = currentStock - allocated;

        // Check if requested quantity exceeds available stock
        if (requestedQuantity > availableStock) {
          result.errors.push({
            productId: productId,
            productName: foundProduct.name,
            requestedQuantity: requestedQuantity,
            availableStock: availableStock,
            currentStock: currentStock,
            allocatedStock: allocated,
            message: `Insufficient stock for "${foundProduct.name}". Requested: ${requestedQuantity}, Available: ${availableStock}`
          });
          result.isValid = false;
        }
      }

      return result;

    } catch (error) {
      console.error('Error validating stock:', error);
      result.isValid = false;
      result.errors.push({
        message: 'Error validating stock availability',
        error: error.message
      });
      return result;
    }
  }
}

module.exports = new StockValidationService();

