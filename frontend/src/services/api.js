import axios from 'axios'
import toast from 'react-hot-toast'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token')
      delete api.defaults.headers.common['Authorization']
      window.location.href = '/login'
    }
    
    // Show error toast for non-401 errors
    if (error.response?.status !== 401) {
      const errorData = error.response?.data?.error
      const message = typeof errorData === 'string'
        ? errorData
        : errorData?.message || error.response?.data?.message || 'Something went wrong'
      toast.error(message)
    }
    
    return Promise.reject(error)
  }
)

// Helper function to get the correct image URL with cache-busting
export const getImageUrl = (entityType, entityId, bustCache = false) => {
  const baseUrl = import.meta.env.VITE_API_URL || ''
  const url = `${baseUrl}/api/images/public/${entityType}/${entityId}`
  
  // Add cache-busting parameter if requested
  if (bustCache) {
    return `${url}?t=${Date.now()}`
  }
  
  return url
}

export default api