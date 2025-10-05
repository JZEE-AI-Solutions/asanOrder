import api from './api'

export const orderService = {
  // Get orders with filters
  getOrders: (params = {}) => api.get('/order', { params }),
  
  // Get single order
  getOrder: (id) => api.get(`/order/${id}`),
  
  // Get order statistics
  getOrderStats: () => api.get('/order/stats/dashboard'),
  
  // Confirm order
  confirmOrder: (id) => api.post(`/order/${id}/confirm`),
  
  // Cancel order
  cancelOrder: (id) => api.post(`/order/${id}/cancel`),
  
  // Update order status
  updateOrderStatus: (id, status) => api.put(`/order/${id}/status`, { status }),
  
  // Get order by form
  getOrdersByForm: (formId, params = {}) => api.get(`/order/form/${formId}`, { params })
}
