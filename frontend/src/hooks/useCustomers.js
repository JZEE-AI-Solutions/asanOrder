import { useState, useCallback } from 'react'
import { useApi, useMutation, usePaginatedApi } from './useApi'
import api from '../services/api'

/**
 * Hook for managing customers
 * @param {Object} options - Configuration options
 * @returns {Object} - { customers, loading, error, refreshCustomers, createCustomer, updateCustomer, deleteCustomer }
 */
export const useCustomers = (options = {}) => {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchCustomers = useCallback(async (params = {}) => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/customer', { params })
      setCustomers(response.data.customers)
      return response.data
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to fetch customers'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshCustomers = useCallback(() => {
    return fetchCustomers(options)
  }, [fetchCustomers]) // Remove options from dependencies

  const createCustomer = useMutation(
    (customerData) => api.post('/customer', customerData),
    {
      successMessage: 'Customer created successfully!',
      onSuccess: () => refreshCustomers()
    }
  )

  const updateCustomer = useMutation(
    ({ id, ...customerData }) => api.put(`/customer/${id}`, customerData),
    {
      successMessage: 'Customer updated successfully!',
      onSuccess: () => refreshCustomers()
    }
  )

  const deleteCustomer = useMutation(
    (customerId) => api.delete(`/customer/${customerId}`),
    {
      successMessage: 'Customer deleted successfully!',
      onSuccess: () => refreshCustomers()
    }
  )

  return {
    customers,
    loading,
    error,
    refreshCustomers,
    createCustomer,
    updateCustomer,
    deleteCustomer
  }
}

/**
 * Hook for customer statistics
 * @returns {Object} - { stats, loading, error, refreshStats }
 */
export const useCustomerStats = () => {
  const { execute: fetchStats, data: stats, loading, error } = useApi(
    () => api.get('/customer/stats/overview'),
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
 * Hook for paginated customers
 * @param {Object} options - Configuration options
 * @returns {Object} - { customers, loading, error, loadMore, hasMore, loadData, reset }
 */
export const usePaginatedCustomers = (options = {}) => {
  const fetchCustomers = useCallback(async (page, limit = 20) => {
    const response = await api.get('/customer', {
      params: { page, limit, ...options }
    })
    return {
      data: response.data.customers,
      hasMore: response.data.customers.length === limit
    }
  }, [options])

  return usePaginatedApi(fetchCustomers, options)
}
