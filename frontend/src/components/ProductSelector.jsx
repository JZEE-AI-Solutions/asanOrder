import { useState, useEffect } from 'react'
import { MagnifyingGlassIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'
import api, { getImageUrl } from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'

const ProductSelector = ({ 
  tenantId, 
  selectedProducts = [], 
  onProductsChange, 
  maxProducts = 10,
  showSearch = true 
}) => {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (tenantId) {
      fetchProducts()
    }
  }, [tenantId, searchTerm])

  const fetchProducts = async () => {
    if (!tenantId) return
    
    setLoading(true)
    try {
      const response = await api.get(`/products/tenant/${tenantId}?search=${searchTerm}&limit=50`)
      setProducts(response.data.products || [])
    } catch (error) {
      console.error('Error fetching products:', error)
      // Don't show error toast for 401 (unauthorized) as it's expected during form creation
      if (error.response?.status !== 401) {
        toast.error('Failed to load products')
      }
      setProducts([]) // Set empty array on error
    } finally {
      setLoading(false)
    }
  }

  const toggleProductSelection = (product) => {
    const isSelected = selectedProducts.some(p => p.id === product.id)
    
    if (isSelected) {
      // Remove product
      onProductsChange(selectedProducts.filter(p => p.id !== product.id))
    } else {
      // Add product (check max limit)
      if (selectedProducts.length >= maxProducts) {
        toast.error(`Maximum ${maxProducts} products allowed`)
        return
      }
      onProductsChange([...selectedProducts, product])
    }
  }

  const removeProduct = (productId) => {
    onProductsChange(selectedProducts.filter(p => p.id !== productId))
  }

  const displayProducts = showAll ? products : products.slice(0, 6)

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      {showSearch && (
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      )}

      {/* Selected Products */}
      {selectedProducts.length > 0 && (
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
          <h4 className="font-medium text-primary-900 mb-3">
            Selected Products ({selectedProducts.length}/{maxProducts})
          </h4>
          <div className="flex flex-wrap gap-2">
            {selectedProducts.map((product) => (
              <div
                key={product.id}
                className="flex items-center bg-white border border-primary-200 rounded-lg px-3 py-2 text-sm"
              >
                <img
                  src={getImageUrl('product', product.id)}
                  alt={product.name}
                  className="w-6 h-6 rounded object-cover mr-2"
                  onError={(e) => {
                    e.target.style.display = 'none'
                    e.target.nextElementSibling.style.display = 'flex'
                  }}
                />
                <div style={{display: 'none'}} className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center mr-2">
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-primary-900">{product.name}</span>
                <button
                  type="button"
                  onClick={() => removeProduct(product.id)}
                  className="ml-2 text-primary-500 hover:text-primary-700"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Products List */}
      <div className="border border-gray-200 rounded-lg">
        <div className="p-4 border-b border-gray-200">
          <h4 className="font-medium text-gray-900">
            Available Products ({products.length})
          </h4>
        </div>
        
        {loading ? (
          <div className="p-8 text-center">
            <LoadingSpinner size="md" />
            <p className="mt-2 text-gray-500">Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No products found</p>
            <p className="text-sm text-gray-400 mt-1">
              Products will be available after the form is created and published
            </p>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="mt-2 text-primary-600 hover:text-primary-700"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {displayProducts.map((product) => {
              const isSelected = selectedProducts.some(p => p.id === product.id)
              const isDisabled = !isSelected && selectedProducts.length >= maxProducts
              
              return (
                <div
                  key={product.id}
                  className={`p-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary-50 border-primary-200' : ''
                  } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => !isDisabled && toggleProductSelection(product)}
                >
                  <div className="flex items-center space-x-4">
                    {/* Product Image */}
                    <div className="flex-shrink-0">
                      <img
                        src={getImageUrl('product', product.id)}
                        alt={product.name}
                        className="w-16 h-16 rounded-lg object-cover border border-gray-200"
                        onError={(e) => {
                          e.target.style.display = 'none'
                          e.target.nextElementSibling.style.display = 'flex'
                        }}
                      />
                      <div style={{display: 'none'}} className="w-16 h-16 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>
                    
                    {/* Product Details */}
                    <div className="flex-1 min-w-0">
                      <h5 className="font-medium text-gray-900 truncate">
                        {product.name}
                      </h5>
                      {product.description && (
                        <p className="text-sm text-gray-500 truncate">
                          {product.description}
                        </p>
                      )}
                      <div className="flex items-center space-x-4 mt-1">
                        {product.category && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {product.category}
                          </span>
                        )}
                        {product.color && (
                          <span className="text-sm text-gray-500">
                            Color: {product.color}
                          </span>
                        )}
                        {product.size && (
                          <span className="text-sm text-gray-500">
                            Size: {product.size}
                          </span>
                        )}
                      </div>
                      {product.lastPurchased && (
                        <p className="text-xs text-gray-400 mt-1">
                          Last purchased: {new Date(product.lastPurchased).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    
                    {/* Selection Indicator */}
                    <div className="flex-shrink-0">
                      {isSelected ? (
                        <div className="w-6 h-6 bg-primary-600 rounded-full flex items-center justify-center">
                          <CheckIcon className="h-4 w-4 text-white" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 border-2 border-gray-300 rounded-full" />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            
            {/* Show More/Less Button */}
            {products.length > 6 && (
              <div className="p-4 border-t border-gray-200 text-center">
                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  className="text-primary-600 hover:text-primary-700 font-medium"
                >
                  {showAll ? 'Show Less' : `Show All ${products.length} Products`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProductSelector
