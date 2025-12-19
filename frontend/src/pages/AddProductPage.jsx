import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { ArrowLeftIcon, CubeIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'

const AddProductPage = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    defaultValues: {
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
      isActive: true
    }
  })

  const onSubmit = async (data) => {
    try {
      setLoading(true)
      const response = await api.post('/product', data)
      toast.success('Product created successfully!')
      navigate('/business/products')
    } catch (error) {
      console.error('Failed to create product:', error)
      const message = error.response?.data?.error || 'Failed to create product'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModernLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/business/products')}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div className="flex items-center">
            <div className="p-2 bg-pink-100 rounded-lg mr-3">
              <CubeIcon className="h-6 w-6 text-pink-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Add New Product</h1>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Information */}
          <div className="card p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Product Name *
                </label>
                <input
                  {...register('name', { required: 'Product name is required' })}
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="Enter product name"
                />
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  SKU
                </label>
                <input
                  {...register('sku')}
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="Enter SKU"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Description
                </label>
                <textarea
                  {...register('description')}
                  rows={3}
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="Enter product description"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Category
                </label>
                <input
                  {...register('category')}
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="Enter category"
                />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="card p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Pricing</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Retail Price (Rs.)
                </label>
                <input
                  {...register('currentRetailPrice', { 
                    valueAsNumber: true,
                    min: { value: 0, message: 'Price must be positive' }
                  })}
                  type="number"
                  step="0.01"
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="0.00"
                />
                {errors.currentRetailPrice && (
                  <p className="text-red-500 text-sm mt-1">{errors.currentRetailPrice.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Purchase Price (Rs.)
                </label>
                <input
                  {...register('lastPurchasePrice', { 
                    valueAsNumber: true,
                    min: { value: 0, message: 'Price must be positive' }
                  })}
                  type="number"
                  step="0.01"
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="0.00"
                />
                {errors.lastPurchasePrice && (
                  <p className="text-red-500 text-sm mt-1">{errors.lastPurchasePrice.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Sale Price (Rs.)
                </label>
                <input
                  {...register('lastSalePrice', { 
                    valueAsNumber: true,
                    min: { value: 0, message: 'Price must be positive' }
                  })}
                  type="number"
                  step="0.01"
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="0.00"
                />
                {errors.lastSalePrice && (
                  <p className="text-red-500 text-sm mt-1">{errors.lastSalePrice.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Inventory */}
          <div className="card p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Inventory</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Current Quantity
                </label>
                <input
                  {...register('currentQuantity', { 
                    valueAsNumber: true,
                    min: { value: 0, message: 'Quantity must be positive' }
                  })}
                  type="number"
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="0"
                />
                {errors.currentQuantity && (
                  <p className="text-red-500 text-sm mt-1">{errors.currentQuantity.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Min Stock Level
                </label>
                <input
                  {...register('minStockLevel', { 
                    valueAsNumber: true,
                    min: { value: 0, message: 'Stock level must be positive' }
                  })}
                  type="number"
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="0"
                />
                {errors.minStockLevel && (
                  <p className="text-red-500 text-sm mt-1">{errors.minStockLevel.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Max Stock Level
                </label>
                <input
                  {...register('maxStockLevel', { 
                    valueAsNumber: true,
                    min: { value: 0, message: 'Stock level must be positive' }
                  })}
                  type="number"
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  placeholder="Optional"
                />
                {errors.maxStockLevel && (
                  <p className="text-red-500 text-sm mt-1">{errors.maxStockLevel.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="card p-6">
            <div>
              <label className="flex items-center">
                <input
                  {...register('isActive')}
                  type="checkbox"
                  className="rounded border-gray-300 text-pink-600 shadow-sm focus:border-pink-300 focus:ring focus:ring-pink-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm font-medium text-gray-900">Product is active</span>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/business/products')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 text-sm font-medium text-white bg-pink-600 border border-transparent rounded-lg hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Creating...</span>
                </>
              ) : (
                'Create Product'
              )}
            </button>
          </div>
        </form>
      </div>
    </ModernLayout>
  )
}

export default AddProductPage

