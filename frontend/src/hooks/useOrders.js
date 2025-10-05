import { useState, useCallback } from 'react'
import { useApi, useMutation, usePaginatedApi } from './useApi'
import api from '../services/api'

/**
 * Hook for managing orders
 * @param {Object} options - Configuration options
 * @returns {Object} - { orders, loading, error, refreshOrders, confirmOrder, cancelOrder }
 */
export const useOrders = (options = {}) => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchOrders = useCallback(async (params = {}) => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/order', { params })
      setOrders(response.data.orders)
      return response.data
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to fetch orders'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshOrders = useCallback(() => {
    return fetchOrders(options)
  }, [fetchOrders]) // Remove options from dependencies

  const confirmOrder = useMutation(
    (orderId) => api.post(`/order/${orderId}/confirm`),
    {
      successMessage: 'Order confirmed successfully!',
      onSuccess: () => refreshOrders()
    }
  )

  const cancelOrder = useMutation(
    (orderId) => api.post(`/order/${orderId}/cancel`),
    {
      successMessage: 'Order cancelled successfully!',
      onSuccess: () => refreshOrders()
    }
  )

  return {
    orders,
    loading,
    error,
    refreshOrders,
    confirmOrder,
    cancelOrder
  }
}

/**
 * Hook for order statistics
 * @returns {Object} - { stats, loading, error, refreshStats }
 */
export const useOrderStats = () => {
  const { execute: fetchStats, data: stats, loading, error } = useApi(
    () => api.get('/order/stats/dashboard'),
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
 * Hook for paginated orders
 * @param {Object} options - Configuration options
 * @returns {Object} - { orders, loading, error, loadMore, hasMore, loadData, reset }
 */
export const usePaginatedOrders = (options = {}) => {
  const fetchOrders = useCallback(async (page, limit = 20) => {
    const response = await api.get('/order', {
      params: { page, limit, ...options }
    })
    return {
      data: response.data.orders,
      hasMore: response.data.orders.length === limit
    }
  }, [options])

  return usePaginatedApi(fetchOrders, options)
}
