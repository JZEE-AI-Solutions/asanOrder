import api from './api'

export const tenantService = {
  // Get current tenant data
  getCurrentTenant: () => api.get('/tenant/owner/me'),
  
  // Update tenant data
  updateTenant: (data) => api.put('/tenant/owner/me', data),
  
  // Get tenant statistics
  getTenantStats: () => api.get('/tenant/owner/me/stats'),
  
  // Get tenant forms
  getTenantForms: () => api.get('/form'),
  
  // Get tenant orders
  getTenantOrders: (params = {}) => api.get('/order', { params }),
  
  // Get tenant products
  getTenantProducts: (params = {}) => api.get('/product', { params }),
  
  // Get tenant customers
  getTenantCustomers: (params = {}) => api.get('/customer', { params })
}
