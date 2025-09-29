import { useState, useEffect } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'

const ProductDisplay = ({ 
  products = [], 
  selectedProducts = [], 
  onSelectionChange, 
  maxSelections = 10,
  showNavigation = true 
}) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedItems, setSelectedItems] = useState(selectedProducts || [])
  const [quantities, setQuantities] = useState({})

  // Sync selectedItems with selectedProducts when selectedProducts changes
  useEffect(() => {
    setSelectedItems(selectedProducts || [])
  }, [selectedProducts])

  const currentProduct = products[currentIndex]
  const totalProducts = products.length

  const handleProductSelect = (product) => {
    const isSelected = selectedItems.some(item => item.id === product.id)
    
    if (isSelected) {
      // Remove product
      const newSelection = selectedItems.filter(item => item.id !== product.id)
      const newQuantities = { ...quantities }
      delete newQuantities[product.id]
      setSelectedItems(newSelection)
      setQuantities(newQuantities)
      onSelectionChange?.(newSelection, newQuantities)
    } else {
      // Add product (check max limit)
      if (selectedItems.length >= maxSelections) {
        return
      }
      const newSelection = [...selectedItems, product]
      const newQuantities = { ...quantities, [product.id]: 1 } // Default quantity is 1
      setSelectedItems(newSelection)
      setQuantities(newQuantities)
      onSelectionChange?.(newSelection, newQuantities)
    }
  }

  const handleQuantityChange = (productId, quantity) => {
    const newQuantity = Math.max(1, Math.min(999, parseInt(quantity) || 1)) // Min 1, Max 999
    const newQuantities = { ...quantities, [productId]: newQuantity }
    setQuantities(newQuantities)
    onSelectionChange?.(selectedItems, newQuantities)
  }

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : totalProducts - 1))
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < totalProducts - 1 ? prev + 1 : 0))
  }

  const goToSlide = (index) => {
    setCurrentIndex(index)
  }

  if (!currentProduct) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <p className="text-gray-500">No products available</p>
      </div>
    )
  }

  const isSelected = selectedItems.some(item => item.id === currentProduct.id)

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            Choose Your Products
          </h3>
          <div className="text-sm text-primary-100">
            {selectedItems.length}/{maxSelections} selected
          </div>
        </div>
        {totalProducts > 1 && (
          <div className="mt-2 text-sm text-primary-100">
            Product {currentIndex + 1} of {totalProducts}
          </div>
        )}
      </div>

      {/* Product Display */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Product Image */}
          <div className="space-y-4">
            <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
              {(currentProduct.imageData || currentProduct.image) ? (
                <img
                  src={currentProduct.imageData ? `/api/images/public/product/${currentProduct.id}` : currentProduct.image}
                  alt={currentProduct.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>
            
            {/* Thumbnail Navigation */}
            {totalProducts > 1 && (
              <div className="flex space-x-2 overflow-x-auto pb-2">
                {products.map((product, index) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      goToSlide(index);
                    }}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${
                      index === currentIndex 
                        ? 'border-primary-500' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {(product.imageData || product.image) ? (
                      <img
                        src={product.imageData ? `/api/images/public/product/${product.id}` : product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="space-y-6">
            <div>
              <h4 className="text-2xl font-bold text-gray-900 mb-2">
                {currentProduct.name}
              </h4>
              {currentProduct.description && (
                <p className="text-gray-600 text-lg">
                  {currentProduct.description}
                </p>
              )}
            </div>

            {/* Product Attributes */}
            <div className="space-y-3">
              {currentProduct.category && (
                <div className="flex items-center">
                  <span className="text-sm font-medium text-gray-500 w-20">Category:</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                    {currentProduct.category}
                  </span>
                </div>
              )}
              
              {currentProduct.color && (
                <div className="flex items-center">
                  <span className="text-sm font-medium text-gray-500 w-20">Color:</span>
                  <span className="text-sm text-gray-900">{currentProduct.color}</span>
                </div>
              )}
              
              {currentProduct.size && (
                <div className="flex items-center">
                  <span className="text-sm font-medium text-gray-500 w-20">Size:</span>
                  <span className="text-sm text-gray-900">{currentProduct.size}</span>
                </div>
              )}
            </div>

            {/* Selection Status */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {isSelected ? 'Selected' : 'Not Selected'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {isSelected 
                      ? 'This product is in your selection' 
                      : 'Click to add this product to your selection'
                    }
                  </p>
                </div>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  isSelected 
                    ? 'bg-primary-600' 
                    : 'border-2 border-gray-300'
                }`}>
                  {isSelected && <CheckIcon className="h-4 w-4 text-white" />}
                </div>
              </div>
              
              {/* Quantity Selection - Only show if product is selected */}
              {isSelected && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      Quantity:
                    </label>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleQuantityChange(currentProduct.id, (quantities[currentProduct.id] || 1) - 1);
                        }}
                        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        disabled={quantities[currentProduct.id] <= 1}
                      >
                        <span className="text-gray-600">-</span>
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={quantities[currentProduct.id] || 1}
                        onChange={(e) => handleQuantityChange(currentProduct.id, e.target.value)}
                        className="w-16 text-center border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleQuantityChange(currentProduct.id, (quantities[currentProduct.id] || 1) + 1);
                        }}
                        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        disabled={quantities[currentProduct.id] >= 999}
                      >
                        <span className="text-gray-600">+</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleProductSelect(currentProduct);
                }}
                disabled={!isSelected && selectedItems.length >= maxSelections}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                  isSelected
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : selectedItems.length >= maxSelections
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-primary-600 hover:bg-primary-700 text-white'
                }`}
              >
                {isSelected ? (
                  <div className="flex items-center justify-center">
                    <XMarkIcon className="h-5 w-5 mr-2" />
                    Remove from Selection
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    <CheckIcon className="h-5 w-5 mr-2" />
                    Add to Selection
                  </div>
                )}
              </button>
              
              {selectedItems.length >= maxSelections && !isSelected && (
                <p className="text-sm text-red-600 text-center">
                  Maximum {maxSelections} products allowed
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      {showNavigation && totalProducts > 1 && (
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goToPrevious();
            }}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <ChevronLeftIcon className="h-4 w-4 mr-1" />
            Previous
          </button>
          
          <div className="flex space-x-1">
            {products.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  goToSlide(index);
                }}
                className={`w-2 h-2 rounded-full ${
                  index === currentIndex ? 'bg-primary-600' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
          
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goToNext();
            }}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            Next
            <ChevronRightIcon className="h-4 w-4 ml-1" />
          </button>
        </div>
      )}

      {/* Selected Products Summary */}
      {selectedItems.length > 0 && (
        <div className="bg-primary-50 border-t border-primary-200 px-6 py-4">
          <h5 className="font-medium text-primary-900 mb-2">
            Selected Products ({selectedItems.length})
          </h5>
          <div className="space-y-2">
            {selectedItems.map((product) => (
              <div
                key={product.id}
                className="flex items-center justify-between bg-white border border-primary-200 rounded-lg px-3 py-2 text-sm"
              >
                <div className="flex items-center">
                  {(product.imageData || product.image) ? (
                    <img
                      src={product.imageData ? `/api/images/public/product/${product.id}` : product.image}
                      alt={product.name}
                      className="w-6 h-6 rounded object-cover mr-2"
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center mr-2">
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <span className="text-primary-900">{product.name}</span>
                </div>
                
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">Qty:</span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleQuantityChange(product.id, (quantities[product.id] || 1) - 1);
                      }}
                      className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      disabled={quantities[product.id] <= 1}
                    >
                      <span className="text-xs text-gray-600">-</span>
                    </button>
                    <span className="w-8 text-center text-sm font-medium">
                      {quantities[product.id] || 1}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleQuantityChange(product.id, (quantities[product.id] || 1) + 1);
                      }}
                      className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      disabled={quantities[product.id] >= 999}
                    >
                      <span className="text-xs text-gray-600">+</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleProductSelect(product);
                    }}
                    className="ml-2 text-primary-500 hover:text-primary-700"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProductDisplay
