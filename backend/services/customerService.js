const prisma = require('../lib/db');
const balanceService = require('./balanceService');

class CustomerService {
  /**
   * Find or create customer by phone number
   * @param {string} phoneNumber - Customer's phone number
   * @param {string} tenantId - Tenant ID
   * @param {Object} orderData - Order data to extract customer info
   * @returns {Object} Customer object
   */
  async findOrCreateCustomer(phoneNumber, tenantId, orderData = {}) {
    try {
      console.log(`Looking for customer with phone: ${phoneNumber} in tenant: ${tenantId}`);
      
      // First, try to find existing customer
      let customer = await prisma.customer.findFirst({
        where: {
          phoneNumber: phoneNumber,
          tenantId: tenantId
        }
      });

      if (customer) {
        console.log(`Found existing customer: ${customer.id}`);
        // Customer exists, update their information and log the order
        customer = await this.updateCustomerFromOrder(customer.id, orderData);
        await this.logCustomerAction(customer.id, 'ORDER_PLACED', null, null, 'Customer placed a new order');
        console.log(`Updated customer: ${customer.id}`);
        return customer;
      } else {
        console.log(`Creating new customer for phone: ${phoneNumber}`);
        // Customer doesn't exist, create new one
        customer = await this.createCustomerFromOrder(phoneNumber, tenantId, orderData);
        await this.logCustomerAction(customer.id, 'CREATED', null, null, 'New customer created from order');
        console.log(`Created new customer: ${customer.id}`);
        return customer;
      }
    } catch (error) {
      console.error('Error in findOrCreateCustomer:', error);
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
      throw error;
    }
  }

  /**
   * Create new customer from order data
   * @param {string} phoneNumber - Customer's phone number
   * @param {string} tenantId - Tenant ID
   * @param {Object} orderData - Order data containing customer info
   * @returns {Object} Created customer
   */
  async createCustomerFromOrder(phoneNumber, tenantId, orderData) {
    try {
      // Handle formData - it might be a string or already parsed
      let formData = {};
      if (orderData.formData) {
        if (typeof orderData.formData === 'string') {
          formData = JSON.parse(orderData.formData);
        } else {
          formData = orderData.formData;
        }
      }
      
      // Extract customer information from form data
      const customerData = this.extractCustomerInfoFromFormData(formData);
      console.log('Extracted customer data:', customerData);
      
      const customer = await prisma.customer.create({
        data: {
          phoneNumber: phoneNumber,
          name: customerData.name || null,
          email: customerData.email || null,
          address: customerData.address || null,
          shippingAddress: customerData.shippingAddress || null,
          city: customerData.city || null,
          state: customerData.state || null,
          country: customerData.country || null,
          postalCode: customerData.postalCode || null,
          notes: customerData.notes || null,
          tenantId: tenantId,
          totalOrders: 1,
          totalSpent: orderData.paymentAmount || 0,
          lastOrderDate: new Date()
        }
      });

      return customer;
    } catch (error) {
      console.error('Error creating customer from order:', error);
      throw error;
    }
  }

  /**
   * Update existing customer from order data
   * @param {string} customerId - Customer ID
   * @param {Object} orderData - Order data containing customer info
   * @returns {Object} Updated customer
   */
  async updateCustomerFromOrder(customerId, orderData) {
    try {
      // Handle formData - it might be a string or already parsed
      let formData = {};
      if (orderData.formData) {
        if (typeof orderData.formData === 'string') {
          formData = JSON.parse(orderData.formData);
        } else {
          formData = orderData.formData;
        }
      }
      const customerData = this.extractCustomerInfoFromFormData(formData);
      
      // Get current customer data for comparison
      const currentCustomer = await prisma.customer.findUnique({
        where: { id: customerId }
      });

      if (!currentCustomer) {
        throw new Error('Customer not found');
      }

      // Prepare update data
      const updateData = {};
      const changes = [];

      // Check each field for changes
      if (customerData.name && customerData.name !== currentCustomer.name) {
        updateData.name = customerData.name;
        changes.push({ field: 'name', old: currentCustomer.name, new: customerData.name });
      }
      if (customerData.email && customerData.email !== currentCustomer.email) {
        updateData.email = customerData.email;
        changes.push({ field: 'email', old: currentCustomer.email, new: customerData.email });
      }
      if (customerData.address && customerData.address !== currentCustomer.address) {
        updateData.address = customerData.address;
        changes.push({ field: 'address', old: currentCustomer.address, new: customerData.address });
      }
      if (customerData.shippingAddress && customerData.shippingAddress !== currentCustomer.shippingAddress) {
        updateData.shippingAddress = customerData.shippingAddress;
        changes.push({ field: 'shippingAddress', old: currentCustomer.shippingAddress, new: customerData.shippingAddress });
      }
      if (customerData.city && customerData.city !== currentCustomer.city) {
        updateData.city = customerData.city;
        changes.push({ field: 'city', old: currentCustomer.city, new: customerData.city });
      }
      if (customerData.state && customerData.state !== currentCustomer.state) {
        updateData.state = customerData.state;
        changes.push({ field: 'state', old: currentCustomer.state, new: customerData.state });
      }
      if (customerData.country && customerData.country !== currentCustomer.country) {
        updateData.country = customerData.country;
        changes.push({ field: 'country', old: currentCustomer.country, new: customerData.country });
      }
      if (customerData.postalCode && customerData.postalCode !== currentCustomer.postalCode) {
        updateData.postalCode = customerData.postalCode;
        changes.push({ field: 'postalCode', old: currentCustomer.postalCode, new: customerData.postalCode });
      }

      // Always update order statistics
      updateData.totalOrders = currentCustomer.totalOrders + 1;
      updateData.totalSpent = currentCustomer.totalSpent + (orderData.paymentAmount || 0);
      updateData.lastOrderDate = new Date();

      // Update customer
      const updatedCustomer = await prisma.customer.update({
        where: { id: customerId },
        data: updateData
      });

      // Log changes
      for (const change of changes) {
        await this.logCustomerAction(
          customerId, 
          'INFO_CHANGED', 
          change.field, 
          change.old, 
          change.new,
          `Customer ${change.field} updated from "${change.old}" to "${change.new}"`
        );
      }

      return updatedCustomer;
    } catch (error) {
      console.error('Error updating customer from order:', error);
      throw error;
    }
  }

  /**
   * Extract customer information from form data
   * @param {Object} formData - Parsed form data
   * @returns {Object} Extracted customer information
   */
  extractCustomerInfoFromFormData(formData) {
    const customerInfo = {};
    
    // Common field mappings
    const fieldMappings = {
      name: ['Customer Name', 'name', 'fullName', 'customerName', 'clientName'],
      email: ['Email', 'email', 'emailAddress'],
      address: ['Address', 'address', 'billingAddress', 'streetAddress'],
      shippingAddress: ['Shipping Address', 'shippingAddress', 'shipping', 'deliveryAddress', 'delivery'],
      city: ['City', 'city'],
      state: ['State', 'state', 'province'],
      country: ['Country', 'country'],
      postalCode: ['Postal Code', 'Zip Code', 'postalCode', 'zipCode', 'postcode'],
      notes: ['Notes', 'notes', 'comments', 'specialInstructions']
    };

    // Extract information based on field mappings
    for (const [key, possibleFields] of Object.entries(fieldMappings)) {
      for (const field of possibleFields) {
        if (formData[field] && formData[field].trim()) {
          customerInfo[key] = formData[field].trim();
          break;
        }
      }
    }

    return customerInfo;
  }

  /**
   * Log customer action
   * @param {string} customerId - Customer ID
   * @param {string} action - Action type
   * @param {string} fieldName - Field name (if applicable)
   * @param {string} oldValue - Old value (if applicable)
   * @param {string} newValue - New value (if applicable)
   * @param {string} description - Human-readable description
   * @param {Object} metadata - Additional metadata
   */
  async logCustomerAction(customerId, action, fieldName = null, oldValue = null, newValue = null, description = null, metadata = null) {
    try {
      await prisma.customerLog.create({
        data: {
          customerId: customerId,
          action: action,
          fieldName: fieldName,
          oldValue: oldValue,
          newValue: newValue,
          description: description,
          metadata: metadata ? JSON.stringify(metadata) : null
        }
      });
    } catch (error) {
      console.error('Error logging customer action:', error);
      // Don't throw error for logging failures
    }
  }

  /**
   * Get customer by ID
   * @param {string} customerId - Customer ID
   * @param {string} tenantId - Tenant ID
   * @returns {Object} Customer with logs
   */
  async getCustomerById(customerId, tenantId) {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          tenantId: tenantId
        },
        include: {
          orders: {
            orderBy: { createdAt: 'desc' },
            take: 10
          },
          customerLogs: {
            orderBy: { createdAt: 'desc' },
            take: 20
          }
        }
      });

      return customer;
    } catch (error) {
      console.error('Error getting customer by ID:', error);
      throw error;
    }
  }

  /**
   * Calculate pending payment for a customer.
   * Matches balanceService / customer detail: CONFIRMED, DISPATCHED, COMPLETED orders;
   * paid amount = sum of Payment records (CUSTOMER_PAYMENT) per order, not order.verifiedPaymentAmount.
   * @param {string} customerId - Customer ID
   * @returns {number} Total pending payment amount
   */
  async calculatePendingPayment(customerId) {
    try {
      const orders = await prisma.order.findMany({
        where: {
          customerId: customerId,
          status: { in: ['CONFIRMED', 'DISPATCHED', 'COMPLETED'] }
        },
        select: {
          id: true,
          selectedProducts: true,
          productQuantities: true,
          productPrices: true,
          paymentAmount: true,
          verifiedPaymentAmount: true,
          paymentVerified: true,
          shippingCharges: true,
          codFee: true,
          codFeePaidBy: true,
          refundAmount: true,
          orderItems: { select: { quantity: true, price: true } }
        }
      });

      const paymentsByOrder = await prisma.payment
        .findMany({
          where: {
            customerId: customerId,
            type: 'CUSTOMER_PAYMENT',
            orderId: { not: null }
          },
          select: { orderId: true, amount: true }
        })
        .then((payments) => {
          const byOrder = {};
          for (const p of payments) {
            byOrder[p.orderId] = (byOrder[p.orderId] || 0) + (p.amount || 0);
          }
          return byOrder;
        });

      let totalPending = 0;

      for (const order of orders) {
        let orderTotal = 0;
        if (order.orderItems && order.orderItems.length > 0) {
          orderTotal = order.orderItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0), 0);
        } else {
          let selectedProducts = [];
          let productQuantities = {};
          let productPrices = {};
          try {
            selectedProducts = typeof order.selectedProducts === 'string'
              ? JSON.parse(order.selectedProducts)
              : (order.selectedProducts || []);
            productQuantities = typeof order.productQuantities === 'string'
              ? JSON.parse(order.productQuantities)
              : (order.productQuantities || {});
            productPrices = typeof order.productPrices === 'string'
              ? JSON.parse(order.productPrices)
              : (order.productPrices || {});
          } catch (e) {
            console.error('Error parsing order data:', e);
            continue;
          }
          if (Array.isArray(selectedProducts)) {
            selectedProducts.forEach(product => {
              const quantity = productQuantities[product.id] || product.quantity || 1;
              const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
              orderTotal += price * quantity;
            });
          }
        }

        const shippingCharges = order.shippingCharges || 0;
        if (order.codFeePaidBy === 'CUSTOMER' && order.codFee && order.codFee > 0) {
          orderTotal += order.codFee;
        }
        orderTotal += shippingCharges;

        const paidAmount = paymentsByOrder[order.id] || 0;
        const refundAmount = order.refundAmount || 0;
        const pending = Math.max(0, orderTotal - paidAmount - refundAmount);
        if (pending > 0) {
          totalPending += pending;
        }
      }

      return totalPending;
    } catch (error) {
      console.error('Error calculating pending payment:', error);
      return 0;
    }
  }

  /**
   * Get all customers for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {Object} options - Query options
   * @returns {Array} List of customers
   */
  async getCustomersByTenant(tenantId, options = {}) {
    try {
      const { page = 1, limit = 20, search = '', sortBy = 'lastOrderDate', sortOrder = 'desc', hasPendingPayment = false } = options;
      
      const where = {
        tenantId: tenantId,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phoneNumber: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } }
          ]
        })
      };

      const customers = await prisma.customer.findMany({
        where: where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          orders: {
            orderBy: { createdAt: 'desc' },
            take: 5
          },
          _count: {
            select: {
              orders: true,
              customerLogs: true
            }
          }
        }
      });

      // Get closing balance (ledger net balance) and totalPending for each customer
      const customersWithBalance = await Promise.all(
        customers.map(async (customer) => {
          let pendingPayment = 0;
          let closingBalance = 0;
          try {
            const balance = await balanceService.calculateCustomerBalance(customer.id);
            pendingPayment = balance.totalPending || 0;
            closingBalance = balance.netBalance ?? 0;
          } catch (e) {
            console.error(`Error calculating balance for customer ${customer.id}:`, e);
          }
          return {
            ...customer,
            pendingPayment,
            closingBalance
          };
        })
      );

      // Filter by pending payment if requested
      const filteredCustomers = hasPendingPayment
        ? customersWithBalance.filter(c => c.pendingPayment > 0)
        : customersWithBalance;

      // Recalculate total count if filtering
      let total;
      if (hasPendingPayment) {
        const allCustomers = await prisma.customer.findMany({
          where: where,
          select: { id: true }
        });
        const customersWithPendingCheck = await Promise.all(
          allCustomers.map(async (c) => {
            try {
              const balance = await balanceService.calculateCustomerBalance(c.id);
              return { id: c.id, pendingPayment: balance.totalPending || 0 };
            } catch (e) {
              return { id: c.id, pendingPayment: 0 };
            }
          })
        );
        total = customersWithPendingCheck.filter(c => c.pendingPayment > 0).length;
      } else {
        total = await prisma.customer.count({ where });
      }

      return {
        customers: filteredCustomers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error getting customers by tenant:', error);
      throw error;
    }
  }

  /**
   * Update customer manually
   * @param {string} customerId - Customer ID
   * @param {string} tenantId - Tenant ID
   * @param {Object} updateData - Data to update
   * @returns {Object} Updated customer
   */
  async updateCustomer(customerId, tenantId, updateData) {
    try {
      // Get current customer data
      const currentCustomer = await prisma.customer.findFirst({
        where: { id: customerId, tenantId: tenantId }
      });

      if (!currentCustomer) {
        throw new Error('Customer not found');
      }

      // Track changes
      const changes = [];
      for (const [key, value] of Object.entries(updateData)) {
        if (currentCustomer[key] !== value) {
          changes.push({
            field: key,
            old: currentCustomer[key],
            new: value
          });
        }
      }

      // Update customer
      const updatedCustomer = await prisma.customer.update({
        where: { id: customerId },
        data: updateData
      });

      // Log changes
      for (const change of changes) {
        await this.logCustomerAction(
          customerId,
          'UPDATED',
          change.field,
          change.old,
          change.new,
          `Customer ${change.field} updated from "${change.old}" to "${change.new}"`
        );
      }

      return updatedCustomer;
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  }

  /**
   * Get customer statistics
   * @param {string} tenantId - Tenant ID
   * @returns {Object} Customer statistics
   */
  async getCustomerStats(tenantId) {
    try {
      // Get customer count
      const totalCustomers = await prisma.customer.count({
        where: { tenantId: tenantId }
      });

      // Get recent customers count
      const recentCustomers = await prisma.customer.count({
        where: {
          tenantId: tenantId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        }
      });

      // Calculate total revenue from actual orders (not stored totalSpent field)
      // This ensures accuracy and consistency with other stats endpoints
      const orders = await prisma.order.findMany({
        where: {
          tenantId: tenantId,
          status: { in: ['CONFIRMED', 'DISPATCHED', 'COMPLETED'] }
        },
        select: {
          selectedProducts: true,
          productQuantities: true,
          productPrices: true,
          shippingCharges: true,
          codFee: true,
          codFeePaidBy: true
        }
      });

      let totalRevenue = 0;
      let orderCount = 0;

      for (const order of orders) {
        try {
          // Parse order data
          let selectedProducts = [];
          let productQuantities = {};
          let productPrices = {};

          selectedProducts = typeof order.selectedProducts === 'string' 
            ? JSON.parse(order.selectedProducts) 
            : (order.selectedProducts || []);
          productQuantities = typeof order.productQuantities === 'string'
            ? JSON.parse(order.productQuantities)
            : (order.productQuantities || {});
          productPrices = typeof order.productPrices === 'string'
            ? JSON.parse(order.productPrices)
            : (order.productPrices || {});

          // Calculate order total (products + shipping + COD fee if customer pays)
          let orderTotal = 0;
          if (Array.isArray(selectedProducts)) {
            selectedProducts.forEach(product => {
              const quantity = productQuantities[product.id] || product.quantity || 1;
              const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
              orderTotal += price * quantity;
            });
          }
          
          // Add shipping charges
          const shippingCharges = order.shippingCharges || 0;
          orderTotal += shippingCharges;
          
          // Add COD fee if customer pays
          if (order.codFeePaidBy === 'CUSTOMER' && order.codFee && order.codFee > 0) {
            orderTotal += order.codFee;
          }

          totalRevenue += orderTotal;
          orderCount++;
        } catch (e) {
          console.error('Error calculating order total for customer stats:', e);
          // Continue with next order
        }
      }

      const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

      return {
        totalCustomers,
        totalRevenue,
        averageOrderValue,
        newCustomersLast30Days: recentCustomers
      };
    } catch (error) {
      console.error('Error getting customer stats:', error);
      throw error;
    }
  }

  /**
   * Recalculate customer statistics from actual linked orders
   * @param {string} customerId - Customer ID
   * @returns {Object} Updated customer with recalculated stats
   */
  async recalculateCustomerStats(customerId) {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        include: {
          orders: {
            select: {
              paymentAmount: true,
              shippingCharges: true,
              createdAt: true
            }
          }
        }
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Recalculate based on actual linked orders
      const actualTotalOrders = customer.orders.length;
      const actualTotalSpent = customer.orders.reduce((sum, order) => {
        return sum + (order.paymentAmount || 0) + (order.shippingCharges || 0);
      }, 0);
      const lastOrderDate = customer.orders.length > 0 
        ? customer.orders.sort((a, b) => b.createdAt - a.createdAt)[0].createdAt
        : null;

      // Update customer record
      const updatedCustomer = await prisma.customer.update({
        where: { id: customerId },
        data: {
          totalOrders: actualTotalOrders,
          totalSpent: actualTotalSpent,
          lastOrderDate: lastOrderDate
        }
      });

      console.log(`✅ Recalculated stats for customer ${customerId}: ${actualTotalOrders} orders, Rs. ${actualTotalSpent} spent`);

      return updatedCustomer;
    } catch (error) {
      console.error('Error recalculating customer stats:', error);
      throw error;
    }
  }
}

module.exports = new CustomerService();
