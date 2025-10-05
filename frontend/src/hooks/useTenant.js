import { useState, useEffect, useCallback } from 'react'
import { useApi } from './useApi'
import api from '../services/api'

/**
 * Hook for managing tenant data and operations
 * @returns {Object} - { tenant, loading, error, refreshTenant, updateTenant }
 */
export const useTenant = () => {
  const [tenant, setTenant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchTenant = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/tenant/owner/me')
      setTenant(response.data.tenant)
      return response.data.tenant
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to fetch tenant data'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const updateTenant = useCallback(async (updates) => {
    try {
      const response = await api.put('/tenant/owner/me', updates)
      setTenant(response.data.tenant)
      return response.data.tenant
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to update tenant'
      setError(errorMessage)
      throw err
    }
  }, [])

  const refreshTenant = useCallback(() => {
    return fetchTenant()
  }, [fetchTenant])

  useEffect(() => {
    fetchTenant()
  }, [fetchTenant])

  return {
    tenant,
    loading,
    error,
    refreshTenant,
    updateTenant
  }
}

/**
 * Hook for tenant statistics
 * @returns {Object} - { stats, loading, error, refreshStats }
 */
export const useTenantStats = () => {
  const { execute: fetchStats, data: stats, loading, error } = useApi(
    () => api.get('/tenant/owner/me/stats'),
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
