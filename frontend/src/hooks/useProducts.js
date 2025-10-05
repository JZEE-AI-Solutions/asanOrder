import { useState, useCallback } from 'react'
import { useApi, useMutation, usePaginatedApi } from './useApi'
import api from '../services/api'

/**
 * Hook for managing products
 * @param {Object} options - Configuration options
 * @returns {Object} - { products, loading, error, refreshProducts, createProduct, updateProduct, deleteProduct }
 */
export const useProducts = (options = {}) => {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchProducts = useCallback(async (params = {}) => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/product', { params })
      setProducts(response.data.products)
      return response.data
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to fetch products'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshProducts = useCallback(() => {
    return fetchProducts(options)
  }, [fetchProducts, options])

  const createProduct = useMutation(
    (productData) => api.post('/product', productData),
    {
      successMessage: 'Product created successfully!',
      onSuccess: () => refreshProducts()
    }
  )

  const updateProduct = useMutation(
    ({ id, ...productData }) => api.put(`/product/${id}`, productData),
    {
      successMessage: 'Product updated successfully!',
      onSuccess: () => refreshProducts()
    }
  )

  const deleteProduct = useMutation(
    (productId) => api.delete(`/product/${productId}`),
    {
      successMessage: 'Product deleted successfully!',
      onSuccess: () => refreshProducts()
    }
  )

  const toggleProductStatus = useMutation(
    (product) => api.put(`/product/${product.id}`, { isActive: !product.isActive }),
    {
      successMessage: (product) => `Product ${product.isActive ? 'deactivated' : 'activated'} successfully!`,
      onSuccess: () => refreshProducts()
    }
  )

  return {
    products,
    loading,
    error,
    refreshProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    toggleProductStatus
  }
}

/**
 * Hook for product statistics
 * @returns {Object} - { stats, loading, error, refreshStats }
 */
export const useProductStats = () => {
  const { execute: fetchStats, data: stats, loading, error } = useApi(
    () => api.get('/product/stats'),
    { showErrorToast: false }
  )

  const refreshStats = useCallback(() => {
    return fetchStats()
  }, [fetchStats])

  return {
    stats,
    loading,
    error,
    refreshStats
  }
}

/**
 * Hook for paginated products
 * @param {Object} options - Configuration options
 * @returns {Object} - { products, loading, error, loadMore, hasMore, loadData, reset }
 */
export const usePaginatedProducts = (options = {}) => {
  const fetchProducts = useCallback(async (page, limit = 20) => {
    const response = await api.get('/product', {
      params: { page, limit, ...options }
    })
    return {
      data: response.data.products,
      hasMore: response.data.products.length === limit
    }
  }, [options])

  return usePaginatedApi(fetchProducts, options)
}
