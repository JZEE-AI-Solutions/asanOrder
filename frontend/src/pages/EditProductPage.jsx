import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { ArrowLeftIcon, CubeIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'
import { useTenant } from '../hooks'
import QuantityRulesEditor from '../components/QuantityRulesEditor'

const EditProductPage = () => {
  const navigate = useNavigate()
  const { productId } = useParams()
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(false)
  const [loadingProduct, setLoadingProduct] = useState(true)
  const [categories, setCategories] = useState([])
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [useDefaultShipping, setUseDefaultShipping] = useState(true)
  const [productShippingRules, setProductShippingRules] = useState([])
  const [productDefaultQuantityCharge, setProductDefaultQuantityCharge] = useState(150)
  
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors }
  } = useForm({
    defaultValues: {
      name: '',
      description: '',
      category: '',
      newCategory: '',
      sku: '',
      currentRetailPrice: 0,
      lastPurchasePrice: 0,
      lastSalePrice: 0,
      minStockLevel: 0,
      maxStockLevel: '',
      isActive: true
    }
  })

  const selectedCategory = watch('category')

  // Fetch product data
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoadingProduct(true)
        const response = await api.get(`/product/${productId}`)
        const product = response.data.product
        
        reset({
          name: product.name || '',
          description: product.description || '',
          category: product.category || '',
          newCategory: '',
          sku: product.sku || '',
          currentRetailPrice: product.currentRetailPrice || 0,
          lastPurchasePrice: product.lastPurchasePrice || 0,
          lastSalePrice: product.lastSalePrice || 0,
          minStockLevel: product.minStockLevel || 0,
          maxStockLevel: product.maxStockLevel || '',
          isActive: product.isActive ?? true
        })

        // Set shipping configuration
        setUseDefaultShipping(product.useDefaultShipping !== undefined ? product.useDefaultShipping : true)
        setProductDefaultQuantityCharge(product.shippingDefaultQuantityCharge || 150)
        if (product.shippingQuantityRules) {
          try {
            const rules = typeof product.shippingQuantityRules === 'string' 
              ? JSON.parse(product.shippingQuantityRules)
              : product.shippingQuantityRules
            setProductShippingRules(Array.isArray(rules) ? rules : [])
          } catch (e) {
            console.error('Error parsing shipping rules:', e)
            setProductShippingRules([])
          }
        } else {
          setProductShippingRules([])
        }
      } catch (error) {
        console.error('Failed to fetch product:', error)
        toast.error('Failed to load product')
        navigate('/business/products')
      } finally {
        setLoadingProduct(false)
      }
    }

    if (productId) {
      fetchProduct()
    }
  }, [productId, reset, navigate])

  // Fetch existing categories from products
  useEffect(() => {
    const fetchCategories = async () => {
      if (!tenant?.id) return
      
      try {
        setLoadingCategories(true)
        const response = await api.get(`/products/tenant/${tenant.id}`)
        const products = response.data.products || []
        const uniqueCategories = [...new Set(products.map(p => p.category).filter(Boolean))]
        setCategories(uniqueCategories.sort())
      } catch (error) {
        console.error('Failed to fetch categories:', error)
      } finally {
        setLoadingCategories(false)
      }
    }

    fetchCategories()
  }, [tenant])

  // Handle category selection change
  useEffect(() => {
    if (selectedCategory === '__new__') {
      setShowNewCategory(true)
      setValue('category', '')
    } else if (selectedCategory && selectedCategory !== '__new__') {
      setShowNewCategory(false)
      setValue('newCategory', '')
    }
  }, [selectedCategory, setValue])

  const onSubmit = async (data) => {
    try {
      setLoading(true)
      
      // Use newCategory if "Add New" was selected, otherwise use category
      const categoryValue = showNewCategory && data.newCategory 
        ? data.newCategory.trim() 
        : data.category || ''
      
      // Clean up the data before sending - ensure proper types for backend validation
      const productData = {
        name: data.name?.trim() || '',
        currentRetailPrice: parseFloat(data.currentRetailPrice) || 0,
        lastPurchasePrice: parseFloat(data.lastPurchasePrice) || 0,
        lastSalePrice: parseFloat(data.lastSalePrice) || 0,
        minStockLevel: parseInt(data.minStockLevel) || 0,
        isActive: data.isActive ?? true
      }
      
      // Add optional fields only if they have values
      if (data.description?.trim()) {
        productData.description = data.description.trim()
      }
      
      if (categoryValue?.trim()) {
        productData.category = categoryValue.trim()
      }
      
      if (data.sku?.trim()) {
        productData.sku = data.sku.trim()
      }
      
      // Handle maxStockLevel - only include if it has a valid integer value
      if (data.maxStockLevel !== undefined && data.maxStockLevel !== null && data.maxStockLevel !== '') {
        const maxStock = parseInt(data.maxStockLevel)
        if (!isNaN(maxStock) && maxStock >= 0) {
          productData.maxStockLevel = maxStock
        }
      }

      // Add shipping configuration
      productData.useDefaultShipping = useDefaultShipping
      if (!useDefaultShipping) {
        // If custom shipping is enabled, save the rules and default charge
        // Sort rules by min value before saving
        const sortedRules = [...productShippingRules].sort((a, b) => {
          const minA = a.min || 1
          const minB = b.min || 1
          return minA - minB
        })
        
        if (sortedRules.length > 0) {
          productData.shippingQuantityRules = JSON.stringify(sortedRules)
        } else {
          // If no rules but custom shipping is enabled, save empty array
          // This will make the system use default rules as fallback
          productData.shippingQuantityRules = JSON.stringify([])
        }
        
        // Save product-specific default quantity charge
        // Use nullish coalescing to preserve 0 as a valid value
        productData.shippingDefaultQuantityCharge = productDefaultQuantityCharge !== undefined && productDefaultQuantityCharge !== null 
          ? productDefaultQuantityCharge 
          : null
      } else {
        // If using default shipping, clear product-specific rules and charge
        productData.shippingQuantityRules = null
        productData.shippingDefaultQuantityCharge = null
      }
      
      console.log('📦 Shipping config being saved:', {
        useDefaultShipping,
        rulesCount: productShippingRules.length,
        rules: productShippingRules,
        shippingQuantityRules: productData.shippingQuantityRules
      })
      
      console.log('Sending product update data:', productData)
      
      const response = await api.put(`/product/${productId}`, productData)
      toast.success('Product updated successfully!')
      
      // If a new category was added, refresh categories list so it appears in all dropdowns
      if (showNewCategory && categoryValue) {
        try {
          const refreshResponse = await api.get(`/products/tenant/${tenant.id}`)
          const products = refreshResponse.data.products || []
          const uniqueCategories = [...new Set(products.map(p => p.category).filter(Boolean))]
          setCategories(uniqueCategories.sort())
        } catch (error) {
          console.error('Failed to refresh categories:', error)
        }
      }
      
      navigate('/business/products')
    } catch (error) {
      console.error('Failed to update product:', error)
      console.error('Error response:', error.response?.data)
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.errors?.[0]?.msg || 
                          error.response?.data?.message ||
                          'Failed to update product'
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (loadingProduct) {
    return (
      <ModernLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSpinner className="min-h-screen" />
        </div>
      </ModernLayout>
    )
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
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Edit Product</h1>
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
                {loadingCategories ? (
                  <div className="w-full px-3 py-2 bg-gray-50 text-gray-500 border-2 border-gray-300 rounded-lg flex items-center">
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Loading categories...</span>
                  </div>
                ) : (
                  <>
                    <select
                      {...register('category')}
                      onChange={(e) => {
                        const value = e.target.value
                        register('category').onChange(e)
                        if (value === '__new__') {
                          setShowNewCategory(true)
                          setValue('category', '')
                        } else {
                          setShowNewCategory(false)
                          setValue('newCategory', '')
                        }
                      }}
                      className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    >
                      <option value="" className="text-gray-900 bg-white">Select a category (optional)</option>
                      {categories.map(category => (
                        <option key={category} value={category} className="text-gray-900 bg-white">
                          {category}
                        </option>
                      ))}
                      <option value="__new__" className="text-gray-900 bg-white">+ Add New Category</option>
                    </select>
                    {showNewCategory && (
                      <div className="mt-2">
                        <input
                          {...register('newCategory', {
                            required: showNewCategory ? 'Please enter a new category name' : false,
                            validate: (value) => {
                              if (showNewCategory && !value?.trim()) {
                                return 'Category name is required'
                              }
                              return true
                            }
                          })}
                          className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                          placeholder="Enter new category name"
                          autoFocus
                        />
                        <p className="text-xs text-gray-500 mt-1">This category will be available for all products after saving</p>
                      </div>
                    )}
                    {errors.newCategory && (
                      <p className="text-red-500 text-sm mt-1">{errors.newCategory.message}</p>
                    )}
                  </>
                )}
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
                  onFocus={(e) => {
                    if (e.target.value === '0' || e.target.value === '0.00' || e.target.value === '') {
                      e.target.select()
                    }
                  }}
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
                  onFocus={(e) => {
                    if (e.target.value === '0' || e.target.value === '0.00' || e.target.value === '') {
                      e.target.select()
                    }
                  }}
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
                  onFocus={(e) => {
                    if (e.target.value === '0' || e.target.value === '0.00' || e.target.value === '') {
                      e.target.select()
                    }
                  }}
                />
                {errors.lastSalePrice && (
                  <p className="text-red-500 text-sm mt-1">{errors.lastSalePrice.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Inventory */}
          <div className="card p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Inventory Settings</h3>
            
            {/* Information Box */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h4 className="text-sm font-semibold text-blue-900 mb-1">How to Update Quantity</h4>
                  <p className="text-sm text-blue-800">
                    Product quantity cannot be edited directly. To add or update quantity for this product, 
                    please create a <strong>Purchase Invoice</strong> from the Purchases module. The quantity will 
                    automatically update when you add this product to a purchase invoice.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  onFocus={(e) => {
                    if (e.target.value === '0' || e.target.value === '') {
                      e.target.select()
                    }
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">Alert when stock falls below this level</p>
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
                  onFocus={(e) => {
                    if (e.target.value === '0' || e.target.value === '') {
                      e.target.select()
                    }
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">Maximum stock capacity (optional)</p>
                {errors.maxStockLevel && (
                  <p className="text-red-500 text-sm mt-1">{errors.maxStockLevel.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Shipping Configuration */}
          <div className="card p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Shipping Configuration</h3>
            <p className="text-sm text-gray-600 mb-4">
              Configure product-specific shipping rules. If disabled, default shipping rules from Settings will be used.
            </p>

            <div className="mb-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={useDefaultShipping}
                  onChange={(e) => setUseDefaultShipping(e.target.checked)}
                  className="rounded border-gray-300 text-pink-600 shadow-sm focus:border-pink-300 focus:ring focus:ring-pink-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm font-medium text-gray-900">
                  Use default shipping rules (from Settings)
                </span>
              </label>
            </div>

            {!useDefaultShipping && (
              <div>
                {/* Default Quantity Charge for this Product */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default Quantity Charge per Unit (Rs.)
                    <span className="text-gray-500 text-xs ml-2 font-normal">
                      Applied to additional units (quantity - 1) when quantity doesn't match any rule below. Quantity 1 = no charge.
                    </span>
                  </label>
                  <input
                    type="number"
                    value={productDefaultQuantityCharge}
                    onChange={(e) => setProductDefaultQuantityCharge(parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This charge applies to additional units beyond the first. Quantity 1 = no charge, Quantity 3 = charge × 2 additional units. (e.g., Rs. 150 × 2 = Rs. 300 for 3 units)
                  </p>
                </div>

                {productShippingRules.length === 0 && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      <strong>No custom rules configured.</strong> Add at least one quantity rule below. If no rules match, the default quantity charge above will be used.
                    </p>
                  </div>
                )}
                <QuantityRulesEditor
                  rules={productShippingRules}
                  defaultCharge={productDefaultQuantityCharge}
                  showDefaultCharge={false}
                  onRulesChange={(newRules) => {
                    console.log('Product shipping rules changed:', newRules)
                    setProductShippingRules(newRules)
                  }}
                  onDefaultChange={(charge) => {
                    // This won't be called since showDefaultCharge is false, but keeping for compatibility
                    console.log('Product default quantity charge changed:', charge)
                    setProductDefaultQuantityCharge(charge)
                  }}
                />
              </div>
            )}
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
                  <span className="ml-2">Updating...</span>
                </>
              ) : (
                'Update Product'
              )}
            </button>
          </div>
        </form>
      </div>
    </ModernLayout>
  )
}

export default EditProductPage

