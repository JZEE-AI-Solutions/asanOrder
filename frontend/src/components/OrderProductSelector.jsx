import { useState, useEffect } from 'react'
import { MagnifyingGlassIcon, XMarkIcon, CheckIcon, PlusIcon, MinusIcon } from '@heroicons/react/24/outline'
import api, { getImageUrl } from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'

function getLineKey(line) {
  const vid = line?.productVariantId ?? line?.variantId
  const pid = line?.id
  if (!pid) return ''
  return vid ? `${pid}_${vid}` : pid
}

const OrderProductSelector = ({ 
  tenantId, 
  selectedProducts = [], 
  productQuantities = {},
  productPrices = {},
  onProductsChange,
  onQuantityChange,
  onPriceChange,
  maxProducts = 20,
  showSearch = true 
}) => {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [variantPickerProduct, setVariantPickerProduct] = useState(null)
  const [variantChangeLine, setVariantChangeLine] = useState(null)
  const [productVariantsCache, setProductVariantsCache] = useState({})

  useEffect(() => {
    if (tenantId) {
      fetchProducts()
    }
  }, [tenantId, searchTerm])

  useEffect(() => {
    selectedProducts.forEach(async (line) => {
      const vid = line.productVariantId ?? line.variantId
      if (!vid || !line.id) return
      const inList = products.some(p => p.id === line.id)
      if (inList || productVariantsCache[line.id]) return
      try {
        const res = await api.get(`/product/${line.id}/variants`)
        const variants = res.data?.variants || []
        if (variants.length > 0) {
          setProductVariantsCache(prev => ({
            ...prev,
            [line.id]: { id: line.id, name: line.name || 'Product', variants }
          }))
        }
      } catch (_) { /* ignore */ }
    })
  }, [selectedProducts, products.length])

  const fetchProducts = async () => {
    if (!tenantId) return
    
    setLoading(true)
    try {
      const response = await api.get(`/products/tenant/${tenantId}?search=${searchTerm}&limit=50`)
      setProducts(response.data.products || [])
    } catch (error) {
      console.error('Error fetching products:', error)
      if (error.response?.status !== 401) {
        toast.error('Failed to load products')
      }
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const addProductLine = (product, variant = null) => {
    const newLine = variant
      ? {
          ...product,
          id: product.id,
          productVariantId: variant.id,
          variantId: variant.id,
          color: variant.color ?? product.color,
          size: variant.size ?? product.size
        }
      : { ...product }
    const newProducts = [...selectedProducts, newLine]
    onProductsChange(newProducts)
    const lineKey = getLineKey(newLine)
    if (onQuantityChange) onQuantityChange(lineKey, 1)
    if (onPriceChange) onPriceChange(lineKey, product.lastSalePrice || product.price || 0)
    setVariantPickerProduct(null)
  }

  const toggleProductSelection = (product) => {
    const isSelected = selectedProducts.some(p => p.id === product.id)
    if (isSelected) {
      const idx = selectedProducts.findIndex(p => p.id === product.id)
      const newProducts = idx === -1 ? selectedProducts : selectedProducts.filter((_, i) => i !== idx)
      onProductsChange(newProducts)
    } else {
      if (selectedProducts.length >= maxProducts) {
        toast.error(`Maximum ${maxProducts} products allowed`)
        return
      }
      if (product.hasVariants && product.variants?.length > 0) {
        setVariantPickerProduct(product)
      } else {
        addProductLine(product)
      }
    }
  }

  const removeProduct = (line) => {
    const key = getLineKey(line)
    onProductsChange(selectedProducts.filter(p => getLineKey(p) !== key))
  }

  const changeLineVariant = (oldLine, newVariant) => {
    const oldKey = getLineKey(oldLine)
    const newLine = {
      ...oldLine,
      productVariantId: newVariant.id,
      variantId: newVariant.id,
      color: newVariant.color ?? null,
      size: newVariant.size ?? null
    }
    const newKey = getLineKey(newLine)
    const qty = productQuantities[oldKey] ?? oldLine.quantity ?? 1
    const price = productPrices[oldKey] ?? oldLine.price ?? 0
    onProductsChange(selectedProducts.map(p => getLineKey(p) === oldKey ? newLine : p))
    if (onQuantityChange) onQuantityChange(newKey, qty)
    if (onPriceChange) onPriceChange(newKey, price)
    setVariantChangeLine(null)
  }

  const handleQuantityChange = (lineKey, quantity) => {
    if (onQuantityChange) onQuantityChange(lineKey, Math.max(0, quantity))
  }

  const handlePriceChange = (lineKey, price) => {
    if (onPriceChange) onPriceChange(lineKey, Math.max(0, parseFloat(price) || 0))
  }

  const displayProducts = showAll ? products : products.slice(0, 6)

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      {showSearch && (
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-600" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-medium"
          />
        </div>
      )}

      {/* Selected Products with Quantity and Price Controls */}
      {selectedProducts.length > 0 && (
        <div className="bg-pink-50 border-2 border-pink-200 rounded-lg p-4">
          <h4 className="font-bold text-gray-900 text-lg mb-3">
            Selected Products ({selectedProducts.length}/{maxProducts})
          </h4>
          <div className="space-y-3">
            {selectedProducts.map((product, idx) => {
              const lineKey = getLineKey(product)
              const qty = productQuantities[lineKey] ?? product.quantity ?? 1
              const price = productPrices[lineKey] ?? product.price ?? 0
              const variantLabel = [product.color, product.size].filter(Boolean).join(' · ')
              const variantId = product.productVariantId ?? product.variantId
              const productImageUrl = getImageUrl('product', product.id, true)
              const lineImageUrl = variantId ? getImageUrl('product-variant', variantId, true) : productImageUrl
              const fullProduct = products.find(p => p.id === product.id)
              const cached = productVariantsCache[product.id]
              const productWithVariants = fullProduct?.variants?.length ? fullProduct : (cached ? { id: cached.id, name: cached.name, variants: cached.variants } : null)
              const canChangeVariant = variantId && productWithVariants?.variants?.length > 0
              return (
                <div key={lineKey || product.id || idx} className="bg-white border-2 border-gray-300 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center space-x-3 mb-3">
                    <img
                      src={lineImageUrl}
                      alt={product.name}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border-2 border-gray-300"
                      onError={(e) => {
                        if (variantId && e.target.src !== productImageUrl) {
                          e.target.src = productImageUrl
                          e.target.onerror = null
                        } else {
                          e.target.style.display = 'none'
                          if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = 'flex'
                        }
                      }}
                    />
                    <div style={{display: 'none'}} className="w-12 h-12 rounded-lg bg-gray-200 border-2 border-gray-300 flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="font-bold text-gray-900 truncate text-base">
                        {product.name}
                      </h5>
                      <p className="text-xs text-gray-700 truncate font-medium mt-0.5">
                        {[product.category, variantLabel].filter(Boolean).join(' • ')}
                      </p>
                      {canChangeVariant && (
                        <button
                          type="button"
                          onClick={() => setVariantChangeLine({ line: product, product: productWithVariants })}
                          className="mt-2 inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-white border-2 border-primary-500 text-primary-600 hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
                        >
                          Change variant
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeProduct(product)}
                      className="text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full p-1.5 transition-colors flex-shrink-0"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-900 mb-1">Quantity</label>
                      <div className="flex items-center space-x-2">
                        <button type="button" onClick={() => handleQuantityChange(lineKey, qty - 1)} className="w-8 h-8 rounded-lg bg-gray-300 hover:bg-gray-400 flex items-center justify-center text-gray-900 font-bold transition-colors">
                          <MinusIcon className="h-4 w-4" />
                        </button>
                        <input type="number" min="1" value={qty} onChange={(e) => handleQuantityChange(lineKey, parseInt(e.target.value) || 1)} className="w-16 px-2 py-1.5 text-center text-sm font-bold bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
                        <button type="button" onClick={() => handleQuantityChange(lineKey, qty + 1)} className="w-8 h-8 rounded-lg bg-gray-300 hover:bg-gray-400 flex items-center justify-center text-gray-900 font-bold transition-colors">
                          <PlusIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-900 mb-1">Sale Price (Rs.)</label>
                      <input type="number" step="0.01" min="0" value={price} onChange={(e) => handlePriceChange(lineKey, e.target.value)} className="w-full px-3 py-1.5 text-sm font-bold bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t-2 border-gray-300 flex justify-between items-center">
                    <span className="text-sm font-bold text-gray-900">Total:</span>
                    <span className="text-base font-bold text-gray-900">Rs. {(qty * price).toLocaleString()}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Products List */}
      <div className="border border-gray-200 rounded-lg">
        <div className="p-4 border-b-2 border-gray-300 bg-gray-50">
          <h4 className="font-bold text-gray-900 text-base">
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
                        src={getImageUrl('product', product.id, true)}
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
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-sm font-medium text-green-600">
                          Rs. {(product.lastSalePrice || product.price || 0).toLocaleString()}
                        </span>
                        {product.lastPurchased && (
                          <span className="text-xs text-gray-400">
                            Last purchased: {new Date(product.lastPurchased).toLocaleDateString()}
                          </span>
                        )}
                      </div>
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

      {/* Variant picker modal when adding a product with variants */}
      {variantPickerProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setVariantPickerProduct(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-4" onClick={e => e.stopPropagation()}>
            <h4 className="font-bold text-gray-900 mb-2">Select variant: {variantPickerProduct.name}</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {variantPickerProduct.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => addProductLine(variantPickerProduct, v)}
                  className="w-full text-left px-3 py-2 rounded-lg border-2 border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-colors"
                >
                  <span className="font-medium text-gray-900">
                    {[v.color, v.size].filter(Boolean).join(' · ') || v.sku || `Variant ${v.id.slice(0, 6)}`}
                  </span>
                  {v.currentQuantity != null && (
                    <span className="text-xs text-gray-500 ml-2">Stock: {v.currentQuantity}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setVariantPickerProduct(null)} className="px-3 py-1.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change variant modal when editing an order line */}
      {variantChangeLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setVariantChangeLine(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-4" onClick={e => e.stopPropagation()}>
            <h4 className="font-bold text-gray-900 mb-2">Change variant: {variantChangeLine.product.name}</h4>
            <p className="text-sm text-gray-600 mb-3">Select a different variant (e.g. if the ordered variant is no longer available).</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {variantChangeLine.product.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => changeLineVariant(variantChangeLine.line, v)}
                  className="w-full text-left px-3 py-2 rounded-lg border-2 border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-colors"
                >
                  <span className="font-medium text-gray-900">
                    {[v.color, v.size].filter(Boolean).join(' · ') || v.sku || `Variant ${v.id.slice(0, 6)}`}
                  </span>
                  {v.currentQuantity != null && (
                    <span className="text-xs text-gray-500 ml-2">Stock: {v.currentQuantity}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setVariantChangeLine(null)} className="px-3 py-1.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrderProductSelector
