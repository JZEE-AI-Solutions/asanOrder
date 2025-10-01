const prisma = require('../lib/db');

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
      name: ['name', 'fullName', 'customerName', 'clientName'],
      email: ['email', 'emailAddress'],
      address: ['address', 'shippingAddress', 'billingAddress', 'streetAddress'],
      city: ['city'],
      state: ['state', 'province'],
      country: ['country'],
      postalCode: ['postalCode', 'zipCode', 'postcode'],
      notes: ['notes', 'comments', 'specialInstructions']
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
   * Get all customers for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {Object} options - Query options
   * @returns {Array} List of customers
   */
  async getCustomersByTenant(tenantId, options = {}) {
    try {
      const { page = 1, limit = 20, search = '', sortBy = 'lastOrderDate', sortOrder = 'desc' } = options;
      
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

      const total = await prisma.customer.count({ where });

      return {
        customers,
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
      const stats = await prisma.customer.aggregate({
        where: { tenantId: tenantId },
        _count: { id: true },
        _sum: { totalSpent: true },
        _avg: { totalSpent: true }
      });

      const recentCustomers = await prisma.customer.count({
        where: {
          tenantId: tenantId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        }
      });

      return {
        totalCustomers: stats._count.id,
        totalRevenue: stats._sum.totalSpent || 0,
        averageOrderValue: stats._avg.totalSpent || 0,
        newCustomersLast30Days: recentCustomers
      };
    } catch (error) {
      console.error('Error getting customer stats:', error);
      throw error;
    }
  }
}

module.exports = new CustomerService();
