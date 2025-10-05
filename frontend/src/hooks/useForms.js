import { useState, useCallback } from 'react'
import { useApi, useMutation } from './useApi'
import api from '../services/api'

/**
 * Hook for managing forms
 * @param {Object} options - Configuration options
 * @returns {Object} - { forms, loading, error, refreshForms, createForm, updateForm, deleteForm }
 */
export const useForms = (options = {}) => {
  const [forms, setForms] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchForms = useCallback(async (params = {}) => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.get('/form', { params })
      setForms(response.data.forms || [])
      return response.data
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to fetch forms'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshForms = useCallback(() => {
    return fetchForms(options)
  }, [fetchForms]) // Remove options from dependencies

  const createForm = useMutation(
    (formData) => api.post('/form', formData),
    {
      successMessage: 'Form created successfully!',
      onSuccess: () => refreshForms()
    }
  )

  const updateForm = useMutation(
    ({ id, ...formData }) => api.put(`/form/${id}`, formData),
    {
      successMessage: 'Form updated successfully!',
      onSuccess: () => refreshForms()
    }
  )

  const deleteForm = useMutation(
    (formId) => api.delete(`/form/${formId}`),
    {
      successMessage: 'Form deleted successfully!',
      onSuccess: () => refreshForms()
    }
  )

  const publishForm = useMutation(
    (formId) => api.post(`/form/${formId}/publish`),
    {
      successMessage: 'Form published successfully!',
      onSuccess: () => refreshForms()
    }
  )

  const unpublishForm = useMutation(
    (formId) => api.post(`/form/${formId}/unpublish`),
    {
      successMessage: 'Form unpublished successfully!',
      onSuccess: () => refreshForms()
    }
  )

  return {
    forms,
    loading,
    error,
    refreshForms,
    createForm,
    updateForm,
    deleteForm,
    publishForm,
    unpublishForm
  }
}

/**
 * Hook for form statistics
 * @returns {Object} - { stats, loading, error, refreshStats }
 */
export const useFormStats = () => {
  const { execute: fetchStats, data: stats, loading, error } = useApi(
    () => api.get('/form/stats'),
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
