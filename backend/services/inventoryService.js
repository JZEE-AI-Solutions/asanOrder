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
          // Search for existing product by name (case-insensitive using contains)
          const existingProduct = await prisma.product.findFirst({
            where: {
              tenantId: tenantId,
              name: {
                contains: item.name
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

            // Find the purchase item to link to the log
            const purchaseItem = await prisma.purchaseItem.findFirst({
              where: {
                tenantId: tenantId,
                purchaseInvoiceId: purchaseInvoiceId,
                name: item.name,
                purchasePrice: item.purchasePrice,
                quantity: item.quantity
              }
            });

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
            const newProduct = await prisma.product.create({
              data: {
                name: item.name,
                description: item.description,
                category: item.category,
                sku: item.sku,
                currentQuantity: item.quantity,
                lastPurchasePrice: item.purchasePrice,
                currentRetailPrice: item.purchasePrice * 1.5, // Default 50% markup
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

            // Find the purchase item to link to the log
            const purchaseItem = await prisma.purchaseItem.findFirst({
              where: {
                tenantId: tenantId,
                purchaseInvoiceId: purchaseInvoiceId,
                name: item.name,
                purchasePrice: item.purchasePrice,
                quantity: item.quantity
              }
            });

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
   * Update inventory when a return is processed
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
          // Find the product
          const product = await prisma.product.findFirst({
            where: {
              tenantId: tenantId,
              name: {
                contains: item.productName
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
          // Find the product that was affected
          const product = await prisma.product.findFirst({
            where: {
              tenantId: tenantId,
              name: {
                contains: purchaseItem.name
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
          // Find the product that was affected
          const product = await prisma.product.findFirst({
            where: {
              tenantId: tenantId,
              name: {
                contains: purchaseItem.name
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
}

module.exports = InventoryService;
