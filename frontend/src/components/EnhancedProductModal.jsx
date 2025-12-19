import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { XMarkIcon, ClockIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'

const EnhancedProductModal = ({ product, isEditing, onClose, onSaved }) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [productHistory, setProductHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch
  } = useForm()

  // Watch for changes to show reason field
  const watchedFields = watch()

  // Reset form when product changes
  useEffect(() => {
    if (product) {
      reset({
        name: product.name || '',
        description: product.description || '',
        category: product.category || '',
        sku: product.sku || '',
        currentRetailPrice: product.currentRetailPrice || 0,
        lastPurchasePrice: product.lastPurchasePrice || 0,
        lastSalePrice: product.lastSalePrice || 0,
        currentQuantity: product.currentQuantity || 0,
        minStockLevel: product.minStockLevel || 0,
        maxStockLevel: product.maxStockLevel || '',
        isActive: product.isActive ?? true,
        reason: ''
      })
    } else {
      reset({
        name: '',
        description: '',
        category: '',
        sku: '',
        currentRetailPrice: 0,
        lastPurchasePrice: 0,
        lastSalePrice: 0,
        currentQuantity: 0,
        minStockLevel: 0,
        maxStockLevel: '',
        isActive: true,
        reason: ''
      })
    }
  }, [product, reset])

  const fetchProductHistory = async () => {
    if (!product?.id) return
    
    setLoadingHistory(true)
    try {
      const response = await api.get(`/product/${product.id}/history`)
      setProductHistory(response.data.logs)
    } catch (error) {
      toast.error('Failed to fetch product history')
    } finally {
      setLoadingHistory(false)
    }
  }

  const onSubmit = async (data) => {
    setIsSubmitting(true)
    try {
      if (isEditing && product) {
        await api.put(`/product/${product.id}`, data)
        toast.success('Product updated successfully!')
      } else {
        await api.post('/product', data)
        toast.success('Product created successfully!')
      }
      onSaved()
    } catch (error) {
      const message = error.response?.data?.error || 'Operation failed'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString()
  }

  const getActionIcon = (action) => {
    switch (action) {
      case 'PRICE_UPDATE':
      case 'PURCHASE_PRICE_UPDATE':
      case 'SALE_PRICE_UPDATE':
        return '💰'
      case 'QUANTITY_ADJUSTMENT':
        return '📦'
      case 'MIN_STOCK_UPDATE':
      case 'MAX_STOCK_UPDATE':
        return '📊'
      case 'INFO_UPDATE':
        return '📝'
      default:
        return '📋'
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {isEditing ? 'Edit Product' : 'Add New Product'}
            </h2>
            {isEditing && product && (
              <button
                onClick={() => {
                  setShowHistory(!showHistory)
                  if (!showHistory && productHistory.length === 0) {
                    fetchProductHistory()
                  }
                }}
                className="flex items-center px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                <ClockIcon className="h-4 w-4 mr-1" />
                {showHistory ? 'Hide History' : 'View History'}
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex">
          {/* Form Section */}
          <div className={`${showHistory ? 'w-1/2' : 'w-full'} p-6`}>
            <form key={product?.id || 'new'} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Product Name *
                    </label>
                    <input
                      {...register('name', { required: 'Product name is required' })}
                      className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter product name"
                    />
                    {errors.name && (
                      <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      SKU
                    </label>
                    <input
                      {...register('sku')}
                      className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter SKU"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      {...register('description')}
                      rows={3}
                      className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter product description"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <input
                      {...register('category')}
                      className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter category"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Pricing</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Retail Price (Rs.)
                    </label>
                    <input
                      {...register('currentRetailPrice', { 
                        valueAsNumber: true,
                        min: { value: 0, message: 'Price must be positive' }
                      })}
                      type="number"
                      step="0.01"
                      defaultValue={product?.currentRetailPrice || 0}
                      className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                    {errors.currentRetailPrice && (
                      <p className="text-red-500 text-sm mt-1">{errors.currentRetailPrice.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Purchase Price (Rs.)
                    </label>
                    <input
                      {...register('lastPurchasePrice', { 
                        valueAsNumber: true,
                        min: { value: 0, message: 'Price must be positive' }
                      })}
                      type="number"
                      step="0.01"
                      defaultValue={product?.lastPurchasePrice || 0}
                      className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                    {errors.lastPurchasePrice && (
                      <p className="text-red-500 text-sm mt-1">{errors.lastPurchasePrice.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sale Price (Rs.)
                    </label>
                    <input
                      {...register('lastSalePrice', { 
                        valueAsNumber: true,
                        min: { value: 0, message: 'Price must be positive' }
                      })}
                      type="number"
                      step="0.01"
                      defaultValue={product?.lastSalePrice || 0}
                      className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                    {errors.lastSalePrice && (
                      <p className="text-red-500 text-sm mt-1">{errors.lastSalePrice.message}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Inventory */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Inventory</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Current Quantity
                    </label>
                    <input
                      {...register('currentQuantity', { 
                        valueAsNumber: true,
                        min: { value: 0, message: 'Quantity must be positive' }
                      })}
                      type="number"
                      className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0"
                    />
                    {errors.currentQuantity && (
                      <p className="text-red-500 text-sm mt-1">{errors.currentQuantity.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min Stock Level
                    </label>
                    <input
                      {...register('minStockLevel', { 
                        valueAsNumber: true,
                        min: { value: 0, message: 'Stock level must be positive' }
                      })}
                      type="number"
                      className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0"
                    />
                    {errors.minStockLevel && (
                      <p className="text-red-500 text-sm mt-1">{errors.minStockLevel.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Stock Level
                    </label>
                    <input
                      {...register('maxStockLevel', { 
                        valueAsNumber: true,
                        min: { value: 0, message: 'Stock level must be positive' }
                      })}
                      type="number"
                      className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Optional"
                    />
                    {errors.maxStockLevel && (
                      <p className="text-red-500 text-sm mt-1">{errors.maxStockLevel.message}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="flex items-center">
                  <input
                    {...register('isActive')}
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                  <span className="ml-2 text-sm text-gray-700">Product is active</span>
                </label>
              </div>

              {/* Reason for Change (only show when editing) */}
              {isEditing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reason for Changes
                  </label>
                    <input
                      {...register('reason')}
                      className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Optional: Explain why you're making these changes"
                    />
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex justify-end space-x-3 pt-6 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="flex items-center">
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">
                        {isEditing ? 'Updating...' : 'Creating...'}
                      </span>
                    </div>
                  ) : (
                    isEditing ? 'Update Product' : 'Create Product'
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* History Section */}
          {showHistory && (
            <div className="w-1/2 border-l bg-gray-50 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Product History</h3>
              
              {loadingHistory ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : productHistory.length > 0 ? (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {productHistory.map((log) => (
                    <div key={log.id} className="bg-white p-4 rounded-lg border">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">{getActionIcon(log.action)}</span>
                          <div>
                            <p className="font-medium text-gray-900">{log.action.replace(/_/g, ' ')}</p>
                            <p className="text-sm text-gray-600">{formatDate(log.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                      
                      {log.notes && (
                        <p className="text-sm text-gray-700 mt-2">{log.notes}</p>
                      )}
                      
                      {log.reason && (
                        <p className="text-sm text-blue-600 mt-1">
                          <span className="font-medium">Reason:</span> {log.reason}
                        </p>
                      )}
                      
                      <div className="flex space-x-4 text-xs text-gray-500 mt-2">
                        {log.oldPrice !== null && log.newPrice !== null && (
                          <span>Price: Rs.{log.oldPrice} → Rs.{log.newPrice}</span>
                        )}
                        {log.oldQuantity !== null && log.newQuantity !== null && (
                          <span>Qty: {log.oldQuantity} → {log.newQuantity}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No history available</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default EnhancedProductModal
