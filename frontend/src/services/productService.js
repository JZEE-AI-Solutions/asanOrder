import api from './api'

export const productService = {
  // Get products with filters
  getProducts: (params = {}) => api.get('/product', { params }),
  
  // Get single product
  getProduct: (id) => api.get(`/product/${id}`),
  
  // Create product
  createProduct: (data) => api.post('/product', data),
  
  // Update product
  updateProduct: (id, data) => api.put(`/product/${id}`, data),
  
  // Delete product
  deleteProduct: (id) => api.delete(`/product/${id}`),
  
  // Toggle product status
  toggleProductStatus: (id, isActive) => api.put(`/product/${id}`, { isActive }),
  
  // Get product statistics
  getProductStats: () => api.get('/product/stats'),
  
  // Upload product image
  uploadProductImage: (id, imageData) => api.post(`/product/${id}/image`, imageData),
  
  // Get product history
  getProductHistory: (id) => api.get(`/product/${id}/history`)
}
