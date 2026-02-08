import { useState, useEffect } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import api, { getImageUrl } from '../services/api'
import toast from 'react-hot-toast'

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
  const [productVariants, setProductVariants] = useState({}) // productId -> variants[]
  const [selectedVariants, setSelectedVariants] = useState({}) // productId -> variant object
  const [variantInputs, setVariantInputs] = useState({}) // productId -> {color, size}
  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0) // for product media gallery

  // Sync selectedItems with selectedProducts when selectedProducts changes
  useEffect(() => {
    setSelectedItems(selectedProducts || [])
  }, [selectedProducts])

  // Seed productVariants from products that already have variants (e.g. from by-ids with images)
  useEffect(() => {
    if (!products?.length) return
    setProductVariants(prev => {
      let next = { ...prev }
      products.forEach(p => {
        if (p.hasVariants && p.variants?.length && !next[p.id]) {
          next = { ...next, [p.id]: p.variants }
        }
      })
      return next
    })
  }, [products])

  // Fetch variants when product changes and has variants (if not already seeded)
  useEffect(() => {
    if (currentProduct && currentProduct.hasVariants && !productVariants[currentProduct.id]) {
      fetchProductVariants(currentProduct.id)
    }
  }, [currentProduct])

  // Fetch variants for a product
  const fetchProductVariants = async (productId) => {
    if (!productId) return

    try {
      const response = await api.get(`/product/${productId}/variants`)
      if (response.data.variants) {
        setProductVariants(prev => ({
          ...prev,
          [productId]: response.data.variants || []
        }))
      }
    } catch (error) {
      console.error('Error fetching variants:', error)
      setProductVariants(prev => ({
        ...prev,
        [productId]: []
      }))
    }
  }

  // Handle variant selection or creation
  const handleVariantChange = (productId, color, size) => {
    setVariantInputs(prev => ({
      ...prev,
      [productId]: { color: color || '', size: size || '' }
    }))

    // Try to find existing variant
    const variants = productVariants[productId] || []
    const matchingVariant = variants.find(v => 
      v.color === color && (v.size || '') === (size || '')
    )

    if (matchingVariant) {
      setSelectedVariants(prev => ({
        ...prev,
        [productId]: matchingVariant
      }))
    } else {
      // Clear variant selection if no match
      setSelectedVariants(prev => {
        const updated = { ...prev }
        delete updated[productId]
        return updated
      })
    }
  }

  // Create new variant
  const handleCreateVariant = async (productId) => {
    const inputs = variantInputs[productId]
    if (!inputs || !inputs.color) {
      toast.error('Color is required')
      return
    }

    const product = products.find(p => p.id === productId)
    if (product?.isStitched && !inputs.size) {
      toast.error('Size is required for stitched products')
      return
    }

    try {
      const response = await api.post(`/product/${productId}/variants`, {
        color: inputs.color.trim(),
        size: inputs.size?.trim() || null,
        currentQuantity: 0,
        isActive: true
      })
      
      if (response.data.variant) {
        toast.success('Variant created successfully')
        await fetchProductVariants(productId)
        handleVariantChange(productId, inputs.color, inputs.size)
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to create variant'
      toast.error(errorMsg)
    }
  }

  const currentProduct = products[currentIndex]
  const totalProducts = products.length

  // Reset gallery selection when product changes
  useEffect(() => {
    setSelectedMediaIndex(0)
  }, [currentIndex])

  const handleProductSelect = (product) => {
    const isSelected = selectedItems.some(item => {
      const itemKey = item.variantId ? `${item.id}-${item.variantId}` : item.id
      const productKey = selectedVariants[product.id] ? `${product.id}-${selectedVariants[product.id].id}` : product.id
      return itemKey === productKey
    })
    
    if (isSelected) {
      // Remove product
      const newSelection = selectedItems.filter(item => {
        const itemKey = item.variantId ? `${item.id}-${item.variantId}` : item.id
        const productKey = selectedVariants[product.id] ? `${product.id}-${selectedVariants[product.id].id}` : product.id
        return itemKey !== productKey
      })
      const newQuantities = { ...quantities }
      const productKey = selectedVariants[product.id] ? `${product.id}-${selectedVariants[product.id].id}` : product.id
      delete newQuantities[productKey]
      setSelectedItems(newSelection)
      setQuantities(newQuantities)
      
      // Clean up variant selection
      setSelectedVariants(prev => {
        const updated = { ...prev }
        delete updated[product.id]
        return updated
      })
      setVariantInputs(prev => {
        const updated = { ...prev }
        delete updated[product.id]
        return updated
      })
      
      onSelectionChange?.(newSelection, newQuantities)
    } else {
      // Add product (check max limit)
      if (selectedItems.length >= maxSelections) {
        return
      }
      
      // For variant products, require variant selection
      if (product.hasVariants && !selectedVariants[product.id]) {
        toast.error('Please select a variant (color and size) before adding to selection')
        return
      }
      
      const variant = selectedVariants[product.id]
      const productWithVariant = {
        ...product,
        variantId: variant?.id || null,
        productVariantId: variant?.id || null,
        color: variant?.color || variantInputs[product.id]?.color || null,
        size: variant?.size || variantInputs[product.id]?.size || null
      }
      
      const newSelection = [...selectedItems, productWithVariant]
      const productKey = variant ? `${product.id}-${variant.id}` : product.id
      const newQuantities = { ...quantities, [productKey]: 1 } // Default quantity is 1
      setSelectedItems(newSelection)
      setQuantities(newQuantities)
      onSelectionChange?.(newSelection, newQuantities)
    }
  }

  const getProductKey = (item) => (item.variantId ?? item.productVariantId) ? `${item.id}-${item.variantId ?? item.productVariantId}` : item.id

  const handleQuantityChange = (quantityKey, quantity) => {
    const newQuantity = Math.max(1, Math.min(999, parseInt(quantity) || 1))
    const newQuantities = { ...quantities, [quantityKey]: newQuantity }
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
          {/* Product Image / Video & Gallery */}
          <div className="space-y-4">
            {(() => {
              const mediaList = currentProduct.productImages || []
              const hasGallery = mediaList.length > 0
              const activeMedia = hasGallery ? mediaList[selectedMediaIndex] || mediaList[0] : null
              const mainUrl = hasGallery && activeMedia
                ? getImageUrl('product', currentProduct.id, true, activeMedia.id)
                : getImageUrl('product', currentProduct.id, true)
              const isVideo = activeMedia?.mediaType?.startsWith('video/')
              return (
                <>
                  <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden shadow-inner">
                    {hasGallery && activeMedia ? (
                      isVideo ? (
                        <video
                          src={mainUrl}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          autoPlay
                          loop
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={mainUrl}
                          alt={currentProduct.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex'
                          }}
                        />
                      )
                    ) : (
                      <>
                        <img
                          src={mainUrl}
                          alt={currentProduct.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex'
                          }}
                        />
                        <div style={{ display: 'none' }} className="w-full h-full flex items-center justify-center">
                          <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Product media gallery thumbnails */}
                  {hasGallery && mediaList.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {mediaList.map((media, idx) => {
                        const thumbUrl = getImageUrl('product', currentProduct.id, true, media.id)
                        const isThumbVideo = media.mediaType?.startsWith('video/')
                        return (
                          <button
                            key={media.id}
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedMediaIndex(idx) }}
                            className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                              selectedMediaIndex === idx ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {isThumbVideo ? (
                              <video src={thumbUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                            ) : (
                              <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Product thumbnails (switch between products) */}
                  {totalProducts > 1 && (
                    <div className="flex space-x-2 overflow-x-auto pb-2">
                      {products.map((product, index) => {
                        const primaryMedia = product.productImages?.[0]
                        const isProductVideo = primaryMedia?.mediaType?.startsWith('video/')
                        const productThumbUrl = primaryMedia ? getImageUrl('product', product.id, false, primaryMedia.id) : getImageUrl('product', product.id)
                        return (
                          <button
                            key={product.id}
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToSlide(index) }}
                            className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${
                              index === currentIndex ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {isProductVideo ? (
                              <video src={productThumbUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                            ) : (
                              <img
                                src={productThumbUrl}
                                alt={product.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = 'none'
                                  if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex'
                                }}
                              />
                            )}
                            <div style={{ display: 'none' }} className="w-full h-full bg-gray-100 flex items-center justify-center">
                              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )
            })()}
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
              {(currentProduct.price !== undefined || currentProduct.currentRetailPrice) && (
                <div className="flex items-center">
                  <span className="text-sm font-medium text-gray-500 w-20">Price:</span>
                  <span className="text-lg font-bold text-green-600">
                    Rs. {((currentProduct.price !== undefined && currentProduct.price !== null) 
                      ? (typeof currentProduct.price === 'number' ? currentProduct.price : parseFloat(currentProduct.price) || 0)
                      : (currentProduct.currentRetailPrice ? parseFloat(currentProduct.currentRetailPrice) || 0 : 0)
                    ).toLocaleString()}
                  </span>
                </div>
              )}
              
              {currentProduct.category && (
                <div className="flex items-center">
                  <span className="text-sm font-medium text-gray-500 w-20">Category:</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                    {currentProduct.category}
                  </span>
                </div>
              )}

              {/* Variant Selection - Show when product has variants */}
              {currentProduct.hasVariants && (
                <div className="border-t pt-4 mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Variant
                  </label>
                  
                  {/* Variant cards with thumbnails (image/video) */}
                  {productVariants[currentProduct.id] && productVariants[currentProduct.id].length > 0 && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-gray-700 mb-2">Choose variant</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                        {productVariants[currentProduct.id]
                          .filter(v => v.isActive)
                          .map(variant => {
                            const isSelected = selectedVariants[currentProduct.id]?.id === variant.id
                            const primaryImg = variant.images?.[0]
                            const isVid = primaryImg?.imageType?.startsWith('video/')
                            const variantThumbUrl = getImageUrl('product-variant', variant.id, true, primaryImg?.id)
                            return (
                              <button
                                key={variant.id}
                                type="button"
                                onClick={() => handleVariantChange(currentProduct.id, variant.color, variant.size || '')}
                                className={`text-left p-2 rounded-lg border-2 transition-all ${
                                  isSelected ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200' : 'border-gray-200 hover:border-primary-300 bg-white'
                                }`}
                              >
                                <div className="w-full aspect-square rounded overflow-hidden bg-gray-100 mb-1">
                                  {isVid ? (
                                    <video src={variantThumbUrl} className="w-full h-full object-cover" muted playsInline autoPlay loop preload="metadata" />
                                  ) : (
                                    <img
                                      src={variantThumbUrl}
                                      alt={`${variant.color} ${variant.size || ''}`}
                                      className="w-full h-full object-cover"
                                      onError={(e) => { e.target.style.display = 'none'; if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex' }}
                                    />
                                  )}
                                  <div style={{ display: 'none' }} className="w-full h-full flex items-center justify-center text-gray-400 text-xs bg-gray-100">
                                    {variant.color?.[0] || 'V'}
                                  </div>
                                </div>
                                <div className="text-xs font-medium text-gray-900 truncate">{variant.color}{variant.size ? `, ${variant.size}` : ''}</div>
                                <div className="text-xs text-gray-500">Stock: {variant.currentQuantity}</div>
                              </button>
                            )
                          })}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Color <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={variantInputs[currentProduct.id]?.color || ''}
                        onChange={(e) => handleVariantChange(currentProduct.id, e.target.value, variantInputs[currentProduct.id]?.size || '')}
                        className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                        placeholder="Enter color"
                        list={`color-options-${currentProduct.id}`}
                      />
                      {productVariants[currentProduct.id] && productVariants[currentProduct.id].length > 0 && (
                        <datalist id={`color-options-${currentProduct.id}`}>
                          {[...new Set(productVariants[currentProduct.id].map(v => v.color))].map(color => (
                            <option key={color} value={color} />
                          ))}
                        </datalist>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Size {currentProduct.isStitched && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="text"
                        value={variantInputs[currentProduct.id]?.size || ''}
                        onChange={(e) => handleVariantChange(currentProduct.id, variantInputs[currentProduct.id]?.color || '', e.target.value)}
                        className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                        placeholder={currentProduct.isStitched ? "Required" : "Optional"}
                        list={`size-options-${currentProduct.id}`}
                      />
                      {productVariants[currentProduct.id] && productVariants[currentProduct.id].length > 0 && (
                        <datalist id={`size-options-${currentProduct.id}`}>
                          {[...new Set(productVariants[currentProduct.id].map(v => v.size).filter(Boolean))].map(size => (
                            <option key={size} value={size} />
                          ))}
                        </datalist>
                      )}
                    </div>
                  </div>
                  
                  {(!selectedVariants[currentProduct.id] || 
                    !productVariants[currentProduct.id]?.some(v => 
                      v.id === selectedVariants[currentProduct.id]?.id
                    )) && (
                    <button
                      type="button"
                      onClick={() => handleCreateVariant(currentProduct.id)}
                      className="w-full mt-3 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium"
                    >
                      Create New Variant
                    </button>
                  )}
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
                          handleQuantityChange(
                            selectedVariants[currentProduct.id] ? `${currentProduct.id}-${selectedVariants[currentProduct.id].id}` : currentProduct.id,
                            (quantities[selectedVariants[currentProduct.id] ? `${currentProduct.id}-${selectedVariants[currentProduct.id].id}` : currentProduct.id] || 1) - 1
                          );
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
                        value={quantities[selectedVariants[currentProduct.id] ? `${currentProduct.id}-${selectedVariants[currentProduct.id].id}` : currentProduct.id] || 1}
                        onChange={(e) => handleQuantityChange(selectedVariants[currentProduct.id] ? `${currentProduct.id}-${selectedVariants[currentProduct.id].id}` : currentProduct.id, e.target.value)}
                        className="w-16 text-center border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleQuantityChange(
                            selectedVariants[currentProduct.id] ? `${currentProduct.id}-${selectedVariants[currentProduct.id].id}` : currentProduct.id,
                            (quantities[selectedVariants[currentProduct.id] ? `${currentProduct.id}-${selectedVariants[currentProduct.id].id}` : currentProduct.id] || 1) + 1
                          );
                        }}
                        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        disabled={(quantities[selectedVariants[currentProduct.id] ? `${currentProduct.id}-${selectedVariants[currentProduct.id].id}` : currentProduct.id] || 1) >= 999}
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
            {selectedItems.map((product) => {
              const variant = product.variantId ? (productVariants[product.id] || []).find(v => v.id === product.variantId) : null
              const mediaType = variant?.images?.[0]?.imageType ?? product.productImages?.[0]?.mediaType
              const isVideo = mediaType?.startsWith('video/')
              const thumbUrl = variant
                ? getImageUrl('product-variant', variant.id, true, variant.images?.[0]?.id)
                : getImageUrl('product', product.id, true, product.productImages?.[0]?.id)
              return (
                <div
                  key={getProductKey(product)}
                  className="flex items-center justify-between bg-white border border-primary-200 rounded-lg px-3 py-2 text-sm"
                >
                  <div className="flex items-center min-w-0">
                    <div className="flex-shrink-0 w-8 h-8 rounded overflow-hidden bg-gray-100 mr-2">
                      {isVideo ? (
                        <video src={thumbUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                      ) : (
                        <img
                          src={thumbUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex'
                          }}
                        />
                      )}
                      <div style={{ display: 'none' }} className="w-full h-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <span className="text-primary-900 truncate block">{product.name}</span>
                      {(product.color || product.variantId || product.productVariantId) && (
                        <div className="text-xs text-gray-500">{product.color}{product.size ? `, ${product.size}` : ''}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <span className="text-xs text-gray-500">Qty:</span>
                    <div className="flex items-center space-x-1">
                      {(() => {
                        const qKey = getProductKey(product)
                        const qty = quantities[qKey] || 1
                        return (
                          <>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleQuantityChange(qKey, qty - 1) }}
                              className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-primary-500"
                              disabled={qty <= 1}
                            >
                              <span className="text-xs text-gray-600">-</span>
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{qty}</span>
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleQuantityChange(qKey, qty + 1) }}
                              className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-primary-500"
                              disabled={qty >= 999}
                            >
                              <span className="text-xs text-gray-600">+</span>
                            </button>
                          </>
                        )
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleProductSelect(product) }}
                      className="ml-2 text-primary-500 hover:text-primary-700"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProductDisplay
