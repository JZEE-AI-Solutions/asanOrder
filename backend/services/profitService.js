const prisma = require('../lib/db');

class ProfitService {
  /**
   * Parse JSON data safely
   * @param {any} data - Data to parse
   * @returns {Object|Array} Parsed data
   */
  parseJSON(data) {
    if (!data) return {};
    if (typeof data === 'object') return data;
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse JSON:', e);
      return {};
    }
  }

  /**
   * Calculate profit for a single order
   * @param {Object} order - Order object
   * @returns {Object} Profit details { totalRevenue, totalCost, profit, profitMargin }
   */
  async calculateOrderProfit(order) {
    try {
      const selectedProducts = this.parseJSON(order.selectedProducts) || [];
      const productQuantities = this.parseJSON(order.productQuantities) || {};
      const productPrices = this.parseJSON(order.productPrices) || {};

      let totalRevenue = 0;
      let totalCost = 0;

      // Get all product IDs
      const productIds = selectedProducts.map(p => p.id || p).filter(Boolean);
      
      // Fetch products with purchase prices
      const products = await prisma.product.findMany({
        where: {
          id: { in: productIds },
          tenantId: order.tenantId
        },
        select: {
          id: true,
          name: true,
          lastPurchasePrice: true,
          currentRetailPrice: true
        }
      });

      // Create a map for quick lookup
      const productMap = {};
      products.forEach(p => {
        productMap[p.id] = p;
      });

      // Calculate revenue and cost for each product
      selectedProducts.forEach(product => {
        const productId = product.id || product;
        const quantity = productQuantities[productId] || product.quantity || 1;
        const salePrice = productPrices[productId] || product.price || product.currentRetailPrice || 0;
        
        // Revenue = sale price * quantity
        const revenue = salePrice * quantity;
        totalRevenue += revenue;

        // Cost = purchase price * quantity (use lastPurchasePrice or 0 if not available)
        const productData = productMap[productId];
        const purchasePrice = productData?.lastPurchasePrice || 0;
        const cost = purchasePrice * quantity;
        totalCost += cost;
      });

      const profit = totalRevenue - totalCost;
      const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

      return {
        totalRevenue,
        totalCost,
        profit,
        profitMargin: parseFloat(profitMargin.toFixed(2)),
        items: selectedProducts.map(product => {
          const productId = product.id || product;
          const quantity = productQuantities[productId] || product.quantity || 1;
          const salePrice = productPrices[productId] || product.price || product.currentRetailPrice || 0;
          const productData = productMap[productId];
          const purchasePrice = productData?.lastPurchasePrice || 0;
          
          return {
            productId,
            productName: productData?.name || product.name || 'Unknown',
            quantity,
            salePrice,
            purchasePrice,
            revenue: salePrice * quantity,
            cost: purchasePrice * quantity,
            profit: (salePrice - purchasePrice) * quantity
          };
        })
      };
    } catch (error) {
      console.error('Error calculating order profit:', error);
      return {
        totalRevenue: 0,
        totalCost: 0,
        profit: 0,
        profitMargin: 0,
        items: []
      };
    }
  }

  /**
   * Calculate aggregate profit for multiple orders
   * @param {Array} orders - Array of order objects
   * @param {Object} filters - Optional filters { status, startDate, endDate }
   * @returns {Object} Aggregate profit details
   */
  async calculateAggregateProfit(orders, filters = {}) {
    try {
      let filteredOrders = orders;

      // Apply filters
      if (filters.status) {
        filteredOrders = filteredOrders.filter(o => o.status === filters.status);
      }
      if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        filteredOrders = filteredOrders.filter(o => new Date(o.createdAt) >= startDate);
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999); // End of day
        filteredOrders = filteredOrders.filter(o => new Date(o.createdAt) <= endDate);
      }

      // Only calculate for orders that are dispatched or completed (or confirmed if user wants)
      const validStatuses = ['CONFIRMED', 'DISPATCHED', 'COMPLETED'];
      filteredOrders = filteredOrders.filter(o => validStatuses.includes(o.status));

      let totalRevenue = 0;
      let totalCost = 0;
      let totalProfit = 0;
      const orderProfits = [];

      // Calculate profit for each order
      for (const order of filteredOrders) {
        const profitData = await this.calculateOrderProfit(order);
        totalRevenue += profitData.totalRevenue;
        totalCost += profitData.totalCost;
        totalProfit += profitData.profit;
        
        orderProfits.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          createdAt: order.createdAt,
          ...profitData
        });
      }

      const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      return {
        totalRevenue,
        totalCost,
        totalProfit,
        profitMargin: parseFloat(profitMargin.toFixed(2)),
        orderCount: filteredOrders.length,
        orders: orderProfits
      };
    } catch (error) {
      console.error('Error calculating aggregate profit:', error);
      return {
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        profitMargin: 0,
        orderCount: 0,
        orders: []
      };
    }
  }

  /**
   * Get profit statistics for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {Object} filters - Optional filters
   * @returns {Object} Profit statistics
   */
  async getProfitStatistics(tenantId, filters = {}) {
    try {
      const whereClause = {
        tenantId,
        status: { in: ['CONFIRMED', 'DISPATCHED', 'COMPLETED'] }
      };

      if (filters.startDate) {
        whereClause.createdAt = { gte: new Date(filters.startDate) };
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        whereClause.createdAt = {
          ...whereClause.createdAt,
          lte: endDate
        };
      }

      const orders = await prisma.order.findMany({
        where: whereClause,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          createdAt: true,
          selectedProducts: true,
          productQuantities: true,
          productPrices: true,
          tenantId: true
        }
      });

      return await this.calculateAggregateProfit(orders, filters);
    } catch (error) {
      console.error('Error getting profit statistics:', error);
      throw error;
    }
  }

  /**
   * Calculate profit for a purchase invoice
   * @param {string} invoiceId - Purchase Invoice ID
   * @param {string} tenantId - Tenant ID
   * @returns {Object} Profit details for the invoice
   */
  async calculatePurchaseInvoiceProfit(invoiceId, tenantId) {
    try {
      // Get purchase invoice with items
      const invoice = await prisma.purchaseInvoice.findFirst({
        where: {
          id: invoiceId,
          tenantId: tenantId
        },
        include: {
          purchaseItems: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  currentRetailPrice: true,
                  lastPurchasePrice: true
                }
              }
            }
          }
        }
      });

      if (!invoice) {
        return {
          totalCost: 0,
          totalRevenue: 0,
          totalProfit: 0,
          profitMargin: 0,
          items: []
        };
      }

      let totalCost = 0;
      let totalRevenue = 0;
      const itemProfits = [];

      // For each purchase item, find sales and calculate profit
      for (const purchaseItem of invoice.purchaseItems) {
        const itemCost = purchaseItem.purchasePrice * purchaseItem.quantity;
        totalCost += itemCost;

        // Get all purchase invoices for this product, ordered by date (FIFO)
        const invoiceDate = new Date(invoice.invoiceDate);
        
        const allInvoicesForProduct = await prisma.purchaseInvoice.findMany({
          where: {
            tenantId: tenantId,
            isDeleted: false,
            purchaseItems: {
              some: {
                productId: purchaseItem.productId
              }
            }
          },
          include: {
            purchaseItems: {
              where: {
                productId: purchaseItem.productId
              }
            }
          },
          orderBy: {
            invoiceDate: 'asc' // Oldest first for FIFO
          }
        });

        // Find all orders that contain this product (we'll allocate using FIFO)
        const orders = await prisma.order.findMany({
          where: {
            tenantId: tenantId,
            status: { in: ['CONFIRMED', 'DISPATCHED', 'COMPLETED'] },
            selectedProducts: {
              contains: purchaseItem.productId || ''
            }
          },
          select: {
            id: true,
            createdAt: true,
            selectedProducts: true,
            productQuantities: true,
            productPrices: true
          },
          orderBy: {
            createdAt: 'asc' // Process orders chronologically for FIFO
          }
        });

        // Calculate total quantity from invoices created BEFORE this invoice (FIFO priority)
        let previousInvoiceQuantity = 0;
        for (const prevInvoice of allInvoicesForProduct) {
          if (new Date(prevInvoice.invoiceDate) < invoiceDate) {
            for (const prevItem of prevInvoice.purchaseItems) {
              if (prevItem.productId === purchaseItem.productId) {
                previousInvoiceQuantity += prevItem.quantity;
              }
            }
          }
        }

        let itemRevenue = 0;
        let soldQuantity = 0;
        let remainingFromPrevious = previousInvoiceQuantity;

        // Calculate revenue from sales of this product using FIFO logic
        // Process all orders chronologically and allocate to invoices in order
        for (const order of orders) {
          const selectedProducts = this.parseJSON(order.selectedProducts) || [];
          const productQuantities = this.parseJSON(order.productQuantities) || {};
          const productPrices = this.parseJSON(order.productPrices) || {};

          const productInOrder = selectedProducts.find(p => (p.id || p) === purchaseItem.productId);
          if (productInOrder) {
            const orderQuantity = productQuantities[purchaseItem.productId] || productInOrder.quantity || 1;
            const salePrice = productPrices[purchaseItem.productId] || productInOrder.price || purchaseItem.product?.currentRetailPrice || 0;
            
            // FIFO: First allocate to previous invoices (older stock), then to this invoice
            let quantityFromThisInvoice = 0;
            
            if (remainingFromPrevious > 0) {
              // First, allocate to previous invoices (older stock gets sold first)
              const allocatedToPrevious = Math.min(orderQuantity, remainingFromPrevious);
              remainingFromPrevious -= allocatedToPrevious;
              
              // Remaining quantity can come from this invoice (only after older stock is exhausted)
              const remainingQuantity = orderQuantity - allocatedToPrevious;
              quantityFromThisInvoice = Math.min(remainingQuantity, purchaseItem.quantity - soldQuantity);
            } else {
              // No previous stock remaining, all comes from this invoice
              quantityFromThisInvoice = Math.min(orderQuantity, purchaseItem.quantity - soldQuantity);
            }
            
            if (quantityFromThisInvoice > 0) {
              itemRevenue += salePrice * quantityFromThisInvoice;
              soldQuantity += quantityFromThisInvoice;
            }
          }
        }

        totalRevenue += itemRevenue;

        // Only calculate profit for items that have been sold
        // If nothing is sold, profit is 0 (not negative, as there's no transaction yet)
        const soldItemsCost = soldQuantity > 0 ? (purchaseItem.purchasePrice * soldQuantity) : 0;
        const itemProfit = itemRevenue - soldItemsCost;
        const itemProfitMargin = itemRevenue > 0 ? (itemProfit / itemRevenue) * 100 : 0;

        itemProfits.push({
          purchaseItemId: purchaseItem.id,
          productId: purchaseItem.productId,
          productName: purchaseItem.name,
          purchasePrice: purchaseItem.purchasePrice,
          quantity: purchaseItem.quantity,
          soldQuantity: soldQuantity,
          cost: itemCost, // Total cost of all purchased items (for reference)
          soldItemsCost: soldItemsCost, // Cost of only sold items
          revenue: itemRevenue,
          profit: itemProfit, // Profit only on sold items (0 if nothing sold)
          profitMargin: parseFloat(itemProfitMargin.toFixed(2))
        });
      }

      // Calculate profit only on sold items
      // Total cost should only include cost of sold items, not all purchased items
      let totalSoldItemsCost = 0;
      itemProfits.forEach(item => {
        if (item.soldQuantity > 0) {
          totalSoldItemsCost += item.purchasePrice * item.soldQuantity;
        }
      });

      const totalProfit = totalRevenue - totalSoldItemsCost;
      const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      // Debug logging
      console.log('Purchase Invoice Profit Calculation:', {
        invoiceNumber: invoice.invoiceNumber,
        totalCost: totalCost,
        totalSoldItemsCost: totalSoldItemsCost,
        totalRevenue: totalRevenue,
        totalProfit: totalProfit,
        profitMargin: profitMargin
      });

      return {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        totalCost, // Total cost of all purchased items (for reference)
        totalSoldItemsCost: totalSoldItemsCost, // Cost of only sold items
        totalRevenue,
        totalProfit,
        profitMargin: parseFloat(profitMargin.toFixed(2)),
        items: itemProfits
      };
    } catch (error) {
      console.error('Error calculating purchase invoice profit:', error);
      return {
        totalCost: 0,
        totalRevenue: 0,
        totalProfit: 0,
        profitMargin: 0,
        items: []
      };
    }
  }

  /**
   * Get profit statistics for all purchase invoices
   * @param {string} tenantId - Tenant ID
   * @param {Object} filters - Optional filters
   * @returns {Object} Aggregate profit for all invoices
   */
  async getPurchaseInvoicesProfit(tenantId, filters = {}) {
    try {
      const whereClause = {
        tenantId,
        isDeleted: false
      };

      if (filters.startDate) {
        whereClause.invoiceDate = { gte: new Date(filters.startDate) };
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        whereClause.invoiceDate = {
          ...whereClause.invoiceDate,
          lte: endDate
        };
      }

      const invoices = await prisma.purchaseInvoice.findMany({
        where: whereClause,
        select: {
          id: true
        }
      });

      let totalCost = 0;
      let totalRevenue = 0;
      const invoiceProfits = [];

      for (const invoice of invoices) {
        const profit = await this.calculatePurchaseInvoiceProfit(invoice.id, tenantId);
        totalCost += profit.totalCost;
        totalRevenue += profit.totalRevenue;
        invoiceProfits.push(profit);
      }

      const totalProfit = totalRevenue - totalCost;
      const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      return {
        totalCost,
        totalRevenue,
        totalProfit,
        profitMargin: parseFloat(profitMargin.toFixed(2)),
        invoiceCount: invoices.length,
        invoices: invoiceProfits
      };
    } catch (error) {
      console.error('Error getting purchase invoices profit:', error);
      throw error;
    }
  }
}

module.exports = new ProfitService();

