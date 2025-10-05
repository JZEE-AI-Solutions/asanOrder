import api from './api'

export const customerService = {
  // Get customers with filters
  getCustomers: (params = {}) => api.get('/customer', { params }),
  
  // Get single customer
  getCustomer: (id) => api.get(`/customer/${id}`),
  
  // Create customer
  createCustomer: (data) => api.post('/customer', data),
  
  // Update customer
  updateCustomer: (id, data) => api.put(`/customer/${id}`, data),
  
  // Delete customer
  deleteCustomer: (id) => api.delete(`/customer/${id}`),
  
  // Get customer statistics
  getCustomerStats: () => api.get('/customer/stats/overview'),
  
  // Get customer orders
  getCustomerOrders: (id, params = {}) => api.get(`/customer/${id}/orders`, { params }),
  
  // Search customers
  searchCustomers: (query, params = {}) => api.get('/customer/search', { 
    params: { q: query, ...params } 
  })
}
