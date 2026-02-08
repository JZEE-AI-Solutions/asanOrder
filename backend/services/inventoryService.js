const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class InventoryService {
  /**
   * Update inventory when a purchase invoice is added
   * @param {string} tenantId - Tenant ID
   * @param {Array} purchaseItems - Array of purchase items
   * @param {string} purchaseInvoiceId - Purchase invoice ID
   * @param {string} invoiceNumber - Invoice number for reference
   */
  static async updateInventoryFromPurchase(tenantId, purchaseItems, purchaseInvoiceId, invoiceNumber) {
    console.log(`🔄 Updating inventory for ${purchaseItems.length} items from invoice ${invoiceNumber}`);
    
    const results = {
      productsUpdated: 0,
      productsCreated: 0,
      logsCreated: 0,
      errors: []
    };

    try {
      for (const item of purchaseItems) {
        try {
          // Check if this purchase item has a variant
          if (item.productVariantId) {
            // Handle variant-level stock update
            const variant = await prisma.productVariant.findFirst({
              where: {
                id: item.productVariantId,
                product: {
                  tenantId: tenantId
                }
              },
              include: {
                product: true
              }
            });

            if (variant) {
              const oldQuantity = variant.currentQuantity;
              const newQuantity = oldQuantity + item.quantity;
              const oldPrice = variant.product.lastPurchasePrice;
              const newPrice = item.purchasePrice;

              // Update variant stock
              await prisma.productVariant.update({
                where: { id: variant.id },
                data: {
                  currentQuantity: newQuantity,
                  updatedAt: new Date()
                }
              });

              // Update product's last purchase price
              await prisma.product.update({
                where: { id: variant.productId },
                data: {
                  lastPurchasePrice: newPrice,
                  lastUpdated: new Date()
                }
              });

              // Find the purchase item to link
              const purchaseItem = await prisma.purchaseItem.findFirst({
                where: {
                  tenantId: tenantId,
                  purchaseInvoiceId: purchaseInvoiceId,
                  name: item.name,
                  purchasePrice: item.purchasePrice,
                  quantity: item.quantity
                }
              });

              // Link the purchase item to product and variant
              if (purchaseItem) {
                await prisma.purchaseItem.update({
                  where: { id: purchaseItem.id },
                  data: { 
                    productId: variant.productId,
                    productVariantId: variant.id
                  }
                });
              }

              // Create variant-level product log
              await prisma.productLog.create({
                data: {
                  action: 'INCREASE',
                  quantity: item.quantity,
                  oldQuantity: oldQuantity,
                  newQuantity: newQuantity,
                  oldPrice: oldPrice,
                  newPrice: newPrice,
                  reason: 'Purchase invoice received',
                  reference: `Invoice: ${invoiceNumber}`,
                  notes: `Variant (${variant.color}${variant.size ? `, ${variant.size}` : ''}) quantity increased by ${item.quantity} from purchase`,
                  tenantId: tenantId,
                  productId: variant.productId,
                  productVariantId: variant.id,
                  purchaseItemId: purchaseItem?.id
                }
              });

              results.productsUpdated++;
              results.logsCreated++;

              console.log(`   ✅ Updated variant: ${variant.product.name} - ${variant.color}${variant.size ? `, ${variant.size}` : ''} (${oldQuantity} → ${newQuantity})`);
              continue; // Skip to next item
            } else {
              console.log(`   ⚠️  Variant not found: ${item.productVariantId}, falling back to product-level update`);
            }
          }

          // Fallback to product-level update (backward compatible or variant not found)
          // Search for existing product by name (case-insensitive exact match)
          const existingProduct = await prisma.product.findFirst({
            where: {
              tenantId: tenantId,
              name: {
                equals: item.name,
                mode: 'insensitive'
              }
            }
          });

          if (existingProduct) {
            // Update existing product
            const oldQuantity = existingProduct.currentQuantity;
            const newQuantity = oldQuantity + item.quantity;
            const oldPrice = existingProduct.lastPurchasePrice;
            const newPrice = item.purchasePrice;

            await prisma.product.update({
              where: { id: existingProduct.id },
              data: {
                currentQuantity: newQuantity,
                lastPurchasePrice: newPrice,
                lastUpdated: new Date()
              }
            });

            // Find the purchase item to link to the product
            const purchaseItem = await prisma.purchaseItem.findFirst({
              where: {
                tenantId: tenantId,
                purchaseInvoiceId: purchaseInvoiceId,
                name: item.name,
                purchasePrice: item.purchasePrice,
                quantity: item.quantity
              }
            });

            // Link the purchase item to the product
            if (purchaseItem) {
              await prisma.purchaseItem.update({
                where: { id: purchaseItem.id },
                data: { productId: existingProduct.id }
              });
            }

            // Create product log for quantity increase
            await prisma.productLog.create({
              data: {
                action: 'INCREASE',
                quantity: item.quantity,
                oldQuantity: oldQuantity,
                newQuantity: newQuantity,
                oldPrice: oldPrice,
                newPrice: newPrice,
                reason: 'Purchase invoice received',
                reference: `Invoice: ${invoiceNumber}`,
                notes: `Quantity increased by ${item.quantity} from purchase`,
                tenantId: tenantId,
                productId: existingProduct.id,
                purchaseItemId: purchaseItem?.id
              }
            });

            results.productsUpdated++;
            results.logsCreated++;

            console.log(`   ✅ Updated product: ${item.name} (${oldQuantity} → ${newQuantity})`);

          } else {
            // Create new product
            const defaultRetail = item.purchasePrice * 1.5; // Default 50% markup
            const newProduct = await prisma.product.create({
              data: {
                name: item.name,
                description: item.description,
                category: item.category,
                sku: item.sku,
                currentQuantity: item.quantity,
                lastPurchasePrice: item.purchasePrice,
                currentRetailPrice: defaultRetail,
                lastSalePrice: defaultRetail,
                minStockLevel: 0,
                maxStockLevel: item.quantity * 2, // Default max is 2x current
                image: item.image,
                imageData: item.imageData,
                imageType: item.imageType,
                isActive: true,
                lastUpdated: new Date(),
                tenantId: tenantId
              }
            });

            // Find the purchase item to link to the product
            const purchaseItem = await prisma.purchaseItem.findFirst({
              where: {
                tenantId: tenantId,
                purchaseInvoiceId: purchaseInvoiceId,
                name: item.name,
                purchasePrice: item.purchasePrice,
                quantity: item.quantity
              }
            });

            // Link the purchase item to the product
            if (purchaseItem) {
              await prisma.purchaseItem.update({
                where: { id: purchaseItem.id },
                data: { productId: newProduct.id }
              });
            }

            // Create product log for new product
            await prisma.productLog.create({
              data: {
                action: 'CREATE',
                quantity: item.quantity,
                newQuantity: item.quantity,
                newPrice: item.purchasePrice,
                reason: 'New product from purchase invoice',
                reference: `Invoice: ${invoiceNumber}`,
                notes: `New product created with initial quantity of ${item.quantity}`,
                tenantId: tenantId,
                productId: newProduct.id,
                purchaseItemId: purchaseItem?.id
              }
            });

            results.productsCreated++;
            results.logsCreated++;

            console.log(`   🆕 Created new product: ${item.name} (Qty: ${item.quantity})`);
          }

        } catch (itemError) {
          console.error(`   ❌ Error processing item ${item.name}:`, itemError);
          results.errors.push({
            item: item.name,
            error: itemError.message
          });
        }
      }

      console.log(`✅ Inventory update completed: ${results.productsUpdated} updated, ${results.productsCreated} created, ${results.logsCreated} logs`);
      return results;

    } catch (error) {
      console.error('❌ Inventory update failed:', error);
      throw error;
    }
  }

  /**
   * Increase inventory when a customer order return is approved (customer returns product to business).
   * @param {string} tenantId - Tenant ID
   * @param {Array} returnItems - Array of return items (with productVariantId, productName, quantity)
   * @param {string} returnId - Return ID
   * @param {string} returnNumber - Return number for reference
   */
  static async increaseInventoryFromCustomerReturn(tenantId, returnItems, returnId, returnNumber) {
    const results = { productsUpdated: 0, logsCreated: 0, errors: [] };
    try {
      for (const item of returnItems) {
        try {
          const qty = item.quantity || 0;
          if (qty <= 0) continue;
          if (item.productVariantId) {
            const variant = await prisma.productVariant.findFirst({
              where: { id: item.productVariantId, product: { tenantId } },
              include: { product: true }
            });
            if (variant) {
              const oldQuantity = variant.currentQuantity;
              const newQuantity = oldQuantity + qty;
              await prisma.productVariant.update({
                where: { id: variant.id },
                data: { currentQuantity: newQuantity, updatedAt: new Date() }
              });
              await prisma.productLog.create({
                data: {
                  action: 'INCREASE',
                  quantity: qty,
                  oldQuantity: oldQuantity,
                  newQuantity: newQuantity,
                  reason: 'Customer return approved',
                  reference: `Return: ${returnNumber}`,
                  notes: `Variant (${variant.color}${variant.size ? `, ${variant.size}` : ''}) quantity increased by ${qty} due to customer return`,
                  tenantId,
                  productId: variant.productId,
                  productVariantId: variant.id
                }
              });
              results.productsUpdated++;
              results.logsCreated++;
              continue;
            }
          }
          const product = await prisma.product.findFirst({
            where: {
              tenantId,
              name: { equals: item.productName || '', mode: 'insensitive' }
            }
          });
          if (product) {
            const oldQuantity = product.currentQuantity;
            const newQuantity = oldQuantity + qty;
            await prisma.product.update({
              where: { id: product.id },
              data: { currentQuantity: newQuantity, lastUpdated: new Date() }
            });
            await prisma.productLog.create({
              data: {
                action: 'INCREASE',
                quantity: qty,
                oldQuantity: oldQuantity,
                newQuantity: newQuantity,
                reason: 'Customer return approved',
                reference: `Return: ${returnNumber}`,
                notes: `Quantity increased by ${qty} due to customer return`,
                tenantId,
                productId: product.id
              }
            });
            results.productsUpdated++;
            results.logsCreated++;
          } else {
            results.errors.push({ item: item.productName, error: 'Product not found' });
          }
        } catch (itemError) {
          console.error(`   Error processing return item ${item.productName}:`, itemError);
          results.errors.push({ item: item.productName, error: itemError.message });
        }
      }
      console.log(`   Customer return inventory: ${results.productsUpdated} updated, ${results.logsCreated} logs`);
      return results;
    } catch (error) {
      console.error('increaseInventoryFromCustomerReturn failed:', error);
      throw error;
    }
  }

  /**
   * Update inventory when a return is processed (e.g. supplier return - decrease our stock)
   * @param {string} tenantId - Tenant ID
   * @param {Array} returnItems - Array of return items
   * @param {string} returnId - Return ID
   * @param {string} returnNumber - Return number for reference
   */
  static async updateInventoryFromReturn(tenantId, returnItems, returnId, returnNumber) {
    console.log(`🔄 Processing return for ${returnItems.length} items (Return: ${returnNumber})`);
    
    const results = {
      productsUpdated: 0,
      logsCreated: 0,
      errors: []
    };

    try {
      for (const item of returnItems) {
        try {
          // Check if return item has variant info
          if (item.productVariantId) {
            const variant = await prisma.productVariant.findFirst({
              where: {
                id: item.productVariantId,
                product: {
                  tenantId: tenantId
                }
              },
              include: {
                product: true
              }
            });

            if (variant) {
              const oldQuantity = variant.currentQuantity;
              const newQuantity = Math.max(0, oldQuantity - item.quantity);

              await prisma.productVariant.update({
                where: { id: variant.id },
                data: {
                  currentQuantity: newQuantity,
                  updatedAt: new Date()
                }
              });

              // Create variant-level product log
              await prisma.productLog.create({
                data: {
                  action: 'DECREASE',
                  quantity: -item.quantity,
                  oldQuantity: oldQuantity,
                  newQuantity: newQuantity,
                  reason: 'Product return processed',
                  reference: `Return: ${returnNumber}`,
                  notes: `Variant (${variant.color}${variant.size ? `, ${variant.size}` : ''}) quantity decreased by ${item.quantity} due to return`,
                  tenantId: tenantId,
                  productId: variant.productId,
                  productVariantId: variant.id
                }
              });

              results.productsUpdated++;
              results.logsCreated++;

              console.log(`   ✅ Updated variant: ${variant.product.name} - ${variant.color}${variant.size ? `, ${variant.size}` : ''} (${oldQuantity} → ${newQuantity})`);
              continue; // Skip to next item
            } else {
              console.log(`   ⚠️  Variant not found: ${item.productVariantId}, falling back to product-level update`);
            }
          }

          // Fallback to product-level update (backward compatible or variant not found)
          // Find the product (case-insensitive exact match)
          const product = await prisma.product.findFirst({
            where: {
              tenantId: tenantId,
              name: {
                equals: item.productName,
                mode: 'insensitive'
              }
            }
          });

          if (product) {
            const oldQuantity = product.currentQuantity;
            const newQuantity = Math.max(0, oldQuantity - item.quantity); // Don't go below 0

            await prisma.product.update({
              where: { id: product.id },
              data: {
                currentQuantity: newQuantity,
                lastUpdated: new Date()
              }
            });

            // Create product log for quantity decrease
            await prisma.productLog.create({
              data: {
                action: 'DECREASE',
                quantity: -item.quantity,
                oldQuantity: oldQuantity,
                newQuantity: newQuantity,
                reason: 'Product return processed',
                reference: `Return: ${returnNumber}`,
                notes: `Quantity decreased by ${item.quantity} due to return`,
                tenantId: tenantId,
                productId: product.id
                // Note: No purchaseItemId for returns as they're not linked to specific purchase items
              }
            });

            results.productsUpdated++;
            results.logsCreated++;

            console.log(`   ✅ Updated product: ${item.productName} (${oldQuantity} → ${newQuantity})`);

          } else {
            console.log(`   ⚠️  Product not found: ${item.productName}`);
            results.errors.push({
              item: item.productName,
              error: 'Product not found in inventory'
            });
          }

        } catch (itemError) {
          console.error(`   ❌ Error processing return item ${item.productName}:`, itemError);
          results.errors.push({
            item: item.productName,
            error: itemError.message
          });
        }
      }

      console.log(`✅ Return processing completed: ${results.productsUpdated} updated, ${results.logsCreated} logs`);
      return results;

    } catch (error) {
      console.error('❌ Return processing failed:', error);
      throw error;
    }
  }

  /**
   * Increase inventory when a customer order return is approved (business receives product back).
   * @param {string} tenantId - Tenant ID
   * @param {Array} returnItems - Array of return items (with productVariantId, productName, quantity)
   * @param {string} returnId - Return ID
   * @param {string} returnNumber - Return number for reference
   */
  static async increaseInventoryFromCustomerReturn(tenantId, returnItems, returnId, returnNumber) {
    if (!returnItems || returnItems.length === 0) return { productsUpdated: 0, logsCreated: 0, errors: [] };
    console.log(`🔄 Increasing inventory for customer return ${returnNumber} (${returnItems.length} items)`);
    const results = { productsUpdated: 0, logsCreated: 0, errors: [] };

    for (const item of returnItems) {
      try {
        const quantity = item.quantity || 0;
        if (quantity <= 0) continue;

        if (item.productVariantId) {
          const variant = await prisma.productVariant.findFirst({
            where: { id: item.productVariantId, product: { tenantId } },
            include: { product: true }
          });
          if (variant) {
            const oldQuantity = variant.currentQuantity;
            const newQuantity = oldQuantity + quantity;
            await prisma.productVariant.update({
              where: { id: variant.id },
              data: { currentQuantity: newQuantity, updatedAt: new Date() }
            });
            await prisma.productLog.create({
              data: {
                action: 'INCREASE',
                quantity,
                oldQuantity,
                newQuantity,
                reason: 'Customer return approved',
                reference: `Return: ${returnNumber}`,
                notes: `Variant (${variant.color}${variant.size ? `, ${variant.size}` : ''}) quantity increased by ${quantity} (customer return)`,
                tenantId,
                productId: variant.productId,
                productVariantId: variant.id
              }
            });
            results.productsUpdated++;
            results.logsCreated++;
            continue;
          }
        }

        const product = await prisma.product.findFirst({
          where: {
            tenantId,
            name: { equals: item.productName || '', mode: 'insensitive' }
          }
        });
        if (product) {
          const oldQuantity = product.currentQuantity;
          const newQuantity = oldQuantity + quantity;
          await prisma.product.update({
            where: { id: product.id },
            data: { currentQuantity: newQuantity, lastUpdated: new Date() }
          });
          await prisma.productLog.create({
            data: {
              action: 'INCREASE',
              quantity,
              oldQuantity,
              newQuantity,
              reason: 'Customer return approved',
              reference: `Return: ${returnNumber}`,
              notes: `Quantity increased by ${quantity} (customer return)`,
              tenantId,
              productId: product.id
            }
          });
          results.productsUpdated++;
          results.logsCreated++;
        } else {
          results.errors.push({ item: item.productName, error: 'Product not found' });
        }
      } catch (err) {
        console.error(`   ❌ Error increasing stock for ${item.productName}:`, err);
        results.errors.push({ item: item.productName, error: err.message });
      }
    }
    return results;
  }

  /**
   * Decrease inventory when an order is confirmed.
   * When called with (tenantId, orderId, orderNumber), reads orderItems from DB (source of truth for variants).
   * When called with (tenantId, orderId, orderNumber, selectedProducts, productQuantities), uses legacy payload (backward compat).
   * @param {string} tenantId - Tenant ID
   * @param {string} orderId - Order ID
   * @param {string} orderNumber - Order number for reference
   * @param {Array|string} [selectedProducts] - Optional; array of selected products or JSON string (legacy)
   * @param {Object|string} [productQuantities] - Optional; object mapping product/variant keys to quantities (legacy)
   */
  static async decreaseInventoryFromOrder(tenantId, orderId, orderNumber, selectedProducts, productQuantities) {
    const results = {
      productsUpdated: 0,
      logsCreated: 0,
      errors: []
    };

    try {
      // Prefer orderItems from DB when available (variant-correct)
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          orderItems: true
        }
      });

      if (order && order.orderItems && order.orderItems.length > 0) {
        console.log(`🔄 Decreasing inventory for order ${orderNumber} (${order.orderItems.length} order items)`);
        for (const item of order.orderItems) {
          try {
            const productId = item.productId;
            const productName = item.productName;
            const variantId = item.productVariantId;
            const quantity = item.quantity;

            if (!productName) {
              console.log(`   ⚠️  Skipping order item without productName`);
              continue;
            }

            if (variantId) {
              const variant = await prisma.productVariant.findFirst({
                where: {
                  id: variantId,
                  product: { tenantId: tenantId }
                },
                include: { product: true }
              });

              if (variant) {
                const oldQuantity = variant.currentQuantity;
                const newQuantity = Math.max(0, oldQuantity - quantity);
                await prisma.productVariant.update({
                  where: { id: variant.id },
                  data: { currentQuantity: newQuantity, updatedAt: new Date() }
                });
                await prisma.productLog.create({
                  data: {
                    action: 'DECREASE',
                    quantity: -quantity,
                    oldQuantity: oldQuantity,
                    newQuantity: newQuantity,
                    reason: 'Order confirmed',
                    reference: `Order: ${orderNumber}`,
                    notes: `Variant (${variant.color}${variant.size ? `, ${variant.size}` : ''}) quantity decreased by ${quantity} due to order confirmation`,
                    tenantId: tenantId,
                    productId: variant.productId,
                    productVariantId: variant.id
                  }
                });
                results.productsUpdated++;
                results.logsCreated++;
                console.log(`   ✅ Updated variant: ${variant.product.name} - ${variant.color}${variant.size ? `, ${variant.size}` : ''} (${oldQuantity} → ${newQuantity}, -${quantity})`);
                continue;
              }
              console.log(`   ⚠️  Variant not found: ${variantId}, falling back to product-level`);
            }

            let foundProduct = null;
            if (productId) {
              foundProduct = await prisma.product.findFirst({
                where: { id: productId, tenantId: tenantId }
              });
            }
            if (!foundProduct) {
              foundProduct = await prisma.product.findFirst({
                where: {
                  tenantId: tenantId,
                  name: { equals: productName, mode: 'insensitive' }
                }
              });
            }
            if (foundProduct) {
              const oldQuantity = foundProduct.currentQuantity;
              const newQuantity = Math.max(0, oldQuantity - quantity);
              await prisma.product.update({
                where: { id: foundProduct.id },
                data: { currentQuantity: newQuantity, lastUpdated: new Date() }
              });
              await prisma.productLog.create({
                data: {
                  action: 'DECREASE',
                  quantity: -quantity,
                  oldQuantity: oldQuantity,
                  newQuantity: newQuantity,
                  reason: 'Order confirmed',
                  reference: `Order: ${orderNumber}`,
                  notes: `Quantity decreased by ${quantity} due to order confirmation`,
                  tenantId: tenantId,
                  productId: foundProduct.id
                }
              });
              results.productsUpdated++;
              results.logsCreated++;
              console.log(`   ✅ Updated product: ${productName} (${oldQuantity} → ${newQuantity}, -${quantity})`);
            } else {
              console.log(`   ⚠️  Product not found: ${productName} (ID: ${productId || 'N/A'})`);
              results.errors.push({ product: productName, error: 'Product not found in inventory' });
            }
          } catch (itemError) {
            console.error(`   ❌ Error processing order item ${item.productName || 'unknown'}:`, itemError);
            results.errors.push({ product: item.productName || 'unknown', error: itemError.message });
          }
        }
        console.log(`✅ Order processing completed: ${results.productsUpdated} updated, ${results.logsCreated} logs`);
        return results;
      }

      // Fallback: use selectedProducts + productQuantities (legacy / old orders without orderItems)
      const legacyProducts = selectedProducts ?? order?.selectedProducts;
      const legacyQuantities = productQuantities ?? order?.productQuantities;
      console.log(`🔄 Decreasing inventory for order ${orderNumber} (legacy selectedProducts)`);
      let products = legacyProducts;
      if (typeof legacyProducts === 'string') {
        try {
          products = JSON.parse(legacyProducts);
        } catch (e) {
          console.error('Error parsing selectedProducts:', e);
          throw new Error('Invalid selectedProducts format');
        }
      }
      let quantities = legacyQuantities;
      if (typeof legacyQuantities === 'string') {
        try {
          quantities = JSON.parse(legacyQuantities);
        } catch (e) {
          console.error('Error parsing productQuantities:', e);
          throw new Error('Invalid productQuantities format');
        }
      }
      if (!Array.isArray(products)) {
        products = typeof products === 'object' && products !== null ? Object.values(products) : [];
      }
      if (!quantities || typeof quantities !== 'object') {
        quantities = {};
      }
      if (products.length === 0) {
        console.log('⚠️  No products found in order');
        return results;
      }

      const qtyPriceKey = (p) => {
        const vid = p.variantId || p.productVariantId;
        const pid = p.id;
        return vid ? `${pid}_${vid}` : pid;
      };

      for (const product of products) {
        try {
          const productId = product.id;
          const productName = product.name;
          const variantId = product.variantId || product.productVariantId;
          const key = qtyPriceKey(product);
          const quantity = quantities[key] ?? quantities[productId] ?? product.quantity ?? 1;

          if (!productName) {
            console.log(`   ⚠️  Skipping product without name`);
            continue;
          }

          if (variantId) {
            const variant = await prisma.productVariant.findFirst({
              where: {
                id: variantId,
                product: { tenantId: tenantId }
              },
              include: { product: true }
            });

            if (variant) {
              const oldQuantity = variant.currentQuantity;
              const newQuantity = Math.max(0, oldQuantity - quantity);
              await prisma.productVariant.update({
                where: { id: variant.id },
                data: { currentQuantity: newQuantity, updatedAt: new Date() }
              });
              await prisma.productLog.create({
                data: {
                  action: 'DECREASE',
                  quantity: -quantity,
                  oldQuantity: oldQuantity,
                  newQuantity: newQuantity,
                  reason: 'Order confirmed',
                  reference: `Order: ${orderNumber}`,
                  notes: `Variant (${variant.color}${variant.size ? `, ${variant.size}` : ''}) quantity decreased by ${quantity} due to order confirmation`,
                  tenantId: tenantId,
                  productId: variant.productId,
                  productVariantId: variant.id
                }
              });
              results.productsUpdated++;
              results.logsCreated++;
              console.log(`   ✅ Updated variant: ${variant.product.name} - ${variant.color}${variant.size ? `, ${variant.size}` : ''} (${oldQuantity} → ${newQuantity}, -${quantity})`);
              continue;
            }
            console.log(`   ⚠️  Variant not found: ${variantId}, falling back to product-level update`);
          }

          let foundProduct = null;
          if (productId) {
            foundProduct = await prisma.product.findFirst({
              where: { id: productId, tenantId: tenantId }
            });
          }
          if (!foundProduct) {
            foundProduct = await prisma.product.findFirst({
              where: {
                tenantId: tenantId,
                name: { equals: productName, mode: 'insensitive' }
              }
            });
          }

          if (foundProduct) {
            const oldQuantity = foundProduct.currentQuantity;
            const newQuantity = Math.max(0, oldQuantity - quantity);
            await prisma.product.update({
              where: { id: foundProduct.id },
              data: { currentQuantity: newQuantity, lastUpdated: new Date() }
            });
            await prisma.productLog.create({
              data: {
                action: 'DECREASE',
                quantity: -quantity,
                oldQuantity: oldQuantity,
                newQuantity: newQuantity,
                reason: 'Order confirmed',
                reference: `Order: ${orderNumber}`,
                notes: `Quantity decreased by ${quantity} due to order confirmation`,
                tenantId: tenantId,
                productId: foundProduct.id
              }
            });
            results.productsUpdated++;
            results.logsCreated++;
            console.log(`   ✅ Updated product: ${productName} (${oldQuantity} → ${newQuantity}, -${quantity})`);
          } else {
            console.log(`   ⚠️  Product not found: ${productName} (ID: ${productId || 'N/A'})`);
            results.errors.push({ product: productName, error: 'Product not found in inventory' });
          }
        } catch (itemError) {
          console.error(`   ❌ Error processing product ${product.name || 'unknown'}:`, itemError);
          results.errors.push({ product: product.name || 'unknown', error: itemError.message });
        }
      }

      console.log(`✅ Order processing completed: ${results.productsUpdated} updated, ${results.logsCreated} logs`);
      return results;
    } catch (error) {
      console.error('❌ Order processing failed:', error);
      throw error;
    }
  }

  /**
   * Update inventory when an order is updated (quantities changed)
   * @param {string} tenantId - Tenant ID
   * @param {string} orderId - Order ID
   * @param {string} orderNumber - Order number for reference
   * @param {Array|string} oldSelectedProducts - Old selected products
   * @param {Object|string} oldProductQuantities - Old product quantities
   * @param {Array|string} newSelectedProducts - New selected products
   * @param {Object|string} newProductQuantities - New product quantities
   */
  static async updateInventoryFromOrderEdit(tenantId, orderId, orderNumber, oldSelectedProducts, oldProductQuantities, newSelectedProducts, newProductQuantities) {
    console.log(`🔄 Updating inventory for order edit: ${orderNumber}`);
    
    const results = {
      productsUpdated: 0,
      logsCreated: 0,
      errors: []
    };

    try {
      // Parse old data
      let oldProducts = oldSelectedProducts;
      if (typeof oldSelectedProducts === 'string') {
        try {
          oldProducts = JSON.parse(oldSelectedProducts);
        } catch (e) {
          console.error('Error parsing old selectedProducts:', e);
          oldProducts = [];
        }
      }

      let oldQuantities = oldProductQuantities;
      if (typeof oldProductQuantities === 'string') {
        try {
          oldQuantities = JSON.parse(oldProductQuantities);
        } catch (e) {
          console.error('Error parsing old productQuantities:', e);
          oldQuantities = {};
        }
      }

      // Parse new data
      let newProducts = newSelectedProducts;
      if (typeof newSelectedProducts === 'string') {
        try {
          newProducts = JSON.parse(newSelectedProducts);
        } catch (e) {
          console.error('Error parsing new selectedProducts:', e);
          newProducts = [];
        }
      }

      let newQuantities = newProductQuantities;
      if (typeof newProductQuantities === 'string') {
        try {
          newQuantities = JSON.parse(newProductQuantities);
        } catch (e) {
          console.error('Error parsing new productQuantities:', e);
          newQuantities = {};
        }
      }

      // Ensure products are arrays
      if (!Array.isArray(oldProducts)) {
        if (typeof oldProducts === 'object' && oldProducts !== null) {
          oldProducts = Object.values(oldProducts);
        } else {
          oldProducts = [];
        }
      }

      if (!Array.isArray(newProducts)) {
        if (typeof newProducts === 'object' && newProducts !== null) {
          newProducts = Object.values(newProducts);
        } else {
          newProducts = [];
        }
      }

      // Ensure quantities are objects
      if (!oldQuantities || typeof oldQuantities !== 'object') {
        oldQuantities = {};
      }
      if (!newQuantities || typeof newQuantities !== 'object') {
        newQuantities = {};
      }

      // Create maps for easier lookup
      const oldProductMap = new Map();
      oldProducts.forEach(product => {
        const productId = product.id || product;
        const quantity = oldQuantities[productId] || product.quantity || 1;
        oldProductMap.set(productId, { product, quantity });
      });

      const newProductMap = new Map();
      newProducts.forEach(product => {
        const productId = product.id || product;
        const quantity = newQuantities[productId] || product.quantity || 1;
        newProductMap.set(productId, { product, quantity });
      });

      // Process all products (old and new)
      const allProductIds = new Set([...oldProductMap.keys(), ...newProductMap.keys()]);

      for (const productId of allProductIds) {
        try {
          const oldData = oldProductMap.get(productId);
          const newData = newProductMap.get(productId);
          const oldQuantity = oldData ? oldData.quantity : 0;
          const newQuantity = newData ? newData.quantity : 0;
          const quantityDiff = newQuantity - oldQuantity;

          if (quantityDiff === 0) {
            continue; // No change, skip
          }

          // Find the product
          const product = oldData?.product || newData?.product;
          const productName = product?.name || 'Unknown';
          
          let foundProduct = null;
          if (productId && typeof productId === 'string' && productId.length > 0) {
            foundProduct = await prisma.product.findFirst({
              where: {
                id: productId,
                tenantId: tenantId
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
                }
              }
            });
          }

          if (foundProduct) {
            const currentQuantity = foundProduct.currentQuantity;
            // Reverse old quantity (add it back) and apply new quantity (subtract it)
            // Net effect: add back old, subtract new = add (old - new) = subtract (new - old) = subtract quantityDiff
            const updatedQuantity = Math.max(0, currentQuantity - quantityDiff);

            await prisma.product.update({
              where: { id: foundProduct.id },
              data: {
                currentQuantity: updatedQuantity,
                lastUpdated: new Date()
              }
            });

            // Create product log
            const action = quantityDiff > 0 ? 'DECREASE' : 'INCREASE';
            await prisma.productLog.create({
              data: {
                action: action,
                quantity: -quantityDiff, // Negative because we're subtracting from inventory
                oldQuantity: currentQuantity,
                newQuantity: updatedQuantity,
                reason: 'Order quantity updated',
                reference: `Order Edit: ${orderNumber}`,
                notes: `Quantity ${quantityDiff > 0 ? 'decreased' : 'increased'} by ${Math.abs(quantityDiff)} (from ${oldQuantity} to ${newQuantity} in order)`,
                tenantId: tenantId,
                productId: foundProduct.id
              }
            });

            results.productsUpdated++;
            results.logsCreated++;
            console.log(`   ✅ Updated product: ${productName} (${currentQuantity} → ${updatedQuantity}, ${quantityDiff > 0 ? '-' : '+'}${Math.abs(quantityDiff)})`);
          } else {
            console.log(`   ⚠️  Product not found: ${productName} (ID: ${productId || 'N/A'})`);
            results.errors.push({
              product: productName,
              error: 'Product not found in inventory'
            });
          }
        } catch (itemError) {
          console.error(`   ❌ Error processing product ${productId || 'unknown'}:`, itemError);
          results.errors.push({
            product: productId || 'unknown',
            error: itemError.message
          });
        }
      }

      console.log(`✅ Order edit inventory update completed: ${results.productsUpdated} updated, ${results.logsCreated} logs`);
      return results;

    } catch (error) {
      console.error('❌ Order edit inventory update failed:', error);
      throw error;
    }
  }

  /**
   * Get product inventory summary
   * @param {string} tenantId - Tenant ID
   * @param {Object} filters - Optional filters
   */
  static async getInventorySummary(tenantId, filters = {}) {
    try {
      const whereClause = {
        tenantId: tenantId,
        isActive: true,
        ...filters
      };

      const products = await prisma.product.findMany({
        where: whereClause,
        include: {
          productLogs: {
            orderBy: { createdAt: 'desc' },
            take: 5 // Last 5 logs
          }
        },
        orderBy: { name: 'asc' }
      });

      const summary = {
        totalProducts: products.length,
        totalQuantity: products.reduce((sum, p) => sum + p.currentQuantity, 0),
        totalValue: products.reduce((sum, p) => sum + (p.currentQuantity * (p.lastPurchasePrice || 0)), 0),
        lowStockProducts: products.filter(p => p.currentQuantity <= p.minStockLevel),
        products: products
      };

      return summary;

    } catch (error) {
      console.error('❌ Error getting inventory summary:', error);
      throw error;
    }
  }

  /**
   * Get product history/logs
   * @param {string} tenantId - Tenant ID
   * @param {string} productId - Product ID (optional)
   * @param {Object} filters - Optional filters
   */
  static async getProductHistory(tenantId, productId = null, filters = {}) {
    try {
      const whereClause = {
        tenantId: tenantId,
        ...(productId && { productId: productId }),
        ...filters
      };

      const logs = await prisma.productLog.findMany({
        where: whereClause,
        include: {
          product: {
            select: { name: true }
          },
          purchaseItem: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return logs;

    } catch (error) {
      console.error('❌ Error getting product history:', error);
      throw error;
    }
  }

  /**
   * Delete purchase invoice and reverse all inventory changes
   * @param {string} tenantId - Tenant ID
   * @param {string} invoiceId - Purchase invoice ID
   * @param {string} invoiceNumber - Invoice number for reference
   */
  static async deletePurchaseInvoice(tenantId, invoiceId, invoiceNumber) {
    console.log(`🗑️ Deleting purchase invoice: ${invoiceNumber}`);
    
    const results = {
      inventoryReversed: 0,
      logsCreated: 0,
      purchaseItemsDeleted: 0,
      returnsUpdated: 0,
      errors: []
    };

    try {
      // Step 1: Get the invoice with all related data
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: {
          id: invoiceId,
          tenantId: tenantId
        },
        include: {
          purchaseItems: true,
          returns: true
        }
      });

      if (!invoice) {
        throw new Error('Purchase invoice not found');
      }

      // Step 2: Reverse inventory changes for each purchase item
      for (const purchaseItem of invoice.purchaseItems) {
        try {
          // Find the product that was affected (case-insensitive exact match)
          const product = await prisma.product.findFirst({
            where: {
              tenantId: tenantId,
              name: {
                equals: purchaseItem.name,
                mode: 'insensitive'
              }
            }
          });

          if (product) {
            // Calculate new quantity after reversal
            const oldQuantity = product.currentQuantity;
            const newQuantity = Math.max(0, oldQuantity - purchaseItem.quantity);
            
            // Update product quantity
            await prisma.product.update({
              where: { id: product.id },
              data: {
                currentQuantity: newQuantity,
                lastUpdated: new Date()
              }
            });

            // Create reversal product log
            await prisma.productLog.create({
              data: {
                action: 'DECREASE',
                quantity: -purchaseItem.quantity,
                oldQuantity: oldQuantity,
                newQuantity: newQuantity,
                reason: 'Purchase invoice deleted - inventory reversal',
                reference: `Invoice Deletion: ${invoiceNumber}`,
                notes: `Reversed ${purchaseItem.quantity} units from deleted purchase`,
                tenantId: tenantId,
                productId: product.id
              }
            });

            results.inventoryReversed++;
            results.logsCreated++;
            
            console.log(`   ✅ Reversed inventory: ${purchaseItem.name} (${oldQuantity} → ${newQuantity})`);
          }
        } catch (error) {
          console.error(`   ❌ Error reversing inventory for ${purchaseItem.name}:`, error);
          results.errors.push(`Failed to reverse inventory for ${purchaseItem.name}: ${error.message}`);
        }
      }

      // Step 3: Delete product logs linked to purchase items
      const purchaseItemIds = invoice.purchaseItems.map(item => item.id);
      const deletedLogs = await prisma.productLog.deleteMany({
        where: {
          purchaseItemId: {
            in: purchaseItemIds
          }
        }
      });
      
      console.log(`   🗑️ Deleted ${deletedLogs.count} product logs linked to purchase items`);

      // Step 4: Update returns to remove invoice reference
      if (invoice.returns.length > 0) {
        await prisma.return.updateMany({
          where: {
            id: {
              in: invoice.returns.map(r => r.id)
            }
          },
          data: {
            purchaseInvoiceId: null
          }
        });
        
        results.returnsUpdated = invoice.returns.length;
        console.log(`   🔄 Updated ${invoice.returns.length} returns to remove invoice reference`);
      }

      // Step 5: Soft delete purchase items
      const deletedItems = await prisma.purchaseItem.updateMany({
        where: {
          purchaseInvoiceId: invoiceId,
          isDeleted: false
        },
        data: {
          isDeleted: true,
          deletedAt: new Date()
        }
      });
      
      results.purchaseItemsDeleted = deletedItems.count;
      console.log(`   🗑️ Soft deleted ${deletedItems.count} purchase items`);

      // Step 6: Soft delete the invoice (mark as deleted instead of removing)
      await prisma.purchaseInvoice.update({
        where: { id: invoiceId },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: 'system', // TODO: Get actual user ID from request
          deleteReason: 'Invoice deleted by user - inventory reversed'
        }
      });

      console.log(`✅ Invoice soft deletion completed: ${invoiceNumber}`);
      console.log(`📊 Results:`, results);

      return results;

    } catch (error) {
      console.error('❌ Error deleting purchase invoice:', error);
      throw error;
    }
  }

  /**
   * Update inventory when a purchase invoice is edited
   * @param {string} tenantId - Tenant ID
   * @param {Array} oldPurchaseItems - Array of old purchase items before update
   * @param {Array} newPurchaseItems - Array of new purchase items after update
   * @param {string} purchaseInvoiceId - Purchase invoice ID
   * @param {string} invoiceNumber - Invoice number for reference
   */
  static async updateInventoryFromPurchaseEdit(tenantId, oldPurchaseItems, newPurchaseItems, purchaseInvoiceId, invoiceNumber) {
    console.log(`🔄 Updating inventory for purchase invoice edit: ${invoiceNumber}`);
    console.log(`   Old items count: ${oldPurchaseItems.length}`);
    console.log(`   New items count: ${newPurchaseItems.length}`);
    console.log(`   Old items:`, oldPurchaseItems.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, productId: i.productId })));
    console.log(`   New items:`, newPurchaseItems.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, productId: i.productId })));
    
    const results = {
      productsUpdated: 0,
      productsCreated: 0,
      logsCreated: 0,
      errors: []
    };

    try {
      // Create maps for easier lookup
      const getItemKey = (item) => {
        if (item.productVariantId) return `variant:${item.productVariantId}`;
        if (item.productId) return `product:${item.productId}`;
        return `name:${(item.name || '').toLowerCase()}`;
      };
      const oldItemsMap = new Map();
      oldPurchaseItems.forEach(item => {
        const key = getItemKey(item);
        if (!oldItemsMap.has(key)) oldItemsMap.set(key, []);
        oldItemsMap.get(key).push(item);
      });

      const newItemsMap = new Map();
      newPurchaseItems.forEach(item => {
        const key = getItemKey(item);
        if (!newItemsMap.has(key)) newItemsMap.set(key, []);
        newItemsMap.get(key).push(item);
      });

      // Process deleted items (in old but not in new)
      for (const [key, oldItems] of oldItemsMap.entries()) {
        const newItems = newItemsMap.get(key) || [];
        
        // If item was deleted, reverse the inventory
        if (newItems.length === 0) {
          for (const oldItem of oldItems) {
            try {
              if (oldItem.productVariantId) {
                const variant = await this.findVariantForItem(tenantId, oldItem);
                if (variant) {
                  const oldQuantity = variant.currentQuantity;
                  const newQuantity = Math.max(0, oldQuantity - oldItem.quantity);
                  await prisma.productVariant.update({
                    where: { id: variant.id },
                    data: { currentQuantity: newQuantity, updatedAt: new Date() }
                  });
                  await prisma.product.update({
                    where: { id: variant.productId },
                    data: { lastUpdated: new Date() }
                  });
                  await prisma.productLog.create({
                    data: {
                      action: 'DECREASE',
                      quantity: -oldItem.quantity,
                      oldQuantity: oldQuantity,
                      newQuantity: newQuantity,
                      reason: 'Purchase invoice item deleted',
                      reference: `Invoice Edit: ${invoiceNumber}`,
                      notes: `Variant (${variant.color}${variant.size ? `, ${variant.size}` : ''}) quantity decreased by ${oldItem.quantity} due to purchase item deletion`,
                      tenantId: tenantId,
                      productId: variant.productId,
                      productVariantId: variant.id,
                      purchaseItemId: oldItem.id
                    }
                  });
                  results.productsUpdated++;
                  results.logsCreated++;
                  console.log(`   ✅ Reversed variant inventory for deleted item: ${oldItem.name} (${oldQuantity} → ${newQuantity})`);
                }
              } else {
                const product = await this.findProductForItem(tenantId, oldItem);
                if (product) {
                  const oldQuantity = product.currentQuantity;
                  const newQuantity = Math.max(0, oldQuantity - oldItem.quantity);
                  await prisma.product.update({
                    where: { id: product.id },
                    data: {
                      currentQuantity: newQuantity,
                      lastUpdated: new Date()
                    }
                  });
                  await prisma.productLog.create({
                    data: {
                      action: 'DECREASE',
                      quantity: -oldItem.quantity,
                      oldQuantity: oldQuantity,
                      newQuantity: newQuantity,
                      reason: 'Purchase invoice item deleted',
                      reference: `Invoice Edit: ${invoiceNumber}`,
                      notes: `Quantity decreased by ${oldItem.quantity} due to purchase item deletion`,
                      tenantId: tenantId,
                      productId: product.id,
                      purchaseItemId: oldItem.id
                    }
                  });
                  results.productsUpdated++;
                  results.logsCreated++;
                  console.log(`   ✅ Reversed inventory for deleted item: ${oldItem.name} (${oldQuantity} → ${newQuantity})`);
                }
              }
            } catch (itemError) {
              console.error(`   ❌ Error processing deleted item ${oldItem.name}:`, itemError);
              results.errors.push({
                item: oldItem.name,
                error: itemError.message
              });
            }
          }
        }
      }

      // Process new items (in new but not in old) and updated items
      for (const [key, newItems] of newItemsMap.entries()) {
        const oldItems = oldItemsMap.get(key) || [];
        
        for (const newItem of newItems) {
          try {
            // Find matching old item by ID first (most reliable)
            let oldItem = null;
            if (newItem.id) {
              oldItem = oldPurchaseItems.find(item => item.id === newItem.id);
            }
            
            // If not found by ID, try to match from the same key group
            if (!oldItem && oldItems.length > 0) {
              // Try to match by name and purchase price
              oldItem = oldItems.find(item => 
                item.name.toLowerCase() === newItem.name.toLowerCase() &&
                Math.abs(item.purchasePrice - newItem.purchasePrice) < 0.01
              );
            }
            
            // If still not found and we have an ID, search all old items (for name changes)
            if (!oldItem && newItem.id) {
              oldItem = oldPurchaseItems.find(item => item.id === newItem.id);
            }

            if (!oldItem) {
              console.log(`   ⚠️  No matching old item found for new item: ${newItem.name} (ID: ${newItem.id})`);
              console.log(`      Treating as new item...`);
            }

            if (oldItem) {
              // Item was updated - check what changed
              const quantityDiff = newItem.quantity - oldItem.quantity;
              const nameChanged = newItem.name.toLowerCase() !== oldItem.name.toLowerCase();
              const variantChanged = (oldItem.productVariantId || null) !== (newItem.productVariantId || null);
              const priceChanged = Math.abs(newItem.purchasePrice - oldItem.purchasePrice) >= 0.01;
              
              console.log(`   📝 Processing item update: ${oldItem.name} → ${newItem.name}`);
              console.log(`      Quantity: ${oldItem.quantity} → ${newItem.quantity} (diff: ${quantityDiff})`);
              console.log(`      Name changed: ${nameChanged}, Variant changed: ${variantChanged}, Price changed: ${priceChanged}`);
              
              // If variant changed, move inventory from old variant to new variant
              if (variantChanged) {
                console.log(`   🔄 Variant change detected, transferring inventory...`);
                if (oldItem.productVariantId) {
                  const oldVariant = await this.findVariantForItem(tenantId, oldItem);
                  if (oldVariant) {
                    const oldQty = oldVariant.currentQuantity;
                    const newQty = Math.max(0, oldQty - oldItem.quantity);
                    await prisma.productVariant.update({
                      where: { id: oldVariant.id },
                      data: { currentQuantity: newQty, updatedAt: new Date() }
                    });
                    await prisma.productLog.create({
                      data: {
                        action: 'DECREASE',
                        quantity: -oldItem.quantity,
                        oldQuantity: oldQty,
                        newQuantity: newQty,
                        reason: 'Purchase invoice variant updated',
                        reference: `Invoice Edit: ${invoiceNumber}`,
                        notes: `Variant changed from ${oldVariant.color}${oldVariant.size ? `, ${oldVariant.size}` : ''}`,
                        tenantId: tenantId,
                        productId: oldVariant.productId,
                        productVariantId: oldVariant.id,
                        purchaseItemId: oldItem.id
                      }
                    });
                    results.productsUpdated++;
                    results.logsCreated++;
                  }
                }

                if (newItem.productVariantId) {
                  const newVariant = await this.findVariantForItem(tenantId, newItem);
                  if (newVariant) {
                    const oldQty = newVariant.currentQuantity;
                    const newQty = oldQty + newItem.quantity;
                    await prisma.productVariant.update({
                      where: { id: newVariant.id },
                      data: { currentQuantity: newQty, updatedAt: new Date() }
                    });
                    await prisma.product.update({
                      where: { id: newVariant.productId },
                      data: { lastPurchasePrice: newItem.purchasePrice, lastUpdated: new Date() }
                    });
                    await prisma.productLog.create({
                      data: {
                        action: 'INCREASE',
                        quantity: newItem.quantity,
                        oldQuantity: oldQty,
                        newQuantity: newQty,
                        reason: 'Purchase invoice variant updated',
                        reference: `Invoice Edit: ${invoiceNumber}`,
                        notes: `Variant changed to ${newVariant.color}${newVariant.size ? `, ${newVariant.size}` : ''}`,
                        tenantId: tenantId,
                        productId: newVariant.productId,
                        productVariantId: newVariant.id,
                        purchaseItemId: newItem.id
                      }
                    });
                    results.productsUpdated++;
                    results.logsCreated++;
                  }
                }

                continue;
              }

              // If name changed, we need to transfer inventory from old product to new product
              if (nameChanged) {
                console.log(`   🔄 Name changed detected, transferring inventory...`);
                // Find the old product (by old name or productId)
                const oldProduct = await this.findProductForItem(tenantId, oldItem);
                const newProduct = await this.findProductForItem(tenantId, newItem);
                
                if (oldProduct) {
                  // Reverse inventory from old product
                  const oldProductQuantity = oldProduct.currentQuantity;
                  const oldProductNewQuantity = Math.max(0, oldProductQuantity - oldItem.quantity);
                  
                  await prisma.product.update({
                    where: { id: oldProduct.id },
                    data: {
                      currentQuantity: oldProductNewQuantity,
                      lastUpdated: new Date()
                    }
                  });

                  await prisma.productLog.create({
                    data: {
                      action: 'DECREASE',
                      quantity: -oldItem.quantity,
                      oldQuantity: oldProductQuantity,
                      newQuantity: oldProductNewQuantity,
                      reason: 'Product name corrected in purchase invoice',
                      reference: `Invoice Edit: ${invoiceNumber}`,
                      notes: `Quantity decreased by ${oldItem.quantity} due to product name change from "${oldItem.name}" to "${newItem.name}"`,
                      tenantId: tenantId,
                      productId: oldProduct.id,
                      purchaseItemId: oldItem.id
                    }
                  });

                  results.productsUpdated++;
                  results.logsCreated++;
                  console.log(`   ✅ Reversed inventory from old product: ${oldItem.name} (${oldProductQuantity} → ${oldProductNewQuantity})`);
                }
                
                // Add inventory to new product (or create if doesn't exist)
                if (newProduct) {
                  // Product exists with new name, add quantity
                  const newProductQuantity = newProduct.currentQuantity;
                  const newProductNewQuantity = newProductQuantity + newItem.quantity;
                  
                  await prisma.product.update({
                    where: { id: newProduct.id },
                    data: {
                      currentQuantity: newProductNewQuantity,
                      lastPurchasePrice: newItem.purchasePrice,
                      lastUpdated: new Date()
                    }
                  });

                  // Link purchase item to new product
                  await prisma.purchaseItem.update({
                    where: { id: newItem.id },
                    data: { productId: newProduct.id }
                  });

                  await prisma.productLog.create({
                    data: {
                      action: 'INCREASE',
                      quantity: newItem.quantity,
                      oldQuantity: newProductQuantity,
                      newQuantity: newProductNewQuantity,
                      oldPrice: newProduct.lastPurchasePrice,
                      newPrice: newItem.purchasePrice,
                      reason: 'Product name corrected in purchase invoice',
                      reference: `Invoice Edit: ${invoiceNumber}`,
                      notes: `Quantity increased by ${newItem.quantity} due to product name change from "${oldItem.name}" to "${newItem.name}"`,
                      tenantId: tenantId,
                      productId: newProduct.id,
                      purchaseItemId: newItem.id
                    }
                  });

                  results.productsUpdated++;
                  results.logsCreated++;
                  console.log(`   ✅ Added inventory to new product: ${newItem.name} (${newProductQuantity} → ${newProductNewQuantity})`);
                } else {
                  // Create new product with corrected name
                  const defaultRetail = newItem.purchasePrice * 1.5;
                  const newProductCreated = await prisma.product.create({
                    data: {
                      name: newItem.name,
                      description: newItem.description,
                      category: newItem.category,
                      sku: newItem.sku,
                      currentQuantity: newItem.quantity,
                      lastPurchasePrice: newItem.purchasePrice,
                      currentRetailPrice: defaultRetail,
                      lastSalePrice: defaultRetail,
                      minStockLevel: 0,
                      maxStockLevel: newItem.quantity * 2,
                      isActive: true,
                      lastUpdated: new Date(),
                      tenantId: tenantId
                    }
                  });

                  // Link purchase item to new product
                  await prisma.purchaseItem.update({
                    where: { id: newItem.id },
                    data: { productId: newProductCreated.id }
                  });

                  await prisma.productLog.create({
                    data: {
                      action: 'CREATE',
                      quantity: newItem.quantity,
                      newQuantity: newItem.quantity,
                      newPrice: newItem.purchasePrice,
                      reason: 'Product name corrected in purchase invoice',
                      reference: `Invoice Edit: ${invoiceNumber}`,
                      notes: `New product created with quantity ${newItem.quantity} after name correction from "${oldItem.name}" to "${newItem.name}"`,
                      tenantId: tenantId,
                      productId: newProductCreated.id,
                      purchaseItemId: newItem.id
                    }
                  });

                  results.productsCreated++;
                  results.logsCreated++;
                  console.log(`   🆕 Created new product with corrected name: ${newItem.name} (Qty: ${newItem.quantity})`);
                }
              } else if (quantityDiff !== 0) {
                // Only quantity changed (name and price same)
                if (newItem.productVariantId) {
                  const variant = await this.findVariantForItem(tenantId, newItem);
                  if (variant) {
                    const oldQuantity = variant.currentQuantity;
                    const newQuantity = Math.max(0, oldQuantity + quantityDiff);
                    await prisma.productVariant.update({
                      where: { id: variant.id },
                      data: { currentQuantity: newQuantity, updatedAt: new Date() }
                    });
                    await prisma.product.update({
                      where: { id: variant.productId },
                      data: { lastPurchasePrice: newItem.purchasePrice, lastUpdated: new Date() }
                    });
                    const action = quantityDiff > 0 ? 'INCREASE' : 'DECREASE';
                    await prisma.productLog.create({
                      data: {
                        action: action,
                        quantity: quantityDiff,
                        oldQuantity: oldQuantity,
                        newQuantity: newQuantity,
                        oldPrice: variant.product.lastPurchasePrice,
                        newPrice: newItem.purchasePrice,
                        reason: 'Purchase invoice item updated',
                        reference: `Invoice Edit: ${invoiceNumber}`,
                        notes: `Variant (${variant.color}${variant.size ? `, ${variant.size}` : ''}) quantity ${quantityDiff > 0 ? 'increased' : 'decreased'} by ${Math.abs(quantityDiff)} (from ${oldItem.quantity} to ${newItem.quantity})`,
                        tenantId: tenantId,
                        productId: variant.productId,
                        productVariantId: variant.id,
                        purchaseItemId: newItem.id
                      }
                    });
                    results.productsUpdated++;
                    results.logsCreated++;
                    console.log(`   ✅ Updated variant: ${newItem.name} (${oldQuantity} → ${newQuantity}, ${quantityDiff > 0 ? '+' : ''}${quantityDiff})`);
                  }
                } else {
                  const product = await this.findProductForItem(tenantId, newItem);
                  if (product) {
                    const oldQuantity = product.currentQuantity;
                    const newQuantity = Math.max(0, oldQuantity + quantityDiff);
                    await prisma.product.update({
                      where: { id: product.id },
                      data: {
                        currentQuantity: newQuantity,
                        lastPurchasePrice: newItem.purchasePrice,
                        lastUpdated: new Date()
                      }
                    });
                    if (!newItem.productId) {
                      await prisma.purchaseItem.update({
                        where: { id: newItem.id },
                        data: { productId: product.id }
                      });
                    }
                    const action = quantityDiff > 0 ? 'INCREASE' : 'DECREASE';
                    await prisma.productLog.create({
                      data: {
                        action: action,
                        quantity: quantityDiff,
                        oldQuantity: oldQuantity,
                        newQuantity: newQuantity,
                        oldPrice: product.lastPurchasePrice,
                        newPrice: newItem.purchasePrice,
                        reason: 'Purchase invoice item updated',
                        reference: `Invoice Edit: ${invoiceNumber}`,
                        notes: `Quantity ${quantityDiff > 0 ? 'increased' : 'decreased'} by ${Math.abs(quantityDiff)} (from ${oldItem.quantity} to ${newItem.quantity})`,
                        tenantId: tenantId,
                        productId: product.id,
                        purchaseItemId: newItem.id
                      }
                    });
                    results.productsUpdated++;
                    results.logsCreated++;
                    console.log(`   ✅ Updated product: ${newItem.name} (${oldQuantity} → ${newQuantity}, ${quantityDiff > 0 ? '+' : ''}${quantityDiff})`);
                  }
                }
              } else if (priceChanged) {
                // Only price changed (name and quantity same)
                const product = await this.findProductForItem(tenantId, newItem);
                
                if (product) {
                  await prisma.product.update({
                    where: { id: product.id },
                    data: {
                      lastPurchasePrice: newItem.purchasePrice,
                      lastUpdated: new Date()
                    }
                  });

                  await prisma.productLog.create({
                    data: {
                      action: 'PURCHASE_PRICE_UPDATE',
                      quantity: 0,
                      oldQuantity: product.currentQuantity,
                      newQuantity: product.currentQuantity,
                      oldPrice: oldItem.purchasePrice,
                      newPrice: newItem.purchasePrice,
                      reason: 'Purchase price updated in invoice',
                      reference: `Invoice Edit: ${invoiceNumber}`,
                      notes: `Purchase price changed from ${oldItem.purchasePrice} to ${newItem.purchasePrice}`,
                      tenantId: tenantId,
                      productId: product.id,
                      purchaseItemId: newItem.id
                    }
                  });

                  results.productsUpdated++;
                  results.logsCreated++;
                  console.log(`   ✅ Updated price for product: ${newItem.name} (${oldItem.purchasePrice} → ${newItem.purchasePrice})`);
                }
              }
              // If nothing changed, no action needed
            } else {
              // New item - add to inventory
              if (newItem.productVariantId) {
                const variant = await this.findVariantForItem(tenantId, newItem);
                if (variant) {
                  const oldQuantity = variant.currentQuantity;
                  const newQuantity = oldQuantity + newItem.quantity;
                  await prisma.productVariant.update({
                    where: { id: variant.id },
                    data: { currentQuantity: newQuantity, updatedAt: new Date() }
                  });
                  await prisma.product.update({
                    where: { id: variant.productId },
                    data: { lastPurchasePrice: newItem.purchasePrice, lastUpdated: new Date() }
                  });
                  await prisma.productLog.create({
                    data: {
                      action: 'INCREASE',
                      quantity: newItem.quantity,
                      oldQuantity: oldQuantity,
                      newQuantity: newQuantity,
                      oldPrice: variant.product.lastPurchasePrice,
                      newPrice: newItem.purchasePrice,
                      reason: 'New item added to purchase invoice',
                      reference: `Invoice Edit: ${invoiceNumber}`,
                      notes: `Variant (${variant.color}${variant.size ? `, ${variant.size}` : ''}) quantity increased by ${newItem.quantity} from new purchase item`,
                      tenantId: tenantId,
                      productId: variant.productId,
                      productVariantId: variant.id,
                      purchaseItemId: newItem.id
                    }
                  });
                  results.productsUpdated++;
                  results.logsCreated++;
                  console.log(`   ✅ Added variant inventory for new item: ${newItem.name} (${oldQuantity} → ${newQuantity})`);
                }
              } else {
                const product = await this.findProductForItem(tenantId, newItem);
                if (product) {
                  const oldQuantity = product.currentQuantity;
                  const newQuantity = oldQuantity + newItem.quantity;
                  await prisma.product.update({
                    where: { id: product.id },
                    data: {
                      currentQuantity: newQuantity,
                      lastPurchasePrice: newItem.purchasePrice,
                      lastUpdated: new Date()
                    }
                  });
                  await prisma.purchaseItem.update({
                    where: { id: newItem.id },
                    data: { productId: product.id }
                  });
                  await prisma.productLog.create({
                    data: {
                      action: 'INCREASE',
                      quantity: newItem.quantity,
                      oldQuantity: oldQuantity,
                      newQuantity: newQuantity,
                      oldPrice: product.lastPurchasePrice,
                      newPrice: newItem.purchasePrice,
                      reason: 'New item added to purchase invoice',
                      reference: `Invoice Edit: ${invoiceNumber}`,
                      notes: `Quantity increased by ${newItem.quantity} from new purchase item`,
                      tenantId: tenantId,
                      productId: product.id,
                      purchaseItemId: newItem.id
                    }
                  });
                  results.productsUpdated++;
                  results.logsCreated++;
                  console.log(`   ✅ Added inventory for new item: ${newItem.name} (${oldQuantity} → ${newQuantity})`);
                } else {
                // Create new product
                const defaultRetail = newItem.purchasePrice * 1.5;
                const newProduct = await prisma.product.create({
                  data: {
                    name: newItem.name,
                    description: newItem.description,
                    category: newItem.category,
                    sku: newItem.sku,
                    currentQuantity: newItem.quantity,
                    lastPurchasePrice: newItem.purchasePrice,
                    currentRetailPrice: defaultRetail,
                    lastSalePrice: defaultRetail,
                    minStockLevel: 0,
                    maxStockLevel: newItem.quantity * 2,
                    isActive: true,
                    lastUpdated: new Date(),
                    tenantId: tenantId
                  }
                });

                // Link purchase item to product
                await prisma.purchaseItem.update({
                  where: { id: newItem.id },
                  data: { productId: newProduct.id }
                });

                await prisma.productLog.create({
                  data: {
                    action: 'CREATE',
                    quantity: newItem.quantity,
                    newQuantity: newItem.quantity,
                    newPrice: newItem.purchasePrice,
                    reason: 'New product from purchase invoice edit',
                    reference: `Invoice Edit: ${invoiceNumber}`,
                    notes: `New product created with initial quantity of ${newItem.quantity}`,
                    tenantId: tenantId,
                    productId: newProduct.id,
                    purchaseItemId: newItem.id
                  }
                });

                results.productsCreated++;
                results.logsCreated++;
                console.log(`   🆕 Created new product: ${newItem.name} (Qty: ${newItem.quantity})`);
              }
            }
            }
          } catch (itemError) {
            console.error(`   ❌ Error processing item ${newItem.name}:`, itemError);
            results.errors.push({
              item: newItem.name,
              error: itemError.message
            });
          }
        }
      }

      console.log(`✅ Purchase invoice edit inventory update completed: ${results.productsUpdated} updated, ${results.productsCreated} created, ${results.logsCreated} logs`);
      return results;

    } catch (error) {
      console.error('❌ Purchase invoice edit inventory update failed:', error);
      throw error;
    }
  }

  /**
   * Helper method to find a product for a purchase item
   * @param {string} tenantId - Tenant ID
   * @param {Object} purchaseItem - Purchase item object
   * @returns {Promise<Object|null>} - Product or null
   */
  static async findProductForItem(tenantId, purchaseItem) {
    // First try by productId if available
    if (purchaseItem.productId) {
      const product = await prisma.product.findFirst({
        where: {
          id: purchaseItem.productId,
          tenantId: tenantId
        }
      });
      if (product) return product;
    }

    // Then try by name (case-insensitive exact match)
    const product = await prisma.product.findFirst({
      where: {
        tenantId: tenantId,
        name: {
          equals: purchaseItem.name,
          mode: 'insensitive'
        }
      }
    });

    return product;
  }

  /**
   * Find variant for a purchase item when productVariantId is set (for variant-level inventory)
   * @param {string} tenantId - Tenant ID
   * @param {Object} purchaseItem - Purchase item with productVariantId
   * @returns {Promise<Object|null>} - ProductVariant with product, or null
   */
  static async findVariantForItem(tenantId, purchaseItem) {
    if (!purchaseItem.productVariantId) return null;
    const variant = await prisma.productVariant.findFirst({
      where: {
        id: purchaseItem.productVariantId,
        product: { tenantId: tenantId }
      },
      include: { product: true }
    });
    return variant;
  }

  /**
   * Restore a soft-deleted purchase invoice and reverse the inventory changes
   * @param {string} tenantId - Tenant ID
   * @param {string} invoiceId - Purchase invoice ID
   * @param {string} invoiceNumber - Invoice number for reference
   */
  static async restorePurchaseInvoice(tenantId, invoiceId, invoiceNumber) {
    console.log(`🔄 Restoring purchase invoice: ${invoiceNumber}`);
    
    const results = {
      inventoryRestored: 0,
      logsCreated: 0,
      purchaseItemsRestored: 0,
      errors: []
    };

    try {
      // Step 1: Get the soft-deleted invoice with all related data (including soft-deleted purchase items)
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: {
          id: invoiceId,
          tenantId: tenantId,
          isDeleted: true
        },
        include: {
          purchaseItems: {
            where: {
              isDeleted: true // Include soft-deleted purchase items
            }
          },
          returns: true
        }
      });

      if (!invoice) {
        throw new Error('Deleted purchase invoice not found');
      }

      // Step 2: Restore inventory changes for each purchase item
      for (const purchaseItem of invoice.purchaseItems) {
        try {
          // Find the product that was affected (case-insensitive exact match)
          const product = await prisma.product.findFirst({
            where: {
              tenantId: tenantId,
              name: {
                equals: purchaseItem.name,
                mode: 'insensitive'
              }
            }
          });

          if (product) {
            // Calculate new quantity after restoration
            const oldQuantity = product.currentQuantity;
            const newQuantity = oldQuantity + purchaseItem.quantity;
            
            // Update product quantity
            await prisma.product.update({
              where: { id: product.id },
              data: {
                currentQuantity: newQuantity,
                lastPurchasePrice: purchaseItem.purchasePrice,
                lastUpdated: new Date()
              }
            });

            // Create restoration product log
            await prisma.productLog.create({
              data: {
                action: 'INCREASE',
                quantity: purchaseItem.quantity,
                oldQuantity: oldQuantity,
                newQuantity: newQuantity,
                oldPrice: product.lastPurchasePrice,
                newPrice: purchaseItem.purchasePrice,
                reason: 'Purchase invoice restored - inventory restored',
                reference: `Invoice Restoration: ${invoiceNumber}`,
                notes: `Restored ${purchaseItem.quantity} units from restored purchase`,
                tenantId: tenantId,
                productId: product.id
              }
            });

            results.inventoryRestored++;
            results.logsCreated++;
            
            console.log(`   ✅ Restored inventory: ${purchaseItem.name} (${oldQuantity} → ${newQuantity})`);
          }
        } catch (error) {
          console.error(`   ❌ Error restoring inventory for ${purchaseItem.name}:`, error);
          results.errors.push(`Failed to restore inventory for ${purchaseItem.name}: ${error.message}`);
        }
      }

      // Step 3: Restore purchase items (mark as not deleted)
      const restoredItems = await prisma.purchaseItem.updateMany({
        where: {
          purchaseInvoiceId: invoiceId,
          isDeleted: true
        },
        data: {
          isDeleted: false,
          deletedAt: null
        }
      });
      
      results.purchaseItemsRestored = restoredItems.count;
      console.log(`   🔄 Restored ${restoredItems.count} purchase items`);

      // Step 4: Restore the invoice (mark as not deleted)
      await prisma.purchaseInvoice.update({
        where: { id: invoiceId },
        data: {
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          deleteReason: null
        }
      });

      console.log(`✅ Invoice restoration completed: ${invoiceNumber}`);
      console.log(`📊 Results:`, results);

      return results;

    } catch (error) {
      console.error('❌ Error restoring purchase invoice:', error);
      throw error;
    }
  }

  /**
   * Decrease inventory when purchase returns are processed
   * @param {string} tenantId - Tenant ID
   * @param {Array} returnItems - Array of return items (from ReturnItem model)
   * @param {string} purchaseInvoiceId - Purchase invoice ID
   * @param {string} invoiceNumber - Invoice number for reference
   */
  static async decreaseInventoryFromReturn(tenantId, returnItems, purchaseInvoiceId, invoiceNumber) {
    console.log(`🔄 Decreasing inventory for ${returnItems.length} return items from invoice ${invoiceNumber}`);
    
    const results = {
      productsUpdated: 0,
      logsCreated: 0,
      errors: []
    };

    try {
      for (const item of returnItems) {
        try {
          // Search for existing product by name (case-insensitive exact match)
          const existingProduct = await prisma.product.findFirst({
            where: {
              tenantId: tenantId,
              name: {
                equals: item.productName || item.name,
                mode: 'insensitive'
              }
            }
          });

          if (existingProduct) {
            // Update existing product - decrease quantity
            const oldQuantity = existingProduct.currentQuantity;
            const returnQuantity = item.quantity || 0;
            const newQuantity = Math.max(0, oldQuantity - returnQuantity);

            // Warn if insufficient stock but don't fail
            if (oldQuantity < returnQuantity) {
              console.warn(`   ⚠️  Insufficient stock for return: ${item.productName || item.name} (Available: ${oldQuantity}, Returning: ${returnQuantity})`);
            }

            await prisma.product.update({
              where: { id: existingProduct.id },
              data: {
                currentQuantity: newQuantity,
                lastUpdated: new Date()
              }
            });

            // Create product log for quantity decrease
            await prisma.productLog.create({
              data: {
                action: 'DECREASE',
                quantity: -returnQuantity,
                oldQuantity: oldQuantity,
                newQuantity: newQuantity,
                reason: 'Purchase return to supplier',
                reference: `Invoice: ${invoiceNumber}`,
                notes: `Quantity decreased by ${returnQuantity} due to purchase return`,
                tenantId: tenantId,
                productId: existingProduct.id
              }
            });

            results.productsUpdated++;
            results.logsCreated++;

            console.log(`   ✅ Decreased inventory for return: ${item.productName || item.name} (${oldQuantity} → ${newQuantity})`);

          } else {
            // Product not found - log warning but don't fail
            console.warn(`   ⚠️  Product not found for return: ${item.productName || item.name}`);
            results.errors.push({
              item: item.productName || item.name,
              error: 'Product not found in inventory'
            });
          }

        } catch (itemError) {
          console.error(`   ❌ Error processing return item ${item.productName || item.name}:`, itemError);
          results.errors.push({
            item: item.productName || item.name,
            error: itemError.message
          });
        }
      }

      console.log(`✅ Return inventory decrease completed: ${results.productsUpdated} updated, ${results.logsCreated} logs`);
      return results;

    } catch (error) {
      console.error('❌ Return inventory decrease failed:', error);
      throw error;
    }
  }

  /**
   * Update inventory when return items are edited in purchase invoice
   * @param {string} tenantId - Tenant ID
   * @param {Array} oldReturnItems - Array of old return items before update
   * @param {Array} newReturnItems - Array of new return items after update
   * @param {string} purchaseInvoiceId - Purchase invoice ID
   * @param {string} invoiceNumber - Invoice number for reference
   */
  static async updateInventoryFromReturnEdit(tenantId, oldReturnItems, newReturnItems, purchaseInvoiceId, invoiceNumber) {
    console.log(`🔄 Updating inventory for return items edit: ${invoiceNumber}`);
    console.log(`   Old return items count: ${oldReturnItems.length}`);
    console.log(`   New return items count: ${newReturnItems.length}`);
    
    const results = {
      productsUpdated: 0,
      logsCreated: 0,
      errors: []
    };

    try {
      // Create maps for easier lookup
      const oldItemsMap = new Map();
      oldReturnItems.forEach(item => {
        const key = (item.productName || item.name || '').toLowerCase();
        if (!oldItemsMap.has(key)) {
          oldItemsMap.set(key, []);
        }
        oldItemsMap.get(key).push(item);
      });

      const newItemsMap = new Map();
      newReturnItems.forEach(item => {
        const key = (item.productName || item.name || '').toLowerCase();
        if (!newItemsMap.has(key)) {
          newItemsMap.set(key, []);
        }
        newItemsMap.get(key).push(item);
      });

      // Process deleted return items (in old but not in new) - reverse the return (increase inventory)
      for (const [key, oldItems] of oldItemsMap.entries()) {
        const newItems = newItemsMap.get(key) || [];
        
        // If return item was deleted, reverse the inventory decrease (increase inventory)
        if (newItems.length === 0) {
          for (const oldItem of oldItems) {
            try {
              const product = await prisma.product.findFirst({
                where: {
                  tenantId: tenantId,
                  name: {
                    equals: oldItem.productName || oldItem.name,
                    mode: 'insensitive'
                  }
                }
              });
              
              if (product) {
                const oldQuantity = product.currentQuantity;
                const returnQuantity = oldItem.quantity || 0;
                const newQuantity = oldQuantity + returnQuantity; // Increase (reverse the return)
                
                await prisma.product.update({
                  where: { id: product.id },
                  data: {
                    currentQuantity: newQuantity,
                    lastUpdated: new Date()
                  }
                });

                await prisma.productLog.create({
                  data: {
                    action: 'INCREASE',
                    quantity: returnQuantity,
                    oldQuantity: oldQuantity,
                    newQuantity: newQuantity,
                    reason: 'Purchase return item deleted',
                    reference: `Invoice Edit: ${invoiceNumber}`,
                    notes: `Quantity increased by ${returnQuantity} due to return item deletion (reversing return)`,
                    tenantId: tenantId,
                    productId: product.id
                  }
                });

                results.productsUpdated++;
                results.logsCreated++;
                console.log(`   ✅ Reversed return (increased inventory) for deleted return item: ${oldItem.productName || oldItem.name} (${oldQuantity} → ${newQuantity})`);
              }
            } catch (itemError) {
              console.error(`   ❌ Error processing deleted return item ${oldItem.productName || oldItem.name}:`, itemError);
              results.errors.push({
                item: oldItem.productName || oldItem.name,
                error: itemError.message
              });
            }
          }
        }
      }

      // Process new return items (in new but not in old) and updated return items
      for (const [key, newItems] of newItemsMap.entries()) {
        const oldItems = oldItemsMap.get(key) || [];
        
        for (const newItem of newItems) {
          try {
            // Find matching old item by ID first (most reliable)
            let oldItem = null;
            if (newItem.id) {
              oldItem = oldReturnItems.find(item => item.id === newItem.id);
            }
            
            // If not found by ID, try to match from the same key group
            if (!oldItem && oldItems.length > 0) {
              oldItem = oldItems.find(item => 
                (item.productName || item.name || '').toLowerCase() === (newItem.productName || newItem.name || '').toLowerCase() &&
                Math.abs((item.purchasePrice || 0) - (newItem.purchasePrice || 0)) < 0.01
              );
            }

            const product = await prisma.product.findFirst({
              where: {
                tenantId: tenantId,
                name: {
                  equals: newItem.productName || newItem.name,
                  mode: 'insensitive'
                }
              }
            });

            if (!product) {
              console.warn(`   ⚠️  Product not found for return item: ${newItem.productName || newItem.name}`);
              results.errors.push({
                item: newItem.productName || newItem.name,
                error: 'Product not found in inventory'
              });
              continue;
            }

            if (!oldItem) {
              // New return item - decrease inventory
              const oldQuantity = product.currentQuantity;
              const returnQuantity = newItem.quantity || 0;
              const newQuantity = Math.max(0, oldQuantity - returnQuantity);

              await prisma.product.update({
                where: { id: product.id },
                data: {
                  currentQuantity: newQuantity,
                  lastUpdated: new Date()
                }
              });

              await prisma.productLog.create({
                data: {
                  action: 'DECREASE',
                  quantity: -returnQuantity,
                  oldQuantity: oldQuantity,
                  newQuantity: newQuantity,
                  reason: 'Purchase return item added',
                  reference: `Invoice Edit: ${invoiceNumber}`,
                  notes: `Quantity decreased by ${returnQuantity} due to new return item`,
                  tenantId: tenantId,
                  productId: product.id
                }
              });

              results.productsUpdated++;
              results.logsCreated++;
              console.log(`   ✅ Decreased inventory for new return item: ${newItem.productName || newItem.name} (${oldQuantity} → ${newQuantity})`);

            } else {
              // Return item was updated - check what changed
              const oldReturnQuantity = oldItem.quantity || 0;
              const newReturnQuantity = newItem.quantity || 0;
              const quantityDiff = newReturnQuantity - oldReturnQuantity;
              
              if (Math.abs(quantityDiff) > 0.01) {
                const oldQuantity = product.currentQuantity;
                let newQuantity;
                let action;
                let notes;

                if (quantityDiff > 0) {
                  // Return quantity increased - decrease inventory more
                  newQuantity = Math.max(0, oldQuantity - quantityDiff);
                  action = 'DECREASE';
                  notes = `Quantity decreased by ${quantityDiff} due to return quantity increase`;
                } else {
                  // Return quantity decreased - increase inventory (reverse part of return)
                  newQuantity = oldQuantity + Math.abs(quantityDiff);
                  action = 'INCREASE';
                  notes = `Quantity increased by ${Math.abs(quantityDiff)} due to return quantity decrease (reversing part of return)`;
                }

                await prisma.product.update({
                  where: { id: product.id },
                  data: {
                    currentQuantity: newQuantity,
                    lastUpdated: new Date()
                  }
                });

                await prisma.productLog.create({
                  data: {
                    action: action,
                    quantity: quantityDiff > 0 ? -quantityDiff : Math.abs(quantityDiff),
                    oldQuantity: oldQuantity,
                    newQuantity: newQuantity,
                    reason: 'Purchase return item quantity updated',
                    reference: `Invoice Edit: ${invoiceNumber}`,
                    notes: notes,
                    tenantId: tenantId,
                    productId: product.id
                  }
                });

                results.productsUpdated++;
                results.logsCreated++;
                console.log(`   ✅ Updated inventory for return item change: ${newItem.productName || newItem.name} (${oldQuantity} → ${newQuantity}, diff: ${quantityDiff > 0 ? '-' : '+'}${Math.abs(quantityDiff)})`);
              }
            }

          } catch (itemError) {
            console.error(`   ❌ Error processing return item ${newItem.productName || newItem.name}:`, itemError);
            results.errors.push({
              item: newItem.productName || newItem.name,
              error: itemError.message
            });
          }
        }
      }

      console.log(`✅ Return items edit inventory update completed: ${results.productsUpdated} updated, ${results.logsCreated} logs`);
      return results;

    } catch (error) {
      console.error('❌ Return items edit inventory update failed:', error);
      throw error;
    }
  }
}

module.exports = InventoryService;
