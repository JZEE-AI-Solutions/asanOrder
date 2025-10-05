import api from './api'

export const formService = {
  // Get forms
  getForms: (params = {}) => api.get('/form', { params }),
  
  // Get single form
  getForm: (id) => api.get(`/form/${id}`),
  
  // Create form
  createForm: (data) => api.post('/form', data),
  
  // Update form
  updateForm: (id, data) => api.put(`/form/${id}`, data),
  
  // Delete form
  deleteForm: (id) => api.delete(`/form/${id}`),
  
  // Publish form
  publishForm: (id) => api.post(`/form/${id}/publish`),
  
  // Unpublish form
  unpublishForm: (id) => api.post(`/form/${id}/unpublish`),
  
  // Get form statistics
  getFormStats: () => api.get('/form/stats'),
  
  // Get form by link
  getFormByLink: (formLink) => api.get(`/form/link/${formLink}`),
  
  // Update form products
  updateFormProducts: (id, products) => api.put(`/form/${id}/products`, { products })
}
