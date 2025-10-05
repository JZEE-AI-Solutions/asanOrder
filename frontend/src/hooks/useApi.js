import { useState, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

/**
 * Custom hook for API calls with loading and error states
 * @param {Function} apiCall - The API function to call
 * @param {Object} options - Configuration options
 * @returns {Object} - { data, loading, error, execute, reset }
 */
export const useApi = (apiCall, options = {}) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const execute = useCallback(async (...args) => {
    try {
      setLoading(true)
      setError(null)
      const result = await apiCall(...args)
      setData(result.data)
      return result.data
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'An error occurred'
      setError(errorMessage)
      
      if (options.showErrorToast !== false) {
        toast.error(errorMessage)
      }
      
      throw err
    } finally {
      setLoading(false)
    }
  }, [apiCall, options.showErrorToast])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  return { data, loading, error, execute, reset }
}

/**
 * Hook for handling API mutations (POST, PUT, DELETE)
 * @param {Function} mutationFn - The mutation function
 * @param {Object} options - Configuration options
 * @returns {Object} - { mutate, loading, error, reset }
 */
export const useMutation = (mutationFn, options = {}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const mutate = useCallback(async (...args) => {
    try {
      setLoading(true)
      setError(null)
      const result = await mutationFn(...args)
      
      if (options.onSuccess) {
        options.onSuccess(result.data)
      }
      
      if (options.showSuccessToast !== false && options.successMessage) {
        toast.success(options.successMessage)
      }
      
      return result.data
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'An error occurred'
      setError(errorMessage)
      
      if (options.showErrorToast !== false) {
        toast.error(errorMessage)
      }
      
      if (options.onError) {
        options.onError(err)
      }
      
      throw err
    } finally {
      setLoading(false)
    }
  }, [mutationFn, options])

  const reset = useCallback(() => {
    setError(null)
    setLoading(false)
  }, [])

  return { mutate, loading, error, reset }
}

/**
 * Hook for paginated data fetching
 * @param {Function} fetchFn - Function to fetch data
 * @param {Object} options - Configuration options
 * @returns {Object} - { data, loading, error, loadMore, hasMore, reset }
 */
export const usePaginatedApi = (fetchFn, options = {}) => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)

  const loadData = useCallback(async (pageNum = 1, reset = false) => {
    try {
      setLoading(true)
      setError(null)
      
      const result = await fetchFn(pageNum, options.limit || 20)
      
      if (reset || pageNum === 1) {
        setData(result.data || [])
      } else {
        setData(prev => [...prev, ...(result.data || [])])
      }
      
      setHasMore(result.hasMore || false)
      setPage(pageNum)
      
      return result
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'An error occurred'
      setError(errorMessage)
      
      if (options.showErrorToast !== false) {
        toast.error(errorMessage)
      }
      
      throw err
    } finally {
      setLoading(false)
    }
  }, [fetchFn, options.limit, options.showErrorToast])

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      loadData(page + 1, false)
    }
  }, [hasMore, loading, page, loadData])

  const reset = useCallback(() => {
    setData([])
    setError(null)
    setLoading(false)
    setHasMore(true)
    setPage(1)
  }, [])

  return { data, loading, error, loadMore, hasMore, loadData, reset }
}
